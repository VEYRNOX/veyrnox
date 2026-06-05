// src/lib/__tests__/spendingPatterns.test.js
import { describe, it, expect } from 'vitest';
import { summarizeSpending } from '../spendingPatterns';

// Fixed reference month so the 6-month window / "this month" are deterministic.
const NOW = '2026-06-15';

const TXNS = [
  { type: 'send', currency: 'BTC', amount: 0.5, created_date: '2026-06-10' },
  { type: 'send', currency: 'ETH', amount: 2, created_date: '2026-06-12' },
  { type: 'send', currency: 'BTC', amount: 0.25, created_date: '2026-05-20' },
  { type: 'receive', currency: 'ETH', amount: 1, created_date: '2026-06-11' },
  { type: 'receive', currency: 'BTC', amount: 0.25, created_date: '2026-04-05' },
];

describe('summarizeSpending', () => {
  const s = summarizeSpending(TXNS, NOW);

  it('counts sends/receives/total and this-month activity (asset-agnostic)', () => {
    expect(s.counts).toEqual({ sent: 3, received: 2, total: 5, thisMonth: 3 });
  });

  it('breaks down per asset in NATIVE amounts, never summing across assets', () => {
    const btc = s.byAsset.find((a) => a.currency === 'BTC');
    const eth = s.byAsset.find((a) => a.currency === 'ETH');
    expect(btc.sentAmount).toBeCloseTo(0.75, 10);
    expect(btc.receivedAmount).toBeCloseTo(0.25, 10);
    expect(btc.sentCount).toBe(2);
    expect(btc.receivedCount).toBe(1);
    expect(eth.sentAmount).toBeCloseTo(2, 10);
    expect(eth.receivedAmount).toBeCloseTo(1, 10);
    // BTC has more total txns than ETH, so it sorts first.
    expect(s.byAsset.map((a) => a.currency)).toEqual(['BTC', 'ETH']);
  });

  it('carries NO fabricated USD/price anywhere in the output (the honesty fix)', () => {
    const json = JSON.stringify(s);
    expect(json.toLowerCase()).not.toContain('usd');
    for (const a of s.byAsset) expect(a).not.toHaveProperty('usd');
  });

  it('reports monthly activity as transaction COUNTS over a 6-month window', () => {
    expect(s.monthly).toHaveLength(6);
    expect(s.monthly[s.monthly.length - 1]).toEqual({ month: 'Jun 26', sent: 2, received: 1 });
    const may = s.monthly.find((m) => m.month === 'May 26');
    const apr = s.monthly.find((m) => m.month === 'Apr 26');
    expect(may).toEqual({ month: 'May 26', sent: 1, received: 0 });
    expect(apr).toEqual({ month: 'Apr 26', sent: 0, received: 1 });
  });

  it('reports day-of-week activity as counts across all 7 days', () => {
    expect(s.byDow.map((d) => d.day)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(s.byDow.reduce((n, d) => n + d.sent, 0)).toBe(3);
    expect(s.byDow.reduce((n, d) => n + d.received, 0)).toBe(2);
  });

  it('handles empty / malformed input without throwing', () => {
    const e = summarizeSpending([], NOW);
    expect(e.counts).toEqual({ sent: 0, received: 0, total: 0, thisMonth: 0 });
    expect(e.byAsset).toEqual([]);
    expect(e.monthly).toHaveLength(6);
    expect(e.byDow.reduce((n, d) => n + d.sent + d.received, 0)).toBe(0);
    expect(() => summarizeSpending(null, NOW)).not.toThrow();
    expect(() => summarizeSpending([{ type: 'send' }], NOW)).not.toThrow();
  });
});
