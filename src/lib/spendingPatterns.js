// src/lib/spendingPatterns.js
//
// Pure aggregation for the Spending Patterns page. HONESTY: this reports only
// real, on-device transaction data — per-asset NATIVE amounts and transaction
// COUNTS/timing. It deliberately does NOT convert to USD: cross-asset value
// requires a price, and the only prices available in this build are stale mock
// constants (lib/cryptos USD_RATES). Showing those as real spend was the reason
// /spending was classified `disabled (unverified)`. Counts and per-asset native
// figures need no price and are genuinely real, so the page can be honest+live.
//
// Extracted as a pure function so the aggregation is unit-tested without React.
import { format, subMonths, isValid } from 'date-fns';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const safeDate = (v) => { const d = new Date(v); return isValid(d) ? d : null; };

/**
 * @param {Array<{type,currency,amount,created_date}>} transactions - real local tx records
 * @param {string|number|Date} [now] - reference date for the month window (defaults to today)
 * @returns {{
 *   counts: {sent:number, received:number, total:number, thisMonth:number},
 *   byAsset: Array<{currency, sentAmount, receivedAmount, sentCount, receivedCount}>,
 *   monthly: Array<{month:string, sent:number, received:number}>,  // transaction counts
 *   byDow:   Array<{day:string, sent:number, received:number}>,    // transaction counts
 * }}
 */
export function summarizeSpending(transactions, now = undefined) {
  const ref = now ? new Date(now) : new Date();
  const txns = Array.isArray(transactions) ? transactions : [];
  const sends = txns.filter((t) => t && t.type === 'send');
  const receives = txns.filter((t) => t && t.type === 'receive');

  // Per-asset native breakdown (never sums across different assets).
  const assets = {};
  const slot = (currency) => {
    const c = currency || 'UNKNOWN';
    return (assets[c] ||= { currency: c, sentAmount: 0, receivedAmount: 0, sentCount: 0, receivedCount: 0 });
  };
  for (const t of sends) { const a = slot(t.currency); a.sentAmount += num(t.amount); a.sentCount += 1; }
  for (const t of receives) { const a = slot(t.currency); a.receivedAmount += num(t.amount); a.receivedCount += 1; }
  const byAsset = Object.values(assets).sort(
    (a, b) =>
      (b.sentCount + b.receivedCount) - (a.sentCount + a.receivedCount) ||
      a.currency.localeCompare(b.currency),
  );

  // Monthly transaction counts over a rolling 6-month window ending at `ref`.
  const monthly = {};
  for (let i = 5; i >= 0; i--) {
    const m = format(subMonths(ref, i), 'MMM yy');
    monthly[m] = { month: m, sent: 0, received: 0 };
  }
  for (const t of sends) { const d = safeDate(t.created_date); if (!d) continue; const m = format(d, 'MMM yy'); if (monthly[m]) monthly[m].sent += 1; }
  for (const t of receives) { const d = safeDate(t.created_date); if (!d) continue; const m = format(d, 'MMM yy'); if (monthly[m]) monthly[m].received += 1; }

  // Day-of-week transaction counts.
  const dow = Object.fromEntries(DOW.map((d) => [d, { day: d, sent: 0, received: 0 }]));
  for (const t of sends) { const d = safeDate(t.created_date); if (!d) continue; const label = format(d, 'eee'); if (dow[label]) dow[label].sent += 1; }
  for (const t of receives) { const d = safeDate(t.created_date); if (!d) continue; const label = format(d, 'eee'); if (dow[label]) dow[label].received += 1; }

  const thisMonthKey = format(ref, 'MMM yy');
  const counts = {
    sent: sends.length,
    received: receives.length,
    total: sends.length + receives.length,
    thisMonth: (monthly[thisMonthKey]?.sent || 0) + (monthly[thisMonthKey]?.received || 0),
  };

  return { counts, byAsset, monthly: Object.values(monthly), byDow: DOW.map((d) => dow[d]) };
}
