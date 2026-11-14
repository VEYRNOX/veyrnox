// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { formatSpotPrice, spotPriceFractionDigits } from '../FiatCurrencySelector.jsx';

describe('spot price formatting', () => {
  it('keeps significant digits for sub-cent unit prices instead of $0.00', () => {
    expect(formatSpotPrice(0.00001, 'USD', 'en-US')).toBe('$0.00001');
    expect(formatSpotPrice(0.0000075, 'USD', 'en-US')).toBe('$0.0000075');
    expect(formatSpotPrice(0.0901, 'USD', 'en-US')).toBe('$0.0901');
  });

  it('uses the normal two decimals at or above one dollar', () => {
    expect(formatSpotPrice(1234.5678, 'USD', 'en-US')).toBe('$1,234.57');
    expect(formatSpotPrice(1, 'USD', 'en-US')).toBe('$1.00');
  });

  it('returns two-decimal options for zero and non-finite input without throwing', () => {
    for (const v of [0, NaN, undefined, Infinity]) {
      expect(spotPriceFractionDigits(v)).toEqual({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  });

  it('caps the precision so a tiny price cannot request unbounded digits', () => {
    expect(spotPriceFractionDigits(1e-15).maximumFractionDigits).toBe(10);
  });
});
