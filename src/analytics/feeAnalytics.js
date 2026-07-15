// @ts-nocheck
// analytics/feeAnalytics.js
//
// Slice 1 — STATELESS native-unit fee analytics. Pure functions over an active-
// set history result (the shape returned by lib/txHistory.js#fetchAssetHistory).
//
// HARD PROPERTIES (the reason this slice sits OUTSIDE the audit-log decision):
//   - No persistent store. No cache. Recomputed from history on each open. There
//     is no analytics footprint on disk to distinguish real-vs-decoy (I3).
//   - No new egress. Reads only the fee already present in chain data the app
//     fetched (Esplora `fee`, Solana `meta.fee`); never the seed/signer (I1/I2).
//   - No fiat. Native units only — fiat cost basis is Slice 2 (audit-gated).
//   - Fail honest (I4): if history can't be read (EVM has no in-app indexer; a
//     locked wallet is indeterminate) the view is "unavailable", never a guessed
//     or zero figure. A paid tx whose fee the indexer omitted is surfaced as
//     "unknown", never folded into the total.
//
// Active-set-scoped only: callers pass the active set's per-asset history; this
// module never reaches across sets and holds no state between calls.

import { parseUnits, formatUnits } from 'ethers';

// Native-unit decimals by asset family. EVM is listed for completeness but its
// history is never available in-app (no indexer), so it short-circuits to
// "unavailable" before decimals are ever used.
const DECIMALS_BY_FAMILY = { btc: 8, solana: 9, evm: 18, erc20: 18 };

// Trim a fixed-decimal string of trailing zeros (and a dangling dot) so amounts
// read cleanly without losing computed precision. (Mirrors lib/txHistory.js.)
function trimAmount(s) {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

/**
 * Compute native-unit fee analytics for one asset's active-set history.
 *
 * @param {{ supported: boolean, reason?: string, transactions?: Array<object> }} history
 *   The fetchAssetHistory result. `transactions` are normalized rows carrying
 *   `feeNative` (native-unit string | null) and `feePaidByUs` (boolean).
 * @param {{ symbol?: string, family?: string }} asset
 * @returns {object} A view model. When fees can't be honestly read:
 *   `{ available: false, reason, assetSymbol }` — NO numbers offered. Otherwise:
 *   `{ available: true, assetSymbol, paidTxCount, unknownFeeCount,
 *      totalFeeNative, avgFeeNative, maxFeeNative, minFeeNative, perTx[] }`.
 */
export function computeFeeAnalytics(history, asset) {
  const assetSymbol = asset?.symbol ?? null;

  // Unavailable = we cannot honestly read fees. EVM has no in-app indexer; a
  // locked wallet is indeterminate (NOT zero fees). Offer no number either way.
  if (!history?.supported || history.reason === 'locked') {
    return { available: false, reason: history?.reason ?? 'unavailable', assetSymbol };
  }

  const decimals = DECIMALS_BY_FAMILY[asset?.family] ?? 18;
  const txs = Array.isArray(history.transactions) ? history.transactions : [];

  // Only fees THIS set paid. A reported amount counts toward the total; a paid
  // tx whose fee the indexer omitted is surfaced as "unknown", never guessed.
  const paid = txs.filter((t) => t.feePaidByUs);
  const known = paid.filter((t) => t.feeNative != null);
  const unknownFeeCount = paid.length - known.length;

  // Exact summation in integer base units (sats / lamports) — no float drift.
  let totalUnits = 0n;
  let maxUnits = null;
  let minUnits = null;
  for (const t of known) {
    const u = parseUnits(t.feeNative, decimals);
    totalUnits += u;
    if (maxUnits === null || u > maxUnits) maxUnits = u;
    if (minUnits === null || u < minUnits) minUnits = u;
  }

  const fmt = (u) => trimAmount(formatUnits(u, decimals));
  const paidTxCount = known.length;
  const avgFeeNative = paidTxCount
    ? trimAmount((Number(formatUnits(totalUnits, decimals)) / paidTxCount).toFixed(decimals))
    : '0';

  return {
    available: true,
    assetSymbol,
    paidTxCount,
    unknownFeeCount,
    totalFeeNative: fmt(totalUnits),
    avgFeeNative,
    maxFeeNative: maxUnits === null ? '0' : fmt(maxUnits),
    minFeeNative: minUnits === null ? '0' : fmt(minUnits),
    perTx: known.map((t) => ({
      id: t.id,
      hash: t.hash,
      type: t.type,
      status: t.status,
      timestamp: t.timestamp,
      feeNative: t.feeNative,
      explorerUrl: t.explorerUrl,
    })),
  };
}
