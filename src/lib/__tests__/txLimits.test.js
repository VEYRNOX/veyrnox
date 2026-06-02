// lib/__tests__/txLimits.test.js
//
// Unit tests for the spend-limit evaluator. The DAILY cap was previously
// saved-but-never-read; these assert it is now actually enforced and that
// "today's total" is summed ON-DEVICE from the SAME tx-history records the Send
// flow already holds (no I/O is performed here — pure arithmetic).

import { describe, it, expect } from 'vitest';
import {
  startOfLocalDay,
  isToday,
  sumSentTodayUSD,
  evaluateSendAgainstLimits,
} from '../txLimits';

const RATES = { ETH: 3200, USDC: 1, BTC: 68000 };

// A fixed "now" anchored to local noon so today/yesterday are unambiguous.
const NOW = new Date(2026, 5, 2, 12, 0, 0); // 2026-06-02 12:00 local
const todayAt = (h) => new Date(2026, 5, 2, h, 0, 0).toISOString();
const yesterdayAt = (h) => new Date(2026, 5, 1, h, 0, 0).toISOString();

const HISTORY = [
  { type: 'send', currency: 'ETH', amount: 0.1, created_date: todayAt(9) },   // $320 today
  { type: 'send', currency: 'USDC', amount: 50, created_date: todayAt(10) },   // $50 today
  { type: 'receive', currency: 'ETH', amount: 5, created_date: todayAt(8) },   // ignored (receive)
  { type: 'send', currency: 'ETH', amount: 1, created_date: yesterdayAt(15) }, // ignored (yesterday)
];

describe('startOfLocalDay / isToday', () => {
  it('treats a same-day timestamp as today and a prior day as not', () => {
    expect(isToday(todayAt(1), NOW)).toBe(true);
    expect(isToday(yesterdayAt(23), NOW)).toBe(false);
    expect(isToday(null, NOW)).toBe(false);
    expect(startOfLocalDay(NOW).getHours()).toBe(0);
  });
});

describe('sumSentTodayUSD', () => {
  it('sums only today\'s sends, ignoring receives and prior days', () => {
    // ALL scope: $320 (ETH) + $50 (USDC) = $370
    expect(sumSentTodayUSD({ history: HISTORY, currency: 'ALL', usdRates: RATES, now: NOW })).toBe(370);
  });
  it('scopes to a single currency', () => {
    expect(sumSentTodayUSD({ history: HISTORY, currency: 'ETH', usdRates: RATES, now: NOW })).toBe(320);
    expect(sumSentTodayUSD({ history: HISTORY, currency: 'USDC', usdRates: RATES, now: NOW })).toBe(50);
  });
});

describe('evaluateSendAgainstLimits — per-transaction cap', () => {
  const limits = [{ enabled: true, currency: 'ALL', per_transaction_limit: 500, daily_limit: null }];
  it('blocks a single send over the per-tx cap', () => {
    const r = evaluateSendAgainstLimits({ amount: 1, currency: 'ETH', usdRates: RATES, history: [], limits, now: NOW });
    expect(r.blocked).toBe(true);
    expect(r.reasons[0].kind).toBe('per_tx');
  });
  it('allows a single send under the per-tx cap', () => {
    const r = evaluateSendAgainstLimits({ amount: 0.1, currency: 'ETH', usdRates: RATES, history: [], limits, now: NOW });
    expect(r.blocked).toBe(false);
  });
});

describe('evaluateSendAgainstLimits — daily cap (the previously-unenforced gap)', () => {
  const limits = [{ enabled: true, currency: 'ALL', per_transaction_limit: null, daily_limit: 500 }];

  it('allows a send that keeps the running daily total under the cap', () => {
    // $370 already sent today + ~$100 = $470 < $500
    const r = evaluateSendAgainstLimits({ amount: 0.03125, currency: 'ETH', usdRates: RATES, history: HISTORY, limits, now: NOW });
    expect(r.blocked).toBe(false);
  });

  it('BLOCKS a cumulative send that pushes the day total over the cap', () => {
    // $370 already sent today + ~$320 (0.1 ETH) = $690 > $500 — under the per-tx
    // view this 0.1 ETH send looks fine; only the DAILY running total catches it.
    const r = evaluateSendAgainstLimits({ amount: 0.1, currency: 'ETH', usdRates: RATES, history: HISTORY, limits, now: NOW });
    expect(r.blocked).toBe(true);
    const daily = r.reasons.find((x) => x.kind === 'daily');
    expect(daily).toBeTruthy();
    expect(daily.spentTodayUSD).toBe(370);
    expect(daily.projectedUSD).toBe(690);
    expect(daily.limitUSD).toBe(500);
  });

  it('respects per-currency daily scope (USDC cap not tripped by ETH sends)', () => {
    const usdcLimit = [{ enabled: true, currency: 'USDC', per_transaction_limit: null, daily_limit: 100 }];
    // $50 USDC sent today + $60 USDC = $110 > $100 → blocked
    const blocked = evaluateSendAgainstLimits({ amount: 60, currency: 'USDC', usdRates: RATES, history: HISTORY, limits: usdcLimit, now: NOW });
    expect(blocked.blocked).toBe(true);
    // A large ETH send is NOT constrained by the USDC-scoped daily cap.
    const ethOk = evaluateSendAgainstLimits({ amount: 1, currency: 'ETH', usdRates: RATES, history: HISTORY, limits: usdcLimit, now: NOW });
    expect(ethOk.blocked).toBe(false);
  });

  it('ignores disabled limits', () => {
    const off = [{ enabled: false, currency: 'ALL', per_transaction_limit: null, daily_limit: 1 }];
    const r = evaluateSendAgainstLimits({ amount: 1, currency: 'ETH', usdRates: RATES, history: HISTORY, limits: off, now: NOW });
    expect(r.blocked).toBe(false);
  });
});
