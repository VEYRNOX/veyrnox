// lib/netWorthAllocation.js — pure chart-data helper for the Crypto Net Worth view.
//
// Turns the portfolio aggregator's `assetTotals` ({ [symbol]: { amount, usd,
// indeterminate } }) into allocation-donut segments: positive-USD assets only,
// largest first. Indeterminate (failed-read, usd == null) assets are excluded —
// they have no honest dollar weight to chart (I4: never treat a failed read as 0).

/**
 * @param {Record<string, { amount?: number, usd?: number|null, indeterminate?: boolean }>} assetTotals
 * @returns {Array<{ symbol: string, usd: number }>}
 */
export function buildAllocation(assetTotals) {
  return Object.entries(assetTotals || {})
    .map(([symbol, t]) => ({ symbol, usd: t && typeof t.usd === 'number' ? t.usd : 0 }))
    .filter((d) => d.usd > 0)
    .sort((a, b) => b.usd - a.usd);
}
