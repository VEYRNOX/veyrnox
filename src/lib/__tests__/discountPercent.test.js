import { describe, it, expect } from 'vitest';
import { discountPercent } from '../discountPercent.js';

describe('discountPercent', () => {
  it('derives the Gold monthly discount from the two prices on screen', () => {
    // $5.99 base, $5.39 offer = 10.02% — the nominal Gold rate, but arrived at
    // from the prices rather than from the tier table.
    expect(discountPercent(5.99, 5.39)).toBe(10);
  });

  it('derives the Gold annual discount', () => {
    expect(discountPercent(49.99, 44.99)).toBe(10);
  });

  it('describes the price actually charged, not the tier nominal rate', () => {
    // Bronze is nominally 2.5%, but Apple cannot express 2.5% — the store uses
    // the nearest price point at or BELOW target ($5.79), which is really 3.34%
    // off. The banner must describe the delta the user gets, not the table.
    expect(discountPercent(5.99, 5.79)).toBe(3);
  });

  it('floors rather than rounds, so the claim never exceeds the delivered discount', () => {
    // 8.9% off must not be advertised as "9% off".
    expect(discountPercent(100, 91.1)).toBe(8);
    // Exactly on a whole percent stays put.
    expect(discountPercent(100, 90)).toBe(10);
  });

  // The case CLAUDE.md calls out by name: FX rounding erases small discounts
  // entirely in some territories — Bronze is full price in Albania and Armenia.
  // The paywall must then make NO percentage claim (I4).
  it('returns null when FX rounding erased the discount entirely', () => {
    expect(discountPercent(5.99, 5.99)).toBeNull();
  });

  it('returns null when the "offer" costs more than the base price', () => {
    expect(discountPercent(5.99, 6.49)).toBeNull();
  });

  it('returns null when the discount rounds away to nothing', () => {
    // 0.4% off floors to 0 — not a claim worth making.
    expect(discountPercent(100, 99.6)).toBeNull();
  });

  it('returns null when either price is unresolvable', () => {
    expect(discountPercent(undefined, 5.39)).toBeNull();
    expect(discountPercent(5.99, undefined)).toBeNull();
    expect(discountPercent(null, null)).toBeNull();
    expect(discountPercent(NaN, 5.39)).toBeNull();
    expect(discountPercent(5.99, NaN)).toBeNull();
    expect(discountPercent(Infinity, 5.39)).toBeNull();
  });

  it('returns null for non-numeric input rather than coercing it', () => {
    // A priceString must never be mistaken for a price.
    expect(discountPercent('$5.99', '$5.39')).toBeNull();
    expect(discountPercent('5.99', '5.39')).toBeNull();
  });

  it('returns null for a zero or negative base price', () => {
    expect(discountPercent(0, 0)).toBeNull();
    expect(discountPercent(-5.99, -6.99)).toBeNull();
  });

  it('accepts a free offer as a full discount', () => {
    expect(discountPercent(5.99, 0)).toBe(100);
  });

  it('is currency-agnostic — both prices come from the same store and locale', () => {
    // ¥1200 -> ¥1080 is the same 10% as $5.99 -> $5.39.
    expect(discountPercent(1200, 1080)).toBe(10);
  });
});
