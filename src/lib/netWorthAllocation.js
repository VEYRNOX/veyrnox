// lib/netWorthAllocation.js — pure chart-data helper for the Crypto Net Worth view.
//
// Turns the portfolio aggregator's `assetTotals` ({ [symbol]: { amount, usd,
// indeterminate } }) into allocation-donut segments: positive-USD assets only,
// largest first. Indeterminate (failed-read) assets are excluded EXPLICITLY via
// the flag — not by relying on the current `indeterminate ⇒ usd == null` coupling
// — so a future aggregator that kept a stale `usd` alongside `indeterminate:true`
// could never leak bad data into the chart (I4: never treat a failed read as 0).

/**
 * @param {Record<string, { amount?: number, usd?: number|null, indeterminate?: boolean }>} assetTotals
 * @returns {Array<{ symbol: string, usd: number }>}
 */
export function buildAllocation(assetTotals) {
  return Object.entries(assetTotals || {})
    .filter(([, t]) => t && !t.indeterminate && typeof t.usd === 'number' && t.usd > 0)
    .map(([symbol, t]) => ({ symbol, usd: t.usd }))
    .sort((a, b) => b.usd - a.usd);
}
