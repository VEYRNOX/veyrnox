// @ts-nocheck
// analytics/spendByPeriod.js
//
// STATELESS spend-by-period aggregation for the Spending Patterns tile. A pure
// function over an active-set history result (the shape returned by
// lib/txHistory.js#fetchAssetHistory). Sibling to analytics/feeAnalytics.js and
// it shares that slice's hard properties:
//   - No persistent store, no cache. Recomputed from history on each open. There
//     is no analytics footprint on disk to distinguish real-vs-decoy (I3).
//   - No new egress. Reads only the send magnitudes already present in the chain
//     history the app fetched on demand; never the seed/signer (I1/I2).
//   - No fiat. Per-asset NATIVE units only — amounts of different assets are NEVER
//     summed into a single total (no honest common denominator without a price).
//   - Outflows only. Spend is sends; receives and balance are never read.
//   - Fail honest / fail closed (I4): if history can't be read (EVM has no in-app
//     indexer; a locked wallet is indeterminate; an undecodable amount) the view
//     is `indeterminate` with NO buckets — never a zero-filled or guessed chart.
//     `empty` (readable, genuinely no sends) is a distinct, honest state.
//
// Active-set-scoped only: callers pass the active set's per-asset history; this
// module never reaches across sets and holds no state between calls.

import { parseUnits, formatUnits } from 'ethers';

// Working precision for display-unit summation. The history's `amount` is a
// trimmed display-unit decimal string (BTC has ≤8 fractional places, SOL ≤9).
// Parsing each at a fixed 18-decimal scale lets us sum exactly in integers (no
// float drift) without needing each asset's own decimals, then format + trim.
const SCALE = 18;

// Trim a fixed-decimal string of trailing zeros (and a dangling dot) so amounts
// read cleanly (0.5, not 0.500000000000000000). (Mirrors lib/txHistory.js.)
function trimAmount(s) {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

// Start-of-period (UTC ms) for the period containing `ts`. Pure: derived only
// from the timestamp it is given — no wall-clock read, no hidden state.
function periodStartFor(ts, granularity) {
  const d = new Date(ts);
  if (granularity === 'week') {
    // Monday-anchored UTC week. getUTCDay: 0=Sun..6=Sat → days since Monday.
    const back = (d.getUTCDay() + 6) % 7;
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back);
  }
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); // month
}

const indeterminate = (granularity) => ({ status: 'indeterminate', granularity, buckets: [] });

/**
 * Aggregate an asset history's outbound sends into per-period, per-asset native
 * totals.
 *
 * @param {{ supported?: boolean, reason?: string, transactions?: Array<object> }} history
 *   The fetchAssetHistory result. `transactions` are normalized rows carrying
 *   `type`, `status`, `assetSymbol`, `amount` (native-unit string) and
 *   `timestamp` (block time in ms, or null while pending).
 * @param {'week'|'month'} [granularity='month']
 * @returns {{ status: string, granularity: string,
 *   buckets: Array<{ periodStart: number, byAsset: Record<string,string> }> }}
 *   buckets are ordered ascending by periodStart; byAsset maps each asset symbol
 *   to its trimmed native-unit total for that period. No cross-asset total.
 */
export function spendByPeriod(history, granularity = 'month') {
  const gran = granularity === 'week' ? 'week' : 'month';

  // Cannot honestly read history → indeterminate, never zero. EVM has no in-app
  // indexer (supported:false); a locked wallet is indeterminate (NOT zero spend).
  if (!history || history.supported === false || history.reason === 'locked') {
    return indeterminate(gran);
  }
  const txs = Array.isArray(history.transactions) ? history.transactions : null;
  if (txs === null) return indeterminate(gran); // malformed history, fail closed

  // Placeable outflows only: a send that actually moved (not failed), with a
  // block time to place on the timeline (pending sends carry timestamp null).
  const sends = txs.filter(
    (t) => t && t.type === 'send' && t.status !== 'failed' && t.timestamp != null && t.amount != null,
  );
  if (sends.length === 0) return { status: 'empty', granularity: gran, buckets: [] };

  // Sum exactly per (period, asset) in integer base units.
  const periods = new Map(); // periodStart -> Map(assetSymbol -> BigInt units)
  for (const t of sends) {
    let units;
    try {
      units = parseUnits(String(t.amount), SCALE);
    } catch {
      // An undecodable amount means this history can't be honestly read — fail
      // closed to indeterminate rather than rendering a partial/guessed chart.
      return indeterminate(gran);
    }
    const ps = periodStartFor(t.timestamp, gran);
    if (!periods.has(ps)) periods.set(ps, new Map());
    const byAsset = periods.get(ps);
    const sym = t.assetSymbol || 'UNKNOWN';
    byAsset.set(sym, (byAsset.get(sym) ?? 0n) + units);
  }

  const buckets = [...periods.keys()]
    .sort((a, b) => a - b)
    .map((periodStart) => {
      const byAsset = {};
      for (const [sym, units] of periods.get(periodStart)) {
        byAsset[sym] = trimAmount(formatUnits(units, SCALE));
      }
      return { periodStart, byAsset };
    });

  return { status: 'ok', granularity: gran, buckets: /** @type {Array<{periodStart:number, byAsset:Record<string,string>}>} */ (buckets) };
}
