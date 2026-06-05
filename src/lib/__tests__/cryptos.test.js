// lib/__tests__/cryptos.test.js
//
// Unit tests for approxUsd — the display formatter for any USD figure DERIVED
// from the static USD_RATES table. It marks the number approximate (≈) and
// rounds to whole dollars, so a reference-rate value is never shown as exact.

import { describe, it, expect } from 'vitest';
import { approxUsd } from '@/lib/cryptos';

describe('approxUsd', () => {
  it('prefixes with ≈ and rounds to whole dollars', () => {
    expect(approxUsd(1650.4)).toBe('≈$1,650');
  });

  it('rounds at the half dollar', () => {
    expect(approxUsd(0.6)).toBe('≈$1');
  });

  it('adds thousands separators', () => {
    expect(approxUsd(1234567)).toBe('≈$1,234,567');
  });

  it('renders sub-dollar and zero values as ≈$0', () => {
    expect(approxUsd(0.004)).toBe('≈$0');
    expect(approxUsd(0)).toBe('≈$0');
  });

  it('guards non-finite and negative input as ≈$0', () => {
    expect(approxUsd(NaN)).toBe('≈$0');
    expect(approxUsd(Infinity)).toBe('≈$0');
    expect(approxUsd(-Infinity)).toBe('≈$0');
    expect(approxUsd(-5)).toBe('≈$0');
  });
});
