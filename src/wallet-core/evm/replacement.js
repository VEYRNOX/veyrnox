// Pending EVM transaction replacement (speed-up / cancel).
//
// The provider is untrusted (I5), so every signing attempt re-reads the
// original transaction and AUTHENTICATES it: the signed payload is rebuilt with
// ethers, its hash is recomputed and its sender recovered from the signature.
// Fields the RPC returns are used only after they hash to the requested
// transaction and recover to this wallet. The receipt must still be absent, the
// latest CONFIRMED nonce must not have passed the original nonce, and the live
// chain id must match. The private key is obtained only after step-up and the
// fresh pre-sign gate have explicitly allowed the action.
//
// I3: every exported entry point refuses in a deniability (decoy/hidden) or
// demo session, and re-checks after each await, before any further RPC call or
// broadcast, because the session can change while a gate is pending.

import { Transaction, Wallet, getAddress, isAddress, isHexString } from 'ethers';
import { getProvider } from './provider.js';
import { getNetwork } from './networks.js';
import { MAX_BASE_FEE_GWEI, MAX_TIP_WEI } from './fees.js';
import { applyEstimatedGasLimit, verifyLiveChainId } from './preflight.js';
import { bumpEip1559Fees, replacementFeesWithLiveFloor } from './replacement-fees.js';
import { presignGateOrReject } from '../../sign-gate/presignOrReject.js';
import { isDeniabilityOrDemoActive } from '../deniabilitySession.js';

export const REPLACEMENT_ACTION = Object.freeze({
  SPEED_UP: 'speed_up',
  CANCEL: 'cancel',
});

const MAX_NONCE = 1_000_000;
const MAX_GAS_LIMIT = 1_000_000n;
const GWEI = 1_000_000_000n;

// Error codes this module throws BEFORE a signed replacement can have been
// handed to the network. Anything else (including an error from the broadcast
// itself or a key-access failure mid-operation) has an UNCERTAIN outcome and
// the UI must not say "nothing was signed".
const PRESIGN_REJECTION_CODES = Object.freeze([
  'REPLACEMENT_ACTION_INVALID',
  'REPLACEMENT_HASH_INVALID',
  'REPLACEMENT_NONCE_INVALID',
  'REPLACEMENT_SENDER_INVALID',
  'REPLACEMENT_UNAVAILABLE',
  'REPLACEMENT_GATE_UNAVAILABLE',
  'REPLACEMENT_REVIEW_REQUIRED',
  'REPLACEMENT_REVIEW_CHANGED',
  'REPLACEMENT_EIP1559_REQUIRED',
  'REPLACEMENT_KEY_MISMATCH',
  'REPLACEMENT_IN_FLIGHT',
  'REPLACEMENT_FEE_UNSAFE',
  'REPLACEMENT_LIVE_FEE_UNSAFE',
  'REPLACEMENT_LIVE_FEE_UNAVAILABLE',
  'ORIGINAL_TX_UNAVAILABLE',
  'ORIGINAL_TX_CONFIRMED',
  'ORIGINAL_TX_UNVERIFIED',
  'ORIGINAL_TX_SENDER_MISMATCH',
  'ORIGINAL_TX_CHAIN_MISMATCH',
  'ORIGINAL_TX_INVALID',
  'ORIGINAL_TX_GAS_INVALID',
  'ORIGINAL_TX_FEE_INVALID',
  'ORIGINAL_TX_FEE_UNSAFE',
  'ORIGINAL_NONCE_GONE',
  'STEP_UP_REQUIRED',
  'PRESIGN_BLOCKED',
]);

/** True only for a known rejection raised before any replacement was signed. */
export function isReplacementPreSignRejection(err) {
  return typeof err?.code === 'string' && PRESIGN_REJECTION_CODES.includes(err.code);
}

function replacementError(code, message) {
  return Object.assign(new Error(message), { code });
}

function assertEgressAllowed() {
  let blocked;
  try {
    blocked = isDeniabilityOrDemoActive();
  } catch {
    blocked = true;
  }
  if (blocked !== false) {
    throw replacementError('REPLACEMENT_UNAVAILABLE', 'Transaction replacement is unavailable in this session.');
  }
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

function feeCeilings(network) {
  const maxBaseFeeWei = (MAX_BASE_FEE_GWEI[network.key] ?? 5_000n) * GWEI;
  return { maxBaseFeeWei, maxTipWei: MAX_TIP_WEI, maxFeeWei: maxBaseFeeWei + MAX_TIP_WEI };
}

function originalFingerprint(tx) {
  return JSON.stringify({
    hash: tx.hash.toLowerCase(),
    from: tx.from.toLowerCase(),
    to: tx.to == null ? null : tx.to.toLowerCase(),
    nonce: tx.nonce,
    value: tx.value.toString(),
    data: tx.data,
    gasLimit: tx.gasLimit.toString(),
    maxFeePerGas: tx.maxFeePerGas.toString(),
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas.toString(),
    chainId: tx.chainId.toString(),
    accessList: tx.accessList,
  });
}

/**
 * Rebuild the signed type-2 transaction from the RPC fields, then require that
 * it hashes to the requested hash and that its signature recovers to this
 * wallet. Returns ONLY the authenticated fields; nothing else from the RPC
 * response is used for signing.
 */
function authenticateOriginal(tx, { originalHash, expectedFrom }) {
  if (tx.type == null || Number(tx.type) !== 2) {
    throw replacementError('REPLACEMENT_EIP1559_REQUIRED', 'Only EIP-1559 pending transactions can be replaced here.');
  }
  let signed;
  try {
    signed = Transaction.from({
      type: 2,
      chainId: tx.chainId,
      nonce: tx.nonce,
      to: tx.to ?? null,
      value: tx.value ?? 0n,
      data: tx.data || '0x',
      gasLimit: tx.gasLimit,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      accessList: tx.accessList ?? [],
      signature: tx.signature ?? null,
    });
  } catch {
    signed = null;
  }
  const hash = signed?.signature ? signed.hash : null;
  if (!hash || hash.toLowerCase() !== originalHash.toLowerCase()) {
    throw replacementError('ORIGINAL_TX_UNVERIFIED', 'The RPC returned transaction details that do not match the signed original.');
  }
  let from;
  try {
    from = getAddress(signed.from);
  } catch {
    from = null;
  }
  if (!from || from !== getAddress(expectedFrom)) {
    throw replacementError('ORIGINAL_TX_SENDER_MISMATCH', 'The original transaction was not sent by this wallet.');
  }
  return {
    hash,
    from,
    to: signed.to == null ? null : getAddress(signed.to),
    nonce: signed.nonce,
    value: signed.value,
    data: signed.data,
    gasLimit: signed.gasLimit,
    maxFeePerGas: signed.maxFeePerGas,
    maxPriorityFeePerGas: signed.maxPriorityFeePerGas,
    chainId: signed.chainId,
    accessList: signed.accessList.map((e) => ({ address: e.address, storageKeys: [...e.storageKeys] })),
  };
}

function validateOriginal(raw, { originalHash, expectedFrom, network }) {
  if (!raw || String(raw.hash || '').toLowerCase() !== originalHash.toLowerCase()) {
    throw replacementError('ORIGINAL_TX_UNAVAILABLE', 'The pending transaction is no longer available from this RPC.');
  }
  if (raw.blockNumber != null || raw.blockHash != null) {
    throw replacementError('ORIGINAL_TX_CONFIRMED', 'The original transaction has already been confirmed.');
  }
  if (raw.maxFeePerGas == null || raw.maxPriorityFeePerGas == null) {
    throw replacementError('REPLACEMENT_EIP1559_REQUIRED', 'Only EIP-1559 pending transactions can be replaced here.');
  }
  const tx = authenticateOriginal(raw, { originalHash, expectedFrom });

  if (tx.chainId !== BigInt(network.chainId)) {
    throw replacementError('ORIGINAL_TX_CHAIN_MISMATCH', 'The original transaction belongs to a different network.');
  }
  assertPlausibleNonce(tx.nonce, 'transaction nonce');
  const { maxFeeWei } = feeCeilings(network);
  if (tx.gasLimit <= 0n || tx.gasLimit > MAX_GAS_LIMIT) {
    throw replacementError('ORIGINAL_TX_GAS_INVALID', 'The original transaction gas limit is outside the safe range.');
  }
  if (tx.maxPriorityFeePerGas > tx.maxFeePerGas) {
    throw replacementError('ORIGINAL_TX_FEE_INVALID', 'The original transaction fee fields are invalid.');
  }
  if (tx.maxFeePerGas > maxFeeWei || tx.maxPriorityFeePerGas > MAX_TIP_WEI) {
    throw replacementError('ORIGINAL_TX_FEE_UNSAFE', 'The original transaction fee is above this network’s safety ceiling.');
  }
  return tx;
}

async function readPendingOriginal({ provider, network, originalHash, expectedFrom }) {
  assertEgressAllowed();
  await verifyLiveChainId(provider, network.chainId);
  assertEgressAllowed();
  const raw = await provider.getTransaction(originalHash);
  assertEgressAllowed();
  const tx = validateOriginal(raw, { originalHash, expectedFrom, network });

  // Availability = the original is still served (above), has no receipt, and
  // the latest CONFIRMED nonce has not passed it. The 'pending' nonce is NOT
  // used: a transaction queued behind a nonce gap is still pending (and still
  // returned by getTransaction) while the pending count stays below it.
  const [receipt, latestNonce] = await Promise.all([
    provider.getTransactionReceipt(originalHash),
    provider.getTransactionCount(expectedFrom, 'latest'),
  ]);
  assertEgressAllowed();
  if (receipt != null) {
    throw replacementError('ORIGINAL_TX_CONFIRMED', 'The original transaction has already been confirmed.');
  }
  assertPlausibleNonce(latestNonce, 'latest nonce');
  if (latestNonce > tx.nonce) {
    throw replacementError('ORIGINAL_NONCE_GONE', 'The original nonce is no longer pending. Refresh activity before trying again.');
  }
  return tx;
}

async function readLiveReplacementFees({ provider, network, original }) {
  const [block, feeData] = await Promise.all([
    provider.getBlock('latest'),
    provider.getFeeData(),
  ]);
  assertEgressAllowed();
  const { maxBaseFeeWei, maxTipWei } = feeCeilings(network);
  return replacementFeesWithLiveFloor({
    maxFeePerGas: original.maxFeePerGas,
    maxPriorityFeePerGas: original.maxPriorityFeePerGas,
    liveBaseFeePerGas: block?.baseFeePerGas ?? null,
    liveTipWei: feeData?.maxPriorityFeePerGas ?? null,
    maxBaseFeeWei,
    maxTipWei,
  });
}

/**
 * Load and authenticate a pending transaction, then build the exact replacement
 * the confirmation UI must preview. No signing or broadcasting occurs here.
 */
export async function preparePendingEvmReplacement({ networkKey, originalHash, expectedFrom, action }) {
  assertEgressAllowed();
  assertAction(action);
  assertHash(originalHash);
  if (!isAddress(expectedFrom)) {
    throw replacementError('REPLACEMENT_SENDER_INVALID', 'The active wallet address is invalid.');
  }

  const network = getNetwork(networkKey);
  const provider = getProvider(networkKey);
  const original = await readPendingOriginal({ provider, network, originalHash, expectedFrom });
  const fee = await readLiveReplacementFees({ provider, network, original });

  let gasLimit = original.gasLimit;
  if (action === REPLACEMENT_ACTION.CANCEL) {
    const gas = /** @type {Record<string, bigint>} */ ({});
    await applyEstimatedGasLimit(provider, {
      from: expectedFrom,
      to: expectedFrom,
      value: 0n,
      data: '0x',
    }, gas);
    assertEgressAllowed();
    gasLimit = gas.gasLimit;
  }

  const txRequest = action === REPLACEMENT_ACTION.SPEED_UP
    ? {
        type: 2,
        chainId: network.chainId,
        to: original.to,
        value: original.value,
        data: original.data,
        accessList: original.accessList,
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
    originalMaxFeePerGas: original.maxFeePerGas,
    originalMaxPriorityFeePerGas: original.maxPriorityFeePerGas,
    liveBaseFeePerGas: fee.liveBaseFeePerGas,
    txRequest,
    // Execution gas only (gasLimit x fee cap). L1 data fees charged on top by
    // OP-stack rollups are NOT included; the UI discloses that.
    maxNetworkFeeWei: gasLimit * fee.maxFeePerGas,
  };
}

/** The reviewed fee must meet the 10% bump floor and stay under the ceiling. */
function feesWithinReviewedBounds(request, original, network) {
  const minimum = bumpEip1559Fees({
    maxFeePerGas: original.maxFeePerGas,
    maxPriorityFeePerGas: original.maxPriorityFeePerGas,
  });
  const { maxFeeWei } = feeCeilings(network);
  const maxFee = BigInt(request.maxFeePerGas);
  const priority = BigInt(request.maxPriorityFeePerGas);
  return maxFee >= minimum.maxFeePerGas
    && priority >= minimum.maxPriorityFeePerGas
    && priority <= maxFee
    && priority <= MAX_TIP_WEI
    && maxFee <= maxFeeWei;
}

function validatePrepared(prepared) {
  if (!prepared || typeof prepared !== 'object') {
    throw replacementError('REPLACEMENT_REVIEW_REQUIRED', 'Review the replacement fee before signing.');
  }
  assertAction(prepared.action);
  assertHash(prepared.originalHash);
  if (!isAddress(prepared.from)) throw replacementError('REPLACEMENT_SENDER_INVALID', 'The replacement sender is invalid.');
  const network = getNetwork(prepared.networkKey);
  const request = prepared.txRequest;
  if (!request
      || !Number.isInteger(request.nonce)
      || request.nonce < 0
      || request.nonce > MAX_NONCE
      || request.type !== 2
      || BigInt(request.chainId) !== BigInt(network.chainId)
      || !feesWithinReviewedBounds(request, {
        maxFeePerGas: BigInt(prepared.originalMaxFeePerGas),
        maxPriorityFeePerGas: BigInt(prepared.originalMaxPriorityFeePerGas),
      }, network)
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
  if (request.nonce !== original.nonce || !feesWithinReviewedBounds(request, original, network)) {
    throw replacementError('REPLACEMENT_REVIEW_CHANGED', 'The reviewed replacement changed. Review it again before signing.');
  }

  if (prepared.action === REPLACEMENT_ACTION.SPEED_UP) {
    const sameRecipient = request.to == null && original.to == null
      ? true
      : isAddress(request.to) && original.to != null && getAddress(request.to) === original.to;
    const sameAccessList = JSON.stringify(request.accessList ?? []) === JSON.stringify(original.accessList);
    if (!sameRecipient
        || BigInt(request.value) !== original.value
        || request.data !== original.data
        || BigInt(request.gasLimit) !== original.gasLimit
        || !sameAccessList) {
      throw replacementError('REPLACEMENT_REVIEW_CHANGED', 'A speed-up must preserve every field except its fees. Review it again.');
    }
  }
}

async function signPreparedReplacement({ prepared, privateKey }) {
  assertEgressAllowed();
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
  assertEgressAllowed();
  let txResponse;
  try {
    // The reviewed request is signed exactly as previewed — no fee re-fetch.
    txResponse = await wallet.sendTransaction({ ...prepared.txRequest });
  } catch (cause) {
    throw Object.assign(
      new Error('The replacement may or may not have reached the network.'),
      { code: 'REPLACEMENT_BROADCAST_UNCERTAIN', cause },
    );
  }
  return {
    action: prepared.action,
    from: prepared.from,
    nonce: prepared.txRequest.nonce,
    hash: txResponse.hash,
    explorerUrl: `${network.explorer}/tx/${txResponse.hash}`,
    maxNetworkFeeWei: prepared.maxNetworkFeeWei,
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
  assertEgressAllowed();
  validatePrepared(prepared);
  if (typeof isReauthRequired !== 'function' || typeof withPrivateKey !== 'function') {
    throw replacementError('REPLACEMENT_GATE_UNAVAILABLE', 'Transaction security checks are unavailable — not signing.');
  }

  let needsReauth;
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
  assertEgressAllowed();

  return withPrivateKey((privateKey) => signPreparedReplacement({ prepared, privateKey }));
}

const defaultSleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function receiptStatus(receipt) {
  return receipt?.status === 1 ? 'confirmed' : 'failed';
}

/**
 * Decide which transaction consumed the shared nonce after a replacement was
 * broadcast. Read-only polling; it stops (outcome 'aborted') as soon as the
 * caller aborts or a deniability/demo session begins (I3), and gives up with
 * 'unknown' after maxAttempts.
 *
 * Outcomes:
 *   replacement_won — the replacement has a receipt; the original was replaced.
 *   original_won    — the original has a receipt; the replacement was dropped.
 *   other_won       — the nonce was consumed (seen twice) by neither of these.
 */
export async function reconcileEvmReplacement({
  networkKey,
  originalHash,
  replacementHash,
  from,
  nonce,
  signal,
  intervalMs = 15_000,
  maxAttempts = 80,
  sleep = defaultSleep,
}) {
  assertHash(originalHash);
  assertHash(replacementHash);
  assertPlausibleNonce(nonce, 'replacement nonce');
  if (!isAddress(from)) throw replacementError('REPLACEMENT_SENDER_INVALID', 'The replacement sender is invalid.');
  const provider = getProvider(networkKey);
  const stopped = () => {
    if (signal?.aborted) return true;
    try {
      assertEgressAllowed();
      return false;
    } catch {
      return true;
    }
  };
  let nonceGoneSeen = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) await sleep(intervalMs);
    if (stopped()) return { outcome: 'aborted' };
    try {
      const replacementReceipt = await provider.getTransactionReceipt(replacementHash);
      if (replacementReceipt) return { outcome: 'replacement_won', status: receiptStatus(replacementReceipt) };
      if (stopped()) return { outcome: 'aborted' };
      const originalReceipt = await provider.getTransactionReceipt(originalHash);
      if (originalReceipt) return { outcome: 'original_won', status: receiptStatus(originalReceipt) };
      if (stopped()) return { outcome: 'aborted' };
      const latest = await provider.getTransactionCount(from, 'latest');
      nonceGoneSeen = Number.isInteger(latest) && latest > nonce ? nonceGoneSeen + 1 : 0;
      if (nonceGoneSeen >= 2) return { outcome: 'other_won' };
    } catch {
      // Transient RPC failure: keep polling within the attempt budget.
    }
  }
  return { outcome: 'unknown' };
}
