import { describe, it, expect } from 'vitest';
import { buildAllocation } from '../netWorthAllocation.js';

describe('buildAllocation', () => {
  it('returns [] for empty/missing input', () => {
    expect(buildAllocation({})).toEqual([]);
    expect(buildAllocation(undefined)).toEqual([]);
  });

  it('keeps only positive-USD assets, sorted by USD descending', () => {
    const out = buildAllocation({
      ETH: { amount: 1, usd: 3200, indeterminate: false },
      BTC: { amount: 0.1, usd: 6800, indeterminate: false },
      SOL: { amount: 0, usd: 0, indeterminate: false },
    });
    expect(out).toEqual([
      { symbol: 'BTC', usd: 6800 },
      { symbol: 'ETH', usd: 3200 },
    ]);
  });

  it('excludes indeterminate (usd == null) assets', () => {
    const out = buildAllocation({
      ETH: { amount: 1, usd: 3200, indeterminate: false },
      BTC: { amount: null, usd: null, indeterminate: true },
    });
    expect(out).toEqual([{ symbol: 'ETH', usd: 3200 }]);
  });

  it('excludes indeterminate assets EXPLICITLY, even with a (stale) positive usd', () => {
    // Defends against a future aggregator that keeps a last-known usd alongside
    // indeterminate:true — a failed read must never weight the chart (I4).
    const out = buildAllocation({
      ETH: { amount: 1, usd: 3200, indeterminate: false },
      BTC: { amount: 0.1, usd: 6800, indeterminate: true },
    });
    expect(out).toEqual([{ symbol: 'ETH', usd: 3200 }]);
  });
});
