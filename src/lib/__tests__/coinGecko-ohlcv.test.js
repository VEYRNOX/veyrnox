// src/lib/__tests__/coinGecko-ohlcv.test.js
//
// Verifies that the CoinGecko OHLCV fallback requests different `days` values
// for each chart period, and trims candles to the requested limit.
//
// Root cause of the "1H/4H/1D show identical data" bug: toCgDays mapped both
// minute (1H, 4H) and hour/limit=24 (1D) to days=1, so CoinGecko returned
// the same 30-minute candle set for all three.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api/edgeApi', () => ({
  fetchCoinGecko: vi.fn(),
}));

import { fetchCoinGecko } from '@/api/edgeApi';
import { fetchOHLCVCG } from '../coinGecko.js';

function makeCgCandles(n) {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => [now - (n - i) * 60_000, 100 + i, 101 + i, 99 + i, 100.5 + i]);
}

beforeEach(() => vi.clearAllMocks());

describe('toCgDays — period differentiation', () => {
  it('requests days=1 for minute resolution (1H, 4H)', async () => {
    fetchCoinGecko.mockResolvedValue(makeCgCandles(60));
    await fetchOHLCVCG('BTC', 'minute', 60);
    expect(fetchCoinGecko).toHaveBeenCalledWith('coins/ohlc', expect.objectContaining({ days: '1' }));
  });

  it('requests days=7 for hour resolution (1D, 1W) — NOT days=1', async () => {
    fetchCoinGecko.mockResolvedValue(makeCgCandles(42));
    await fetchOHLCVCG('BTC', 'hour', 24);
    expect(fetchCoinGecko).toHaveBeenCalledWith('coins/ohlc', expect.objectContaining({ days: '7' }));
  });

  it('1H and 1D request different days values', async () => {
    fetchCoinGecko.mockResolvedValue(makeCgCandles(60));
    await fetchOHLCVCG('BTC', 'minute', 60);
    const call1H = fetchCoinGecko.mock.calls[0][1].days;

    fetchCoinGecko.mockResolvedValue(makeCgCandles(42));
    await fetchOHLCVCG('BTC', 'hour', 24);
    const call1D = fetchCoinGecko.mock.calls[1][1].days;

    expect(call1H).not.toBe(call1D);
  });

  it('requests days>=31 for day resolution (1M) to get daily candles', async () => {
    fetchCoinGecko.mockResolvedValue(makeCgCandles(30));
    await fetchOHLCVCG('BTC', 'day', 30);
    const days = Number(fetchCoinGecko.mock.calls[0][1].days);
    expect(days).toBeGreaterThanOrEqual(31);
  });
});

describe('candle trimming', () => {
  it('trims to the requested limit when CoinGecko returns more candles', async () => {
    fetchCoinGecko.mockResolvedValue(makeCgCandles(100));
    const candles = await fetchOHLCVCG('BTC', 'minute', 60);
    expect(candles).toHaveLength(60);
  });

  it('keeps the most recent candles when trimming', async () => {
    const raw = makeCgCandles(100);
    fetchCoinGecko.mockResolvedValue(raw);
    const candles = await fetchOHLCVCG('BTC', 'minute', 10);
    expect(candles[candles.length - 1].time).toBe(Math.floor(raw[99][0] / 1000));
  });

  it('returns all candles when fewer than limit', async () => {
    fetchCoinGecko.mockResolvedValue(makeCgCandles(5));
    const candles = await fetchOHLCVCG('BTC', 'hour', 24);
    expect(candles).toHaveLength(5);
  });
});

describe('fetchOHLCVCG — shape', () => {
  it('returns candles with the expected fields', async () => {
    fetchCoinGecko.mockResolvedValue(makeCgCandles(1));
    const [c] = await fetchOHLCVCG('BTC', 'hour', 24);
    expect(c).toHaveProperty('time');
    expect(c).toHaveProperty('open');
    expect(c).toHaveProperty('high');
    expect(c).toHaveProperty('low');
    expect(c).toHaveProperty('close');
    expect(c).toHaveProperty('volumefrom', 0);
  });

  it('throws for an unmapped ticker', async () => {
    await expect(fetchOHLCVCG('SHIB', 'hour', 24)).rejects.toThrow(/no mapping/);
  });
});
