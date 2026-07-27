// How much the annual plan actually saves against paying monthly — derived from
// the two prices the paywall is rendering, never hardcoded.
//
// WHY THIS EXISTS. The paywall carried a literal "Save 30%" badge and a
// "Billed annually — 4 months free vs. monthly." line, both rendered
// unconditionally beside store-returned, offer-adjusted prices they were not
// derived from. Two separate problems:
//
//  1. "30%" is only true for the USD base prices with no offer applied
//     (1 - 49.99/71.88 = 30.45%). Nothing in the code enforced that. Monthly and
//     annual resolve through two INDEPENDENT offerPriceInfo() calls that can each
//     return undefined, so the toggle can show a discounted monthly price beside a
//     full-price annual one. When retention_50 resolves for monthly but
//     retention_50_annual does not, annual becomes the WORSE deal — roughly $35.88
//     a year against $49.99 — while the badge still claimed "Save 30%".
//
//  2. "4 months free" was wrong even at USD base: 12 - 49.99/5.99 = 3.65 months.
//     It has been replaced by the same derived percentage, so there is one claim
//     computed from one source rather than two hand-maintained numbers.
//
// Both now come from this function, fed the same numeric prices behind the
// strings on screen. If either price is unresolvable, or the annual plan does not
// actually save anything, it returns null and the caller renders NO claim — the
// I4 rule the file already applies to prices themselves ("unresolvable -> render
// no price rather than the base price").
//
// Currency-agnostic by construction: it only ever divides two prices that came
// from the same store in the same locale, so FX and rounding cancel out.
//
// Pure: no DOM, no store, no network.

/**
 * @param {unknown} monthlyPrice the effective per-month price actually shown
 * @param {unknown} annualPrice  the effective per-year price actually shown
 * @returns {number|null} whole-percent saving, or null when no honest claim can be made
 */
export function annualSavingPercent(monthlyPrice, annualPrice) {
  if (typeof monthlyPrice !== 'number' || typeof annualPrice !== 'number') return null;
  if (!Number.isFinite(monthlyPrice) || !Number.isFinite(annualPrice)) return null;
  if (monthlyPrice <= 0 || annualPrice <= 0) return null;

  const yearlyAtMonthlyRate = monthlyPrice * 12;
  const percent = Math.round((1 - annualPrice / yearlyAtMonthlyRate) * 100);

  // A saving that rounds to zero — or to nothing at all — is not a saving worth
  // advertising, and a negative one is the annual plan costing MORE.
  if (!Number.isFinite(percent) || percent <= 0) return null;

  return percent;
}
