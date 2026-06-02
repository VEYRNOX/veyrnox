// lib/txLimits.js — evaluate a prospective send against the user's configured
// per-transaction AND daily spend limits (Security Center → Tx Limits).
//
// WHY THIS EXISTS: the per-transaction cap was already enforced inline in the
// Send flow, but the DAILY cap was saved and never read — a "limit" that did
// nothing (security theatre). This module closes that gap by computing, FULLY
// ON-DEVICE, how much the user has already sent TODAY and blocking a send that
// would push the day's running total over the daily cap.
//
// "TODAY'S TOTAL" — DATA SOURCE & LOCALITY (important):
//   - It is summed from the SAME local transaction-history records the Send and
//     anomaly/poison screens already read (base44.entities.Transaction — the
//     app's own tx history; seeded client-side in demo, the user's own records
//     otherwise). NOTHING new is fetched and NOTHING is sent anywhere: this is a
//     pure reduction over records the caller already has in hand.
//   - Only `type === 'send'` records dated within the CURRENT LOCAL CALENDAR DAY
//     count toward the total. "Today" is the device's local day (midnight→now),
//     so the cap matches the user's wall clock, not UTC.
//   - Each amount is converted to USD with the SAME static USD_RATES table the
//     Send/Security screens use (caps are denominated in USD). Records whose
//     currency has no rate fall back to 1:1 — the conservative choice (never
//     UNDER-counts spend, so the cap can't be silently bypassed by an unpriced
//     asset).
//
// This file performs NO crypto and touches NO key material — it is arithmetic
// over already-loaded display records. WARNS/BLOCKS the UI action only; it never
// signs, broadcasts, or mutates anything.

/** Start of the current local calendar day (00:00:00 in the device tz). */
export function startOfLocalDay(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** True if an ISO/date value falls within the current local calendar day. */
export function isToday(dateValue, now = new Date()) {
  if (!dateValue) return false;
  const t = new Date(dateValue).getTime();
  if (Number.isNaN(t)) return false;
  return t >= startOfLocalDay(now).getTime() && t <= new Date(now).getTime();
}

/** USD value of a single amount in `currency` using the caller's rate table. */
function toUsd(amount, currency, usdRates) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Unknown currency → 1:1. Conservative: never under-count spend (see header).
  const rate = usdRates?.[currency] ?? 1;
  return n * rate;
}

/**
 * Sum (in USD) of the user's OUTGOING sends dated today, optionally scoped to a
 * single currency. `currency === 'ALL'` (or null/undefined) sums every currency.
 * Reads only the `history` array the caller passes in — no I/O.
 *
 * @param {object}   p
 * @param {Array}    p.history   tx-history records ({type, currency, amount, created_date|date})
 * @param {string}   [p.currency='ALL'] limit scope
 * @param {object}   p.usdRates  symbol → USD rate map
 * @param {Date}     [p.now]
 * @returns {number} USD already sent today within scope
 */
export function sumSentTodayUSD({ history = [], currency = 'ALL', usdRates = {}, now = new Date() }) {
  const scopeAll = !currency || currency === 'ALL';
  let total = 0;
  for (const tx of history) {
    if (tx?.type !== 'send') continue;
    if (!scopeAll && tx.currency !== currency) continue;
    if (!isToday(tx.created_date || tx.date, now)) continue;
    total += toUsd(tx.amount, tx.currency, usdRates);
  }
  return total;
}

/**
 * Evaluate a prospective send against EVERY enabled limit whose scope matches
 * the send's currency (the limit's own currency, or 'ALL'). Returns whether the
 * send is blocked and a structured reason per breached limit so the UI can show
 * an honest, specific message ("$X already sent today + this $Y exceeds your
 * $Z/day cap"). Pure: no I/O, no mutation.
 *
 * @returns {{
 *   blocked: boolean,
 *   amountUSD: number,
 *   reasons: Array<{ kind:'per_tx'|'daily', currency:string, limitUSD:number,
 *                    spentTodayUSD?:number, projectedUSD?:number }>
 * }}
 */
export function evaluateSendAgainstLimits({
  amount,
  currency,
  usdRates = {},
  history = [],
  limits = [],
  now = new Date(),
}) {
  const amountUSD = toUsd(amount, currency, usdRates);
  const reasons = [];

  const applicable = (limits || []).filter(
    (l) => l && l.enabled && (l.currency === currency || l.currency === 'ALL'),
  );

  for (const l of applicable) {
    // Per-transaction cap: this single send's USD value vs the cap.
    if (l.per_transaction_limit != null && amountUSD > l.per_transaction_limit) {
      reasons.push({ kind: 'per_tx', currency: l.currency, limitUSD: l.per_transaction_limit });
    }
    // Daily cap: today's already-sent total (in this limit's scope) PLUS this
    // send vs the cap. This is the gap that was previously never enforced.
    if (l.daily_limit != null) {
      const spentTodayUSD = sumSentTodayUSD({ history, currency: l.currency, usdRates, now });
      const projectedUSD = spentTodayUSD + amountUSD;
      if (projectedUSD > l.daily_limit) {
        reasons.push({
          kind: 'daily',
          currency: l.currency,
          limitUSD: l.daily_limit,
          spentTodayUSD,
          projectedUSD,
        });
      }
    }
  }

  return { blocked: reasons.length > 0, amountUSD, reasons };
}
