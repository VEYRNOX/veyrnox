// wallet-core/evm/hw-send.js
//
// Hardware-wallet ETH + ERC-20 signing for Ledger and Trezor.
// BUILT — unverified pending real-device testnet confirmation (no txid yet).
//
// The flow mirrors evm/send.js + evm/token-send.js (same preflight + nonce
// guard + estimated gas) but instead of creating an ethers Wallet from a
// private key, it:
//   Ledger  — serialises an unsigned EIP-1559 tx, calls eth.signTransaction(),
//             reconstructs the signed payload, and broadcasts via the provider.
//   Trezor  — calls TrezorConnect.ethereumSignTransaction() with the same tx
//             fields, reconstructs the signed payload, and broadcasts.
//
// Exports (all callers in SendCrypto.jsx go through THESE — no direct
// trezorSignEvmTx from UI code, issue #961):
//   - signAndBroadcastEvmLedger        (native ETH via Ledger)
//   - signAndBroadcastEvmTrezor        (native ETH via Trezor)
//   - signAndBroadcastEvmTrezorToken   (ERC-20 via Trezor — issue #961 wiring)
//
// No private key ever touches this module. I1 preserved.
//
// I3 DENIABILITY GATE (issue #972, post-#963 hotfix). The old low-level helper
// hw/trezor.js:81 trezorSignEvmTx called requireWebUsb() → checkDeniability()
// at entry, refusing to touch the RPC or the device under a decoy / hidden /
// stealth session. PR #963 moved the Trezor EVM flow into this module but did
// NOT carry that gate over — a direct I3 regression that would (a) hit the RPC,
// (b) prompt the physical device, and (c) potentially broadcast under coercion.
// Every public entrypoint below re-asserts isDeniabilitySessionActive() as its
// FIRST action, throwing TREZOR_DENIABILITY_BLOCKED with the same error string
// the old helper used so downstream UI catches remain identical. Fail-closed
// (I4): the throw lands before getProvider(), before verifyLiveChainId(), and
// before any TrezorConnect / Ledger transport call.

import { Transaction, parseEther, Signature, isAddress, getAddress } from 'ethers';
import Eth from '@ledgerhq/hw-app-eth';
import TrezorConnect from '@trezor/connect-web';
import { getProvider } from './provider.js';
import { getNetwork } from './networks.js';
import { evmFeeOverrides } from './fees.js';
import { verifyLiveChainId, applyEstimatedGasLimit } from './preflight.js';
import { assertDecimalAmount } from '../amount.js';
import { buildTokenTransfer } from './token-send.js';
import { isDeniabilitySessionActive } from '../deniabilitySession.js';

/**
 * I3 gate (issue #972). Throws TREZOR_DENIABILITY_BLOCKED before any provider
 * or device egress when the current session is decoy/hidden. String preserved
 * exactly from the old hw/trezor.js:69 helper for consumer catch-compatibility.
 * Fail-closed (I4): if the marker read throws, refuse.
 */
function assertNotDeniabilitySession() {
  let active;
  try {
    active = isDeniabilitySessionActive();
  } catch {
    active = true;
  }
  if (active) throw new Error('TREZOR_DENIABILITY_BLOCKED');
}

const EVM_PATH = "44'/60'/0'/0/0";

/**
 * Belt-and-suspenders recovery check (M-2 / #746): the device returns only
 * {v, r, s}, so a wrong recovery id from a buggy/malicious device yields a
 * broadcastable tx that recovers to a DIFFERENT sender — silently. Recover the
 * sender from the reconstructed signature and refuse to broadcast on mismatch
 * (fail-closed, I4). Returns the serialized tx only when the recovered sender
 * equals the expected one.
 */
function serializeCheckedSignedTx(txFields, signature, fromAddress) {
  const signed = Transaction.from({ ...txFields, signature });
  if (!signed.from || getAddress(signed.from) !== getAddress(fromAddress)) {
    throw Object.assign(
      new Error(`Hardware signature recovered to ${signed.from ?? 'null'}, expected ${fromAddress} — refusing to broadcast`),
      { code: 'HW_SIGNER_MISMATCH' },
    );
  }
  return signed.serialized;
}

/**
 * Build a fully-populated unsigned EIP-1559 tx (type 2), including nonce,
 * chainId, and gas overrides. Core builder shared by native and ERC-20 paths —
 * callers pre-resolve `to`/`value`/`data` (native: to=recipient, value=parseEther,
 * data='0x'; ERC-20: to=contract, value=0n, data=transfer-calldata). All the
 * preflight checks from evm/send.js apply: chainId verification, gas estimation
 * with +20% headroom (I5 clamped to MAX_GAS_ESTIMATE), pending-nonce sanity
 * window (issue #961 SEND H-1: this is why the UI must NOT bypass this helper).
 */
async function buildUnsignedEvmTxCore({ networkKey, fromAddress, to, value, data = '0x', fee = null }) {
  if (!isAddress(to)) throw new Error('Invalid recipient address');
  const net = getNetwork(networkKey);
  const provider = getProvider(networkKey);
  await verifyLiveChainId(provider, net.chainId);

  const overrides = evmFeeOverrides(fee);
  // Pass `data` too: for an ERC-20 transfer the RPC needs the calldata to
  // estimate correctly (~45–65k); without it, estimateGas returns 21000 for a
  // bare call and the signed tx runs out of gas on-chain.
  await applyEstimatedGasLimit(provider, { from: fromAddress, to, value, data }, overrides);

  const pendingNonce = await provider.getTransactionCount(fromAddress, 'pending');
  if (!Number.isInteger(pendingNonce) || pendingNonce < 0 || pendingNonce > 1_000_000) {
    throw new Error(`RPC returned implausible nonce ${pendingNonce} — refusing to sign`);
  }

  return /** @type {{ to: string, value: bigint, chainId: number, nonce: number, type: number, data: string, gasLimit: bigint, maxFeePerGas: bigint, maxPriorityFeePerGas: bigint }} */ ({
    to,
    value,
    chainId: net.chainId,
    nonce: pendingNonce,
    type: 2,
    data,
    ...overrides,  // gasLimit, maxFeePerGas, maxPriorityFeePerGas
  });
}

/** Native ETH wrapper: value = parseEther(amountEth), data = '0x'. */
async function buildUnsignedEvmTx({ networkKey, fromAddress, to, amountEth, fee = null }) {
  assertDecimalAmount(amountEth, 18);
  return buildUnsignedEvmTxCore({
    networkKey,
    fromAddress,
    to,
    value: parseEther(String(amountEth)),
    data: '0x',
    fee,
  });
}

/**
 * Sign the built txFields via Trezor and broadcast, with the M-2/#746 recovery
 * check. Shared by native and ERC-20 Trezor paths so both go through the same
 * audited HW_SIGNER_MISMATCH gate.
 */
async function trezorSignFieldsAndBroadcast(txFields, fromAddress, networkKey) {
  const net = getNetwork(networkKey);
  const provider = getProvider(networkKey);
  const toHex = (n) => '0x' + BigInt(n).toString(16);

  const result = await TrezorConnect.ethereumSignTransaction({
    path: `m/${EVM_PATH}`,
    transaction: {
      to:                   txFields.to,
      value:                toHex(txFields.value),
      chainId:              txFields.chainId,
      nonce:                toHex(txFields.nonce),
      gasLimit:             toHex(txFields.gasLimit),
      maxFeePerGas:         toHex(txFields.maxFeePerGas),
      maxPriorityFeePerGas: toHex(txFields.maxPriorityFeePerGas),
      data:                 txFields.data,
    },
  });
  if (!result.success) throw new Error((result.payload && 'error' in result.payload ? result.payload.error : null) ?? 'Trezor signing failed');

  const { v, r, s } = result.payload;
  const signed = serializeCheckedSignedTx(
    txFields,
    Signature.from({ v: parseInt(v, 16), r, s }),
    fromAddress,
  );

  const txResponse = await provider.broadcastTransaction(signed);
  return {
    hash: txResponse.hash,
    explorerUrl: `${net.explorer}/tx/${txResponse.hash}`,
    wait: (confirmations = 1) => txResponse.wait(confirmations),
  };
}

/**
 * Sign and broadcast via a connected Ledger. `transport` is the live
 * WebHID transport from HardwareWalletContext.
 *
 * @returns {Promise<{ hash: string, explorerUrl: string, wait: Function }>}
 */
export async function signAndBroadcastEvmLedger({ transport, networkKey, fromAddress, to, amountEth, fee = null }) {
  assertNotDeniabilitySession();
  const net = getNetwork(networkKey);
  const provider = getProvider(networkKey);
  const txFields = await buildUnsignedEvmTx({ networkKey, fromAddress, to, amountEth, fee });

  const unsigned = Transaction.from(txFields);
  const eth = new Eth(transport);
  // Strip 0x prefix — Ledger expects raw hex
  const sig = await eth.signTransaction(EVM_PATH, unsigned.unsignedSerialized.slice(2), null);

  const signed = serializeCheckedSignedTx(txFields, Signature.from({
    v: parseInt(sig.v, 16),
    r: '0x' + sig.r,
    s: '0x' + sig.s,
  }), fromAddress);

  const txResponse = await provider.broadcastTransaction(signed);
  return {
    hash: txResponse.hash,
    explorerUrl: `${net.explorer}/tx/${txResponse.hash}`,
    wait: (confirmations = 1) => txResponse.wait(confirmations),
  };
}

/**
 * Sign and broadcast via Trezor Connect.
 *
 * @returns {Promise<{ hash: string, explorerUrl: string, wait: Function }>}
 */
export async function signAndBroadcastEvmTrezor({ networkKey, fromAddress, to, amountEth, fee = null }) {
  assertNotDeniabilitySession();
  const txFields = await buildUnsignedEvmTx({ networkKey, fromAddress, to, amountEth, fee });
  return trezorSignFieldsAndBroadcast(txFields, fromAddress, networkKey);
}

/**
 * Sign and broadcast an ERC-20 transfer via Trezor Connect (issue #961 SEND
 * H-1). Same preflight discipline as the native path: verifyLiveChainId,
 * applyEstimatedGasLimit (+20% headroom — replaces the UI's old hardcoded
 * 65000n that reverted USDT/permit-token sends), pending-nonce sanity window
 * (0..1_000_000 — replaces the UI's block-tag "latest" that collided on
 * mempool state), and the M-2/#746 HW_SIGNER_MISMATCH recovery check
 * (fail-closed, I4). All balance/decimal checks live in buildTokenTransfer.
 *
 * @returns {Promise<{ hash: string, explorerUrl: string, wait: Function }>}
 */
export async function signAndBroadcastEvmTrezorToken({ networkKey, fromAddress, symbol, to, amount, fee = null }) {
  assertNotDeniabilitySession();
  if (!isAddress(to)) throw new Error('Invalid recipient address');
  const { data, contract } = buildTokenTransfer({ networkKey, symbol, to, amount });
  const txFields = await buildUnsignedEvmTxCore({
    networkKey,
    fromAddress,
    to: contract,     // gas + tx `to` are the token contract
    value: 0n,        // ERC-20 transfer carries no native value
    data,
    fee,
  });
  return trezorSignFieldsAndBroadcast(txFields, fromAddress, networkKey);
}
