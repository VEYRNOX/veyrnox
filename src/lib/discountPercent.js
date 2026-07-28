// How much a promotional offer actually takes off — derived from the two prices
// the store returned, never from the tier table.
//
// WHY THIS EXISTS. The paywall's referral banner rendered
// `${referrerTierInfo.commission}% off`, where `commission` is a static field on
// the TIERS table in lib/referral.js (2.5 / 5 / 10 / 15). It was set from
// getTierInfo(paidCount) before any offering resolved, and gated only on
// `hasDiscount` — so the percentage was a claim about our own tier model, not
// about the price the user was about to be charged. Two ways that goes wrong,
// both documented in CLAUDE.md:
//
//  1. APPLE CANNOT EXPRESS SMALL PERCENTAGES. 2.5% off is not a price point.
//     Bronze uses the nearest point at or BELOW target ($5.79 against a $5.99
//     base), so the real discount is 3.34%, not 2.5%.
//
//  2. FX ROUNDING ERASES SMALL DISCOUNTS ENTIRELY in some territories — Bronze
//     is full price in Albania and Armenia. There the banner promised "2.5% off"
//     beside a price identical to the base one.
//
// This is the same defect class the "Save 30%" badge had (see lib/annualSaving.js),
// and the same rule applies: derive the claim from the numbers actually on screen,
// and when it cannot be derived, make NO claim rather than a hardcoded one (I4).
//
// Currency-agnostic by construction: it only ever divides two prices that came
// from the same store in the same locale, so FX and rounding cancel out.
//
// Pure: no DOM, no store, no network.

/**
 * @param {unknown} basePrice  the full list price of the plan
 * @param {unknown} offerPrice the price the store will actually charge
 * @returns {number|null} whole-percent discount, or null when no honest claim can be made
 */
export function discountPercent(basePrice, offerPrice) {
  if (typeof basePrice !== 'number' || typeof offerPrice !== 'number') return null;
  if (!Number.isFinite(basePrice) || !Number.isFinite(offerPrice)) return null;
  // A non-positive base has no percentage to take off; a negative offer is not a
  // price. (offerPrice === 0 IS valid — a fully comped period is 100% off.)
  if (basePrice <= 0 || offerPrice < 0) return null;

  // Snap to 6dp BEFORE flooring. An exact 10% off computes as
  // 1 - 90/100 = 0.09999999999999998, and flooring that raw would advertise a
  // clean 10% discount as 9% — IEEE-754 error, not a pricing decision. 6dp is
  // far finer than any real price ratio and far coarser than the error.
  const raw = Number(((1 - offerPrice / basePrice) * 100).toFixed(6));

  // FLOOR, not round — deliberately unlike annualSavingPercent, which rounds.
  // That one describes a comparison the user can redo from two visible prices;
  // this one is an advertised discount on a purchase, so the claim must never
  // exceed what is delivered. 8.9% off is advertised as 8%, never 9%.
  const percent = Math.floor(raw);

  // Zero covers both "the offer matched the base price" (FX rounding erased it)
  // and "the discount is under 1%". Negative means the "offer" costs more.
  if (!Number.isFinite(percent) || percent <= 0) return null;

  return percent;
}
