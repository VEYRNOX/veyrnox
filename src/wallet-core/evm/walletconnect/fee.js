// @ts-nocheck
// wallet-core/evm/walletconnect/fee.js — pure fee/gas ceiling helpers for the
// WalletConnect signing path.
//
// These lived in lib/WalletConnectProvider.jsx and were moved here (audit
// 2026-08-03 H-7) so the APPROVAL MODAL can compute the worst-case fee from the
// exact same helpers that ENFORCE the ceiling. The modal cannot import them from
// the provider: its test suite mocks that whole module, and a hand-inlined copy
// in a test is precisely the drift this file exists to prevent. The provider
// re-exports everything below, so every existing import and test is unchanged.
//
// All functions are pure and side-effect free. I5 — the dApp is untrusted; every
// value it supplies is parsed defensively and clamped.

import { MAX_BASE_FEE_GWEI } from '@/wallet-core/evm/fees.js';

// M9 — enforce a 1,000,000 gas cap UNCONDITIONALLY, including when the dApp
// omits the `gas` field. Previously the cap only applied to a dApp-supplied
// `gas`; with `gas` omitted, ethers auto-estimated with no ceiling, so a
// malicious dApp could craft a tx that consumes the full block gas limit and
// drain funds. We estimate gas ourselves when omitted, then clamp either value
// (dApp's or our estimate) to the cap. I5 — backend/dApp untrusted by design.
//
// txGas: the dApp-supplied `gas` (hex string, bigint, or undefined).
// estimatedGas: bigint result of provider.estimateGas, used when txGas is absent.
// Returns a bigint <= 1_000_000n.
export const WC_GAS_CAP = 1_000_000n;

export function resolveGasLimit(txGas, estimatedGas) {
  const requested = txGas != null ? BigInt(txGas) : BigInt(estimatedGas);
  return requested > WC_GAS_CAP ? WC_GAS_CAP : requested;
}

// F-02-GASCAP — a dApp-supplied `maxFeePerGas` was set directly with no ceiling,
// letting a malicious dApp pin an arbitrarily large fee. Clamp it to the same
// per-chain ceiling used by the in-app fee path (MAX_BASE_FEE_GWEI from fees.js).
// The map is keyed by baseFee gwei; maxFeePerGas is buffered above baseFee, so we
// use the same cap as an upper bound (I5 — dApp untrusted).
// Fail closed (I4): if the raw value is absent or cannot be parsed to a BigInt,
// return null so the caller SKIPS setting maxFeePerGas rather than constructing a
// bad tx. An unknown networkKey falls back to the mainnet cap (the lowest, safest).
export function resolveMaxFeePerGas(rawMaxFee, networkKey) {
  if (rawMaxFee == null) return null;
  let requested;
  try {
    requested = BigInt(rawMaxFee);
  } catch {
    return null;
  }
  const capGwei = MAX_BASE_FEE_GWEI[networkKey] ?? MAX_BASE_FEE_GWEI.mainnet;
  const cap = capGwei * 1_000_000_000n;
  return requested > cap ? cap : requested;
}

// L-2 — clamp the dApp-supplied maxPriorityFeePerGas so it can never exceed the
// already-capped maxFeePerGas. Under EIP-1559 a priority fee greater than the max
// fee is an invalid transaction; a dApp could also use an uncapped priority fee to
// pin an implausibly large tip. Given the raw dApp value and the resolved (capped)
// max fee, return min(parsed, resolvedMaxFee). Fail closed (I4): an absent, negative
// or unparseable value becomes 0n (the EIP-1559 default), never larger than the cap.
// Pure; exported for unit tests.
export function resolveMaxPriorityFeePerGas(rawPriorityFee, resolvedMaxFee) {
  // #1115: when both feeData.maxFeePerGas and feeData.gasPrice are nullish,
  // cappedMaxFeePerGas is undefined. The BigInt comparison `parsed > undefined`
  // throws "Cannot mix BigInt and other types". Return null so the caller can
  // let ethers/RPC populate fees rather than crash with an opaque error.
  if (resolvedMaxFee == null) return null;
  let parsed;
  try {
    parsed = BigInt(rawPriorityFee ?? 0);
  } catch {
    parsed = 0n;
  }
  if (parsed < 0n) parsed = 0n;
  return parsed > resolvedMaxFee ? resolvedMaxFee : parsed;
}

// H-7 (audit 2026-08-03) — the MOST this request can cost in fees, in wei.
//
// M9 and F-02-GASCAP already bound this; the defect was that the bound was never
// shown. The approval modal rendered Network / To / Value / calldata and no fee
// row at all, so a dApp could send `value: 0x0` with the fee pinned at the
// ceiling and a callee that burns its gas limit: the user read "0 ETH", ticked
// the acknowledgement boxes, and paid up to ~1 native token on mainnet.
//
// Deliberately a CEILING, not an estimate. The caller must label it as such —
// describing a worst case as an estimate would be its own dishonesty.
//
// Returns null whenever the figure cannot be derived honestly, so the caller
// renders NOTHING rather than a misleading number (I4). In particular, a request
// carrying no fee field at all returns null: the provider fills those from live
// network feeData, which this pure function cannot know, and showing the ceiling
// there would be alarmist and wrong.
//
// @param {object} tx           the dApp-supplied transaction params
// @param {string} networkKey   resolved network key, for the per-chain ceiling
// @returns {bigint|null}       max fee in wei, or null if undeterminable
export function resolveWcWorstCaseFeeWei(tx, networkKey) {
  if (!tx || typeof tx !== 'object' || Array.isArray(tx)) return null;

  // EIP-1559 maxFeePerGas wins; fall back to a legacy gasPrice. Absent both, the
  // network supplies the fee and there is nothing honest to show here.
  const rawFee = tx.maxFeePerGas ?? tx.gasPrice;
  if (rawFee == null) return null;

  // Reuse the ENFORCING helper so the displayed ceiling and the applied ceiling
  // are the same value by construction.
  const cappedFee = resolveMaxFeePerGas(rawFee, networkKey);
  if (cappedFee == null) return null;

  let gasLimit;
  if (tx.gas == null) {
    // The provider estimates and then clamps, so WC_GAS_CAP is the true ceiling.
    gasLimit = WC_GAS_CAP;
  } else {
    try {
      gasLimit = BigInt(tx.gas);
    } catch {
      return null;
    }
    if (gasLimit < 0n) return null;
    if (gasLimit > WC_GAS_CAP) gasLimit = WC_GAS_CAP;
  }

  return cappedFee * gasLimit;
}
