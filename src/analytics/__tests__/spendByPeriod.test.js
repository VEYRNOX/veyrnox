// analytics/__tests__/spendByPeriod.test.js
//
// Unit tests for the STATELESS spend-by-period aggregation (Spending Patterns
// tile). Pure function over an active-set history result (the shape returned by
// lib/txHistory.js#fetchAssetHistory) — NO network, NO persistence, NO fiat.
//
// The honesty properties under test (these are the point of the slice):
//   - Outflows ONLY: receives never count toward spend; balance is never read.
//   - A failed send did NOT move the amount, so it is excluded; a pending send
//     has no block time (timestamp null) and cannot be placed on the timeline,
//     so it is excluded from period buckets too.
//   - Per-asset NATIVE units only — amounts of different assets are NEVER summed
//     into a single cross-asset total (there is no honest common denominator
//     without fiat). Summation within an asset is exact (integer base units).
//   - Fail honest / fail closed (I4): if history can't be read (EVM has no in-app
//     indexer; a locked wallet is indeterminate; an undecodable amount) the
//     result is `status: 'indeterminate'` with NO buckets — never a zero-filled
//     or fabricated chart. `empty` (readable, genuinely no sends) is distinct.

import { describe, it, expect } from 'vitest';
import { spendByPeriod } from '../spendByPeriod';

// Period anchors (UTC). Using Date.UTC with explicit args keeps tests
// deterministic and independent of the wall clock / local timezone.
const JUN_2026 = Date.UTC(2026, 5, 1);
const MAY_2026 = Date.UTC(2026, 4, 1);

// Minimal normalized rows carrying only the fields the aggregation reads.
const row = (over) => ({
  id: 'x', hash: 'x', type: 'send', status: 'confirmed',
  assetSymbol: 'BTC', amount: '0.5', timestamp: Date.UTC(2026, 5, 10), ...over,
});

describe('spendByPeriod — availability (fail honest / fail closed, I4)', () => {
  it('reports indeterminate for EVM history (no in-app indexer), never zeros', () => {
    const r = spendByPeriod({ supported: false, reason: 'evm-no-indexer', transactions: [] }, 'month');
    expect(r.status).toBe('indeterminate');
    expect(r.buckets).toEqual([]); // no fabricated/zero-filled bars
  });

  it('treats a locked wallet as indeterminate, not as zero spend', () => {
    const r = spendByPeriod({ supported: true, reason: 'locked', transactions: [] }, 'month');
    expect(r.status).toBe('indeterminate');
    expect(r.buckets).toEqual([]);
  });

  it('treats null / malformed history as indeterminate without throwing', () => {
    expect(() => spendByPeriod(null, 'month')).not.toThrow();
    expect(spendByPeriod(null, 'month').status).toBe('indeterminate');
    expect(spendByPeriod({ supported: true, transactions: 'nope' }, 'month').status).toBe('indeterminate');
  });

  it('treats an undecodable send amount as indeterminate, never a guessed number', () => {
    const r = spendByPeriod({
      supported: true,
      transactions: [row({ amount: 'not-a-number' })],
    }, 'month');
    expect(r.status).toBe('indeterminate');
    expect(r.buckets).toEqual([]);
  });

  it('reports an honest empty (readable, genuinely no sends) — distinct from indeterminate', () => {
    const r = spendByPeriod({ supported: true, transactions: [] }, 'month');
    expect(r.status).toBe('empty');
    expect(r.buckets).toEqual([]);
  });
});

describe('spendByPeriod — outflows only', () => {
  it('excludes receives — spend is sends only, balance is never read', () => {
    const r = spendByPeriod({
      supported: true,
      transactions: [
        row({ id: 'a', type: 'send', amount: '0.5' }),
        row({ id: 'b', type: 'receive', amount: '9.9' }), // must not count
      ],
    }, 'month');
    expect(r.status).toBe('ok');
    expect(r.buckets).toHaveLength(1);
    expect(r.buckets[0].byAsset).toEqual({ BTC: '0.5' });
  });

  it('excludes a failed send (the amount never left) and a pending send (no block time to place)', () => {
    const r = spendByPeriod({
      supported: true,
      transactions: [
        row({ id: 'ok', amount: '0.5', status: 'confirmed' }),
        row({ id: 'fail', amount: '0.4', status: 'failed' }),       // didn't move
        row({ id: 'pend', amount: '0.3', status: 'pending', timestamp: null }), // unplaceable
      ],
    }, 'month');
    expect(r.buckets).toHaveLength(1);
    expect(r.buckets[0].byAsset).toEqual({ BTC: '0.5' });
  });

  it('reports empty when every send is failed/pending (no placeable outflow)', () => {
    const r = spendByPeriod({
      supported: true,
      transactions: [
        row({ id: 'fail', status: 'failed' }),
        row({ id: 'pend', status: 'pending', timestamp: null }),
      ],
    }, 'month');
    expect(r.status).toBe('empty');
    expect(r.buckets).toEqual([]);
  });
});

describe('spendByPeriod — per-period, per-asset aggregation (month)', () => {
  const history = {
    supported: true,
    transactions: [
      row({ id: 'a', assetSymbol: 'BTC', amount: '0.5', timestamp: Date.UTC(2026, 5, 10) }), // Jun
      row({ id: 'b', assetSymbol: 'SOL', amount: '3.2', timestamp: Date.UTC(2026, 5, 12) }), // Jun
      row({ id: 'c', assetSymbol: 'BTC', amount: '0.25', timestamp: Date.UTC(2026, 4, 20) }), // May
    ],
  };

  it('orders buckets ascending by period start', () => {
    const r = spendByPeriod(history, 'month');
    expect(r.buckets.map((b) => b.periodStart)).toEqual([MAY_2026, JUN_2026]);
  });

  it('sums per asset within a period and NEVER sums across assets', () => {
    const r = spendByPeriod(history, 'month');
    const jun = r.buckets.find((b) => b.periodStart === JUN_2026);
    expect(jun.byAsset).toEqual({ BTC: '0.5', SOL: '3.2' }); // two separate native figures
    const may = r.buckets.find((b) => b.periodStart === MAY_2026);
    expect(may.byAsset).toEqual({ BTC: '0.25' });
  });

  it('sums multiple sends of the same asset in one period exactly (no float drift)', () => {
    const txs = Array.from({ length: 10 }, (_, i) =>
      row({ id: `f${i}`, amount: '0.00000001', timestamp: Date.UTC(2026, 5, 5) }));
    const r = spendByPeriod({ supported: true, transactions: txs }, 'month');
    expect(r.buckets).toHaveLength(1);
    expect(r.buckets[0].byAsset).toEqual({ BTC: '0.0000001' }); // 10 sats, exact
  });

  it('reports the requested granularity on the result', () => {
    expect(spendByPeriod(history, 'month').granularity).toBe('month');
  });
});

describe('spendByPeriod — week granularity', () => {
  it('buckets sends into Monday-anchored UTC weeks', () => {
    // 2026-06-08 is a Monday; 2026-06-10 (Wed) is the same week; 2026-06-15 is
    // the next Monday (its own week).
    const r = spendByPeriod({
      supported: true,
      transactions: [
        row({ id: 'a', amount: '0.1', timestamp: Date.UTC(2026, 5, 10) }), // wk of Jun 8
        row({ id: 'b', amount: '0.2', timestamp: Date.UTC(2026, 5, 11) }), // wk of Jun 8
        row({ id: 'c', amount: '0.3', timestamp: Date.UTC(2026, 5, 15) }), // wk of Jun 15
      ],
    }, 'week');
    expect(r.granularity).toBe('week');
    expect(r.buckets.map((b) => b.periodStart)).toEqual([Date.UTC(2026, 5, 8), Date.UTC(2026, 5, 15)]);
    expect(r.buckets[0].byAsset).toEqual({ BTC: '0.3' }); // 0.1 + 0.2, exact
    expect(r.buckets[1].byAsset).toEqual({ BTC: '0.3' });
  });
});
