// Pending EVM transaction replacement (speed-up / cancel).
//
// The provider is untrusted (I5), so every signing attempt re-reads the
// original transaction, confirms its receipt is still absent, verifies that
// its nonce is still represented in the pending nonce range, and checks the
// live chain id. The private key is obtained only after step-up and the fresh
// pre-sign gate have explicitly allowed the action.

import { Wallet, getAddress, isAddress, isHexString } from 'ethers';
import { getProvider } from './provider.js';
import { getNetwork } from './networks.js';
import { MAX_BASE_FEE_GWEI, MAX_TIP_WEI } from './fees.js';
import { applyEstimatedGasLimit, verifyLiveChainId } from './preflight.js';
import { bumpEip1559Fees } from './replacement-fees.js';
import { presignGateOrReject } from '../../sign-gate/presignOrReject.js';

export const REPLACEMENT_ACTION = Object.freeze({
  SPEED_UP: 'speed_up',
  CANCEL: 'cancel',
});

const MAX_NONCE = 1_000_000;
const MAX_GAS_LIMIT = 1_000_000n;

function replacementError(code, message) {
  return Object.assign(new Error(message), { code });
}

function assertAction(action) {
  if (action !== REPLACEMENT_ACTION.SPEED_UP && action !== REPLACEMENT_ACTION.CANCEL) {
    throw replacementError('REPLACEMENT_ACTION_INVALID', 'Choose speed up or cancel.');
  }
}

function assertHash(hash) {
  if (!isHexString(hash, 32)) {
    throw replacementError('REPLACEMENT_HASH_INVALID', 'The original transaction hash is invalid.');
  }
}

function assertPlausibleNonce(value, field) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_NONCE) {
    throw replacementError('REPLACEMENT_NONCE_INVALID', `RPC returned an implausible ${field}.`);
  }
}

function originalFingerprint(tx) {
  return JSON.stringify({
    hash: String(tx.hash || '').toLowerCase(),
    from: String(tx.from || '').toLowerCase(),
    to: tx.to == null ? null : String(tx.to).toLowerCase(),
    nonce: tx.nonce,
    value: BigInt(tx.value ?? 0n).toString(),
    data: tx.data || '0x',
    gasLimit: BigInt(tx.gasLimit).toString(),
    maxFeePerGas: BigInt(tx.maxFeePerGas).toString(),
    maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas).toString(),
    chainId: BigInt(tx.chainId).toString(),
    accessList: tx.accessList ?? null,
  });
}

function validateOriginal(tx, { originalHash, expectedFrom, network }) {
  if (!tx || String(tx.hash || '').toLowerCase() !== originalHash.toLowerCase()) {
    throw replacementError('ORIGINAL_TX_UNAVAILABLE', 'The pending transaction is no longer available from this RPC.');
  }
  if (tx.blockNumber != null || tx.blockHash != null) {
    throw replacementError('ORIGINAL_TX_CONFIRMED', 'The original transaction has already been confirmed.');
  }
  if (!isAddress(tx.from) || getAddress(tx.from) !== getAddress(expectedFrom)) {
    throw replacementError('ORIGINAL_TX_SENDER_MISMATCH', 'The original transaction was not sent by this wallet.');
  }
  if (BigInt(tx.chainId) !== BigInt(network.chainId)) {
    throw replacementError('ORIGINAL_TX_CHAIN_MISMATCH', 'The original transaction belongs to a different network.');
  }
  assertPlausibleNonce(tx.nonce, 'transaction nonce');
  if (tx.to != null && !isAddress(tx.to)) {
    throw replacementError('ORIGINAL_TX_INVALID', 'The original transaction recipient is invalid.');
  }
  if (!isHexString(tx.data || '0x')) {
    throw replacementError('ORIGINAL_TX_INVALID', 'The original transaction data is invalid.');
  }
  if (tx.maxFeePerGas == null || tx.maxPriorityFeePerGas == null) {
    throw replacementError('REPLACEMENT_EIP1559_REQUIRED', 'Only EIP-1559 pending transactions can be replaced here.');
  }

  const gasLimit = BigInt(tx.gasLimit);
  const maxFeePerGas = BigInt(tx.maxFeePerGas);
  const maxPriorityFeePerGas = BigInt(tx.maxPriorityFeePerGas);
  const maxConfiguredFee = ((MAX_BASE_FEE_GWEI[network.key] ?? 5_000n) * 1_000_000_000n) + MAX_TIP_WEI;
  if (gasLimit <= 0n || gasLimit > MAX_GAS_LIMIT) {
    throw replacementError('ORIGINAL_TX_GAS_INVALID', 'The original transaction gas limit is outside the safe range.');
  }
  if (maxFeePerGas < 0n || maxPriorityFeePerGas < 0n || maxPriorityFeePerGas > maxFeePerGas) {
    throw replacementError('ORIGINAL_TX_FEE_INVALID', 'The original transaction fee fields are invalid.');
  }
  if (maxFeePerGas > maxConfiguredFee || maxPriorityFeePerGas > MAX_TIP_WEI) {
    throw replacementError('ORIGINAL_TX_FEE_UNSAFE', 'The original transaction fee is above this network’s safety ceiling.');
  }
}

async function readPendingOriginal({ provider, network, originalHash, expectedFrom }) {
  await verifyLiveChainId(provider, network.chainId);
  const tx = await provider.getTransaction(originalHash);
  validateOriginal(tx, { originalHash, expectedFrom, network });

  const [receipt, latestNonce, pendingNonce] = await Promise.all([
    provider.getTransactionReceipt(originalHash),
    provider.getTransactionCount(expectedFrom, 'latest'),
    provider.getTransactionCount(expectedFrom, 'pending'),
  ]);
  if (receipt != null) {
    throw replacementError('ORIGINAL_TX_CONFIRMED', 'The original transaction has already been confirmed.');
  }
  assertPlausibleNonce(latestNonce, 'latest nonce');
  assertPlausibleNonce(pendingNonce, 'pending nonce');
  if (latestNonce > tx.nonce || pendingNonce <= tx.nonce) {
    throw replacementError('ORIGINAL_NONCE_GONE', 'The original nonce is no longer pending. Refresh activity before trying again.');
  }
  return tx;
}

/**
 * Load and validate a pending transaction, then build the exact replacement the
 * confirmation UI must preview. No signing or broadcasting occurs here.
 */
export async function preparePendingEvmReplacement({ networkKey, originalHash, expectedFrom, action }) {
  assertAction(action);
  assertHash(originalHash);
  if (!isAddress(expectedFrom)) {
    throw replacementError('REPLACEMENT_SENDER_INVALID', 'The active wallet address is invalid.');
  }

  const network = getNetwork(networkKey);
  const provider = getProvider(networkKey);
  const original = await readPendingOriginal({ provider, network, originalHash, expectedFrom });
  const fee = bumpEip1559Fees({
    maxFeePerGas: original.maxFeePerGas,
    maxPriorityFeePerGas: original.maxPriorityFeePerGas,
  });

  let gasLimit = BigInt(original.gasLimit);
  if (action === REPLACEMENT_ACTION.CANCEL) {
    const gas = /** @type {Record<string, bigint>} */ ({});
    await applyEstimatedGasLimit(provider, {
      from: expectedFrom,
      to: expectedFrom,
      value: 0n,
      data: '0x',
    }, gas);
    gasLimit = gas.gasLimit;
  }

  const txRequest = action === REPLACEMENT_ACTION.SPEED_UP
    ? {
        type: 2,
        chainId: network.chainId,
        to: original.to,
        value: BigInt(original.value ?? 0n),
        data: original.data || '0x',
        accessList: original.accessList ?? undefined,
        gasLimit,
        maxFeePerGas: fee.maxFeePerGas,
        maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
        nonce: original.nonce,
      }
    : {
        type: 2,
        chainId: network.chainId,
        to: getAddress(expectedFrom),
        value: 0n,
        data: '0x',
        gasLimit,
        maxFeePerGas: fee.maxFeePerGas,
        maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
        nonce: original.nonce,
      };

  return {
    action,
    networkKey,
    originalHash,
    from: getAddress(expectedFrom),
    originalFingerprint: originalFingerprint(original),
    originalMaxFeePerGas: BigInt(original.maxFeePerGas),
    originalMaxPriorityFeePerGas: BigInt(original.maxPriorityFeePerGas),
    txRequest,
    maxNetworkFeeWei: gasLimit * fee.maxFeePerGas,
  };
}

function validatePrepared(prepared) {
  if (!prepared || typeof prepared !== 'object') {
    throw replacementError('REPLACEMENT_REVIEW_REQUIRED', 'Review the replacement fee before signing.');
  }
  assertAction(prepared.action);
  assertHash(prepared.originalHash);
  if (!isAddress(prepared.from)) throw replacementError('REPLACEMENT_SENDER_INVALID', 'The replacement sender is invalid.');
  const expectedFee = bumpEip1559Fees({
    maxFeePerGas: prepared.originalMaxFeePerGas,
    maxPriorityFeePerGas: prepared.originalMaxPriorityFeePerGas,
  });
  const request = prepared.txRequest;
  if (!request
      || !Number.isInteger(request.nonce)
      || request.nonce < 0
      || request.nonce > MAX_NONCE
      || request.type !== 2
      || BigInt(request.maxFeePerGas) !== expectedFee.maxFeePerGas
      || BigInt(request.maxPriorityFeePerGas) !== expectedFee.maxPriorityFeePerGas
      || BigInt(request.gasLimit) <= 0n
      || BigInt(request.gasLimit) > MAX_GAS_LIMIT
      || BigInt(prepared.maxNetworkFeeWei) !== BigInt(request.gasLimit) * BigInt(request.maxFeePerGas)) {
    throw replacementError('REPLACEMENT_REVIEW_CHANGED', 'The reviewed replacement changed. Review it again before signing.');
  }
  if (prepared.action === REPLACEMENT_ACTION.CANCEL
      && (getAddress(request.to) !== getAddress(prepared.from) || BigInt(request.value) !== 0n || request.data !== '0x')) {
    throw replacementError('REPLACEMENT_REVIEW_CHANGED', 'The reviewed cancellation changed. Review it again before signing.');
  }
}

function assertRequestStillMatchesOriginal(prepared, original, network) {
  const request = prepared.txRequest;
  const expectedFee = bumpEip1559Fees({
    maxFeePerGas: original.maxFeePerGas,
    maxPriorityFeePerGas: original.maxPriorityFeePerGas,
  });
  const commonMatches = request.nonce === original.nonce
    && BigInt(request.chainId) === BigInt(network.chainId)
    && BigInt(request.maxFeePerGas) === expectedFee.maxFeePerGas
    && BigInt(request.maxPriorityFeePerGas) === expectedFee.maxPriorityFeePerGas;
  if (!commonMatches) {
    throw replacementError('REPLACEMENT_REVIEW_CHANGED', 'The reviewed replacement changed. Review it again before signing.');
  }

  if (prepared.action === REPLACEMENT_ACTION.SPEED_UP) {
    const sameRecipient = request.to == null && original.to == null
      ? true
      : isAddress(request.to) && isAddress(original.to) && getAddress(request.to) === getAddress(original.to);
    const sameAccessList = JSON.stringify(request.accessList ?? null) === JSON.stringify(original.accessList ?? null);
    if (!sameRecipient
        || BigInt(request.value) !== BigInt(original.value ?? 0n)
        || request.data !== (original.data || '0x')
        || BigInt(request.gasLimit) !== BigInt(original.gasLimit)
        || !sameAccessList) {
      throw replacementError('REPLACEMENT_REVIEW_CHANGED', 'A speed-up must preserve every field except its fees. Review it again.');
    }
  }
}

async function signPreparedReplacement({ prepared, privateKey }) {
  validatePrepared(prepared);
  const network = getNetwork(prepared.networkKey);
  const provider = getProvider(prepared.networkKey);
  const original = await readPendingOriginal({
    provider,
    network,
    originalHash: prepared.originalHash,
    expectedFrom: prepared.from,
  });
  if (originalFingerprint(original) !== prepared.originalFingerprint) {
    throw replacementError('REPLACEMENT_REVIEW_CHANGED', 'The original transaction changed. Review it again before signing.');
  }
  assertRequestStillMatchesOriginal(prepared, original, network);

  const wallet = new Wallet(privateKey, provider);
  if (getAddress(wallet.address) !== getAddress(prepared.from)) {
    throw replacementError('REPLACEMENT_KEY_MISMATCH', 'The active signing key does not match the original sender.');
  }
  const txResponse = await wallet.sendTransaction({ ...prepared.txRequest });
  return {
    action: prepared.action,
    from: prepared.from,
    hash: txResponse.hash,
    explorerUrl: `${network.explorer}/tx/${txResponse.hash}`,
    maxNetworkFeeWei: prepared.maxNetworkFeeWei,
    wait: (confirmations = 1) => txResponse.wait(confirmations),
  };
}

/**
 * Security chokepoint for a reviewed replacement. Re-auth and pre-sign checks
 * run before withPrivateKey is invoked; missing/errored results deny access.
 */
export async function replacePendingEvmTransaction({
  prepared,
  isReauthRequired,
  withPrivateKey,
}) {
  validatePrepared(prepared);
  if (typeof isReauthRequired !== 'function' || typeof withPrivateKey !== 'function') {
    throw replacementError('REPLACEMENT_GATE_UNAVAILABLE', 'Transaction security checks are unavailable — not signing.');
  }

  let needsReauth = true;
  try {
    needsReauth = isReauthRequired();
  } catch {
    needsReauth = true;
  }
  if (needsReauth !== false) {
    throw replacementError('STEP_UP_REQUIRED', 'Re-enter your PIN or password before signing.');
  }

  let gate;
  try {
    gate = await presignGateOrReject();
  } catch {
    gate = null;
  }
  if (gate?.proceedAllowed !== true) {
    throw replacementError('PRESIGN_BLOCKED', 'The pre-sign safety check did not allow this transaction. Nothing was signed.');
  }

  return withPrivateKey((privateKey) => signPreparedReplacement({ prepared, privateKey }));
}
