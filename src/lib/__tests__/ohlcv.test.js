// src/lib/__tests__/ohlcv.test.js
//
// fetchOHLCV — dual-source OHLCV with automatic fallback.
// Primary: Binance public klines (true 1m/1h/1d intervals, real volume,
// generous anonymous rate limit). Fallback: CoinGecko (whose ~5 req/min
// anonymous limit is the root cause of the "timeframe switching breaks the
// chart" bug — see PR notes). Also pins the I3 runtime guard: a deniability
// session must make ZERO egress from this directly-callable export.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/binance.js', () => ({
  fetchOHLCVBinance: vi.fn(),
  hasBinanceMapping: vi.fn(() => true),
}));
vi.mock('@/lib/coinGecko.js', () => ({
  fetchOHLCVCG: vi.fn(),
}));

import { fetchOHLCVBinance, hasBinanceMapping } from '@/lib/binance.js';
import { fetchOHLCVCG } from '@/lib/coinGecko.js';
import { setDeniabilitySession } from '@/wallet-core/deniabilitySession.js';
import { fetchOHLCV } from '../ohlcv.js';

const CANDLES = [{ time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volumefrom: 3 }];
const CG_CANDLES = [{ time: 2, open: 9, high: 9, low: 9, close: 9, volumefrom: 0 }];

beforeEach(() => {
  setDeniabilitySession(false);
  vi.clearAllMocks();
  hasBinanceMapping.mockReturnValue(true);
});

describe('fetchOHLCV — I3 runtime guard (fail closed)', () => {
  it('throws and makes zero egress to either source in a deniability session', async () => {
    setDeniabilitySession(true);
    await expect(fetchOHLCV('BTC', 'hour', 24)).rejects.toThrow(/I3/);
    expect(fetchOHLCVBinance).not.toHaveBeenCalled();
    expect(fetchOHLCVCG).not.toHaveBeenCalled();
    setDeniabilitySession(false);
  });
});

describe('fetchOHLCV — source order and fallback', () => {
  it('returns Binance data without touching CoinGecko when primary succeeds', async () => {
    fetchOHLCVBinance.mockResolvedValue(CANDLES);
    const out = await fetchOHLCV('BTC', 'minute', 60);
    expect(out).toBe(CANDLES);
    expect(fetchOHLCVBinance).toHaveBeenCalledWith('BTC', 'minute', 60);
    expect(fetchOHLCVCG).not.toHaveBeenCalled();
  });

  it('falls back to CoinGecko when Binance throws', async () => {
    fetchOHLCVBinance.mockRejectedValue(new Error('binance HTTP 451'));
    fetchOHLCVCG.mockResolvedValue(CG_CANDLES);
    const out = await fetchOHLCV('BTC', 'hour', 24);
    expect(out).toBe(CG_CANDLES);
    expect(fetchOHLCVCG).toHaveBeenCalledWith('BTC', 'hour', 24);
  });

  it('skips Binance entirely for unmapped tickers (USDT) and uses CoinGecko', async () => {
    hasBinanceMapping.mockReturnValue(false);
    fetchOHLCVCG.mockResolvedValue(CG_CANDLES);
    const out = await fetchOHLCV('USDT', 'hour', 24);
    expect(out).toBe(CG_CANDLES);
    expect(fetchOHLCVBinance).not.toHaveBeenCalled();
  });

  it('treats an empty CoinGecko response as a failure', async () => {
    fetchOHLCVBinance.mockRejectedValue(new Error('binance down'));
    fetchOHLCVCG.mockResolvedValue([]);
    await expect(fetchOHLCV('BTC', 'hour', 24)).rejects.toThrow();
  });

  it('throws when both sources fail', async () => {
    fetchOHLCVBinance.mockRejectedValue(new Error('binance down'));
    fetchOHLCVCG.mockRejectedValue(new Error('coingecko HTTP 429'));
    await expect(fetchOHLCV('BTC', 'hour', 24)).rejects.toThrow();
  });
});
