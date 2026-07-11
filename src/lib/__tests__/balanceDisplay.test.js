import { describe, it, expect } from 'vitest';
import {
  INDETERMINATE_DASH,
  PARTIAL_TOTAL_NOTE,
  fmtIndeterminateAmount,
  resolveAssetRow,
} from '../balanceDisplay.js';

describe('fmtIndeterminateAmount — I4 fail-closed: failed read ≠ empty wallet', () => {
  it('renders an INDETERMINATE read (null/undefined) as "—", NEVER "0"', () => {
    expect(fmtIndeterminateAmount(null)).toBe(INDETERMINATE_DASH);
    expect(fmtIndeterminateAmount(undefined)).toBe(INDETERMINATE_DASH);
    expect(fmtIndeterminateAmount(null)).not.toBe('0');
  });

  it('renders a GENUINE empty wallet (0) as "0" — a real, confirmed value', () => {
    expect(fmtIndeterminateAmount(0)).toBe('0');
  });

  it('renders ordinary amounts with locale grouping', () => {
    expect(fmtIndeterminateAmount(2)).toBe('2');
    expect(fmtIndeterminateAmount(1.5)).toBe('1.5');
  });

  it('renders tiny dust in exponential form (still not "0")', () => {
    expect(fmtIndeterminateAmount(0.00001)).toBe((0.00001).toExponential(2));
    expect(fmtIndeterminateAmount(0.00001)).not.toBe('0');
  });
});

describe('resolveAssetRow — a missing row is indeterminate, not a fabricated 0', () => {
  const assets = [
    { symbol: 'ETH', amount: 1.2, usd: 3840, indeterminate: false },
    { symbol: 'USDC', amount: 0, usd: 0, indeterminate: false }, // genuine empty
    { symbol: 'BTC', amount: null, usd: null, indeterminate: true }, // failed read
  ];

  it('returns a present row verbatim (preserving a genuine 0 as 0)', () => {
    expect(resolveAssetRow(assets, 'ETH')).toBe(assets[0]);
    const usdc = resolveAssetRow(assets, 'USDC');
    expect(usdc.amount).toBe(0);
    expect(usdc.indeterminate).toBe(false);
  });

  it('preserves an already-indeterminate row as indeterminate', () => {
    const btc = resolveAssetRow(assets, 'BTC');
    expect(btc.indeterminate).toBe(true);
    expect(btc.amount).toBeNull();
  });

  it('fails CLOSED for a MISSING row: indeterminate:true + amount null (renders "—", never "0")', () => {
    const sol = resolveAssetRow(assets, 'SOL');
    expect(sol).toEqual({ symbol: 'SOL', amount: null, usd: null, indeterminate: true });
    expect(fmtIndeterminateAmount(sol.amount)).toBe(INDETERMINATE_DASH);
    expect(fmtIndeterminateAmount(sol.amount)).not.toBe('0');
  });

  it('handles an empty/missing asset list by failing closed to indeterminate', () => {
    expect(resolveAssetRow([], 'ETH').indeterminate).toBe(true);
    expect(resolveAssetRow(undefined, 'ETH').indeterminate).toBe(true);
  });
});

describe('PARTIAL_TOTAL_NOTE — incomplete totals are marked, not asserted as fact', () => {
  it('is a non-empty, count-blind incompleteness message', () => {
    expect(typeof PARTIAL_TOTAL_NOTE).toBe('string');
    expect(PARTIAL_TOTAL_NOTE.length).toBeGreaterThan(0);
    expect(PARTIAL_TOTAL_NOTE.toLowerCase()).toContain('incomplete');
    // count-blind: no digits / plural-count tell that could leak wallet cardinality
    expect(PARTIAL_TOTAL_NOTE).not.toMatch(/\d/);
  });
});
