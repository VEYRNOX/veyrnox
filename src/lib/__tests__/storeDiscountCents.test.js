// Branch review 2026-08-15 (C-1) — the referral discount recorded against an
// attribution must reflect what the STORE actually charged, in the same unit as
// the USD-denominated revenue_cents column.
//
// History, both directions wrong:
//   before #1808 — a tier-commission percentage. A "should be" number that
//     ignored what was charged. Apple has no price point for small percentages,
//     so a 2.5% tier is the nearest point at or BELOW target, and FX rounding
//     erases it entirely in some territories (CLAUDE.md 2026-07-23: Bronze is
//     full price in Albania/Armenia).
//   #1808 — a price DELTA, but subtracting the store's price (the user's LOCAL
//     currency) from PLAN_FULL_PRICE_CENTS (hardcoded USD). Meaningful only in
//     USD territories: a weaker currency makes the charged figure exceed the USD
//     constant so the Math.max(0, …) clamp silently yields 0, while a stronger
//     one yields a positive number that is not a discount.
//
// storeDiscountCents takes both prices from the SAME package, so the units
// cancel and the ratio is dimensionless — no currency code needed, which
// matters because RevenueCat's offerPriceInfo does not return one.

import { describe, it, expect } from 'vitest';
import { storeDiscountCents } from '../referral.js';

const MONTHLY = 599;   // PLAN_FULL_PRICE_CENTS.monthly, USD cents
const ANNUAL = 4999;

describe('storeDiscountCents — dimensionless ratio, USD-cents result', () => {
  it('reports the ratio the store actually applied', () => {
    // 10% off, expressed in USD cents of the USD list price.
    expect(storeDiscountCents(5.99, 5.39, MONTHLY)).toBe(60);
  });

  it('is currency-agnostic — the same ratio in a non-USD store gives the same cents', () => {
    // THE regression this file exists for. A JPY store charging ¥900 against a
    // ¥1000 base is the same 10% as $5.39 against $5.99, and must record the
    // same USD-cent discount. The old subtraction returned 0 here, because
    // 5.99 - 900 is negative and got clamped away.
    expect(storeDiscountCents(1000, 900, MONTHLY)).toBe(60);
    expect(storeDiscountCents(1000, 900, MONTHLY))
      .toBe(storeDiscountCents(5.99, 5.39, MONTHLY));
  });

  it('records 0 when the store granted no discount — including FX-flattened tiers', () => {
    // Bronze in Albania/Armenia: the offer resolves to the base price. Zero is
    // the honest answer, not the tier percentage.
    expect(storeDiscountCents(5.99, 5.99, MONTHLY)).toBe(0);
  });

  it('never exceeds the full price', () => {
    expect(storeDiscountCents(5.99, 0, MONTHLY)).toBe(MONTHLY);
    expect(storeDiscountCents(4999, 0, ANNUAL)).toBe(ANNUAL);
  });

  it('never goes negative when the offer price is ABOVE base (bad store data)', () => {
    // Must read as "no discount", never as a negative that a later sum would
    // treat as revenue.
    expect(storeDiscountCents(5.99, 9.99, MONTHLY)).toBe(0);
  });

  it('is conservative on every unusable input rather than guessing', () => {
    for (const bad of [undefined, null, NaN, Infinity, 'abc', {}, -1, 0]) {
      expect(storeDiscountCents(bad, 5.39, MONTHLY), `base=${String(bad)}`).toBe(0);
    }
    for (const bad of [undefined, null, NaN, Infinity, 'abc', {}, -1]) {
      expect(storeDiscountCents(5.99, bad, MONTHLY), `offer=${String(bad)}`).toBe(0);
    }
    for (const bad of [undefined, null, NaN, 0, -100]) {
      expect(storeDiscountCents(5.99, 5.39, bad), `full=${String(bad)}`).toBe(0);
    }
  });

  it('handles the annual plan at its own list price', () => {
    // 20% off annual → 20% of 4999.
    expect(storeDiscountCents(49.99, 39.99, ANNUAL)).toBe(1000);
  });
});
