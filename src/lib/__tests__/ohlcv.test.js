// src/lib/__tests__/ohlcv.test.js
//
// fetchOHLCV — dual-source OHLCV with automatic fallback.
// Primary: OKX public market candles (true 1m/1H/1D bars, real volume, 40 req/2s
// anonymous limit). Fallback: CoinGecko (whose ~5 req/min anonymous limit is the
// root cause of the "timeframe switching breaks the chart" bug — see PR notes).
// Also pins the I3 runtime guard: a deniability session must make ZERO egress
// from this directly-callable export.
//
// BOTH sources are mocked. That is load-bearing, not tidiness: ohlcv.js picks its
// primary by module import, so a mock aimed at the wrong module leaves the REAL
// fetcher in place and the suite starts making live market-data calls from CI —
// which is exactly what happened when the primary moved from Binance to OKX and
// this file still mocked '@/lib/binance.js'. Two of the cases below assert
// REJECTION, so live data made them fail open rather than fail loudly.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/okx.js', () => ({
  fetchOHLCVOkx: vi.fn(),
  hasOkxMapping: vi.fn(() => true),
}));
vi.mock('@/lib/coinGecko.js', () => ({
  fetchOHLCVCG: vi.fn(),
}));

import { fetchOHLCVOkx, hasOkxMapping } from '@/lib/okx.js';
import { fetchOHLCVCG } from '@/lib/coinGecko.js';
import { setDeniabilitySession } from '@/wallet-core/deniabilitySession.js';
import { fetchOHLCV } from '../ohlcv.js';

const CANDLES = [{ time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volumefrom: 3 }];
const CG_CANDLES = [{ time: 2, open: 9, high: 9, low: 9, close: 9, volumefrom: 0 }];

beforeEach(() => {
  setDeniabilitySession(false);
  vi.clearAllMocks();
  hasOkxMapping.mockReturnValue(true);
});

describe('fetchOHLCV — I3 runtime guard (fail closed)', () => {
  it('throws and makes zero egress to either source in a deniability session', async () => {
    setDeniabilitySession(true);
    await expect(fetchOHLCV('BTC', 'hour', 24)).rejects.toThrow(/I3/);
    expect(fetchOHLCVOkx).not.toHaveBeenCalled();
    expect(fetchOHLCVCG).not.toHaveBeenCalled();
    setDeniabilitySession(false);
  });
});

describe('fetchOHLCV — no live network from the unit suite', () => {
  it('never reaches global fetch for a mapped ticker (mock-drift tripwire)', async () => {
    // The guard that would have caught the Binance→OKX mock drift immediately.
    // Every source this module can reach must be mocked; if a future edit
    // repoints the primary at a module this file does not mock, the real
    // fetcher runs, calls global fetch, and this goes red — instead of the suite
    // quietly making live market-data requests from CI and passing.
    const liveFetch = vi.fn(() => Promise.reject(new Error('live network call')));
    vi.stubGlobal('fetch', liveFetch);
    try {
      fetchOHLCVOkx.mockResolvedValue(CANDLES);
      await fetchOHLCV('BTC', 'hour', 24);
      expect(liveFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('fetchOHLCV — source order and fallback', () => {
  it('returns OKX data without touching CoinGecko when primary succeeds', async () => {
    fetchOHLCVOkx.mockResolvedValue(CANDLES);
    const out = await fetchOHLCV('BTC', 'minute', 60);
    expect(out).toBe(CANDLES);
    expect(fetchOHLCVOkx).toHaveBeenCalledWith('BTC', 'minute', 60);
    expect(fetchOHLCVCG).not.toHaveBeenCalled();
  });

  it('falls back to CoinGecko when OKX throws', async () => {
    fetchOHLCVOkx.mockRejectedValue(new Error('okx HTTP 451'));
    fetchOHLCVCG.mockResolvedValue(CG_CANDLES);
    const out = await fetchOHLCV('BTC', 'hour', 24);
    expect(out).toBe(CG_CANDLES);
    expect(fetchOHLCVCG).toHaveBeenCalledWith('BTC', 'hour', 24);
  });

  it('skips OKX entirely for unmapped tickers (USDT) and uses CoinGecko', async () => {
    hasOkxMapping.mockReturnValue(false);
    fetchOHLCVCG.mockResolvedValue(CG_CANDLES);
    const out = await fetchOHLCV('USDT', 'hour', 24);
    expect(out).toBe(CG_CANDLES);
    expect(fetchOHLCVOkx).not.toHaveBeenCalled();
  });

  it('treats an empty CoinGecko response as a failure', async () => {
    fetchOHLCVOkx.mockRejectedValue(new Error('okx down'));
    fetchOHLCVCG.mockResolvedValue([]);
    await expect(fetchOHLCV('BTC', 'hour', 24)).rejects.toThrow();
  });

  it('throws when both sources fail', async () => {
    fetchOHLCVOkx.mockRejectedValue(new Error('okx down'));
    fetchOHLCVCG.mockRejectedValue(new Error('coingecko HTTP 429'));
    await expect(fetchOHLCV('BTC', 'hour', 24)).rejects.toThrow();
  });
});
