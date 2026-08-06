// lib/__tests__/okx.test.js
//
// Pins that the OKX source goes through the EDGE PROXY and never calls
// www.okx.com directly.
//
// This is a regression guard, not a style preference. The first version of this
// module used a raw fetch() to https://www.okx.com, which broke two things at
// once:
//
//   1. I3 — src/api/edgeApi.js is the deniability chokepoint and guards
//      `DEMO || isDeniabilityOrDemoActive()`. lib/ohlcv.js has its own guard but
//      checks only isDeniabilitySessionActive(), so a DEMO session bypassed both
//      and egressed to okx.com.
//   2. Native — functions/api/data/klines.js documents that a direct call breaks
//      CORS in the iOS/Android Capacitor WebViews, which is why every other
//      market-data source is proxied.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api/edgeApi', () => ({
  fetchOkxCandles: vi.fn(),
}));

import { fetchOkxCandles } from '@/api/edgeApi';
import { fetchOHLCVOkx, hasOkxMapping } from '../okx.js';

// OKX row: [ts(ms), open, high, low, close, vol, volCcy, volCcyQuote, confirm]
// Newest-first, as the real API returns it.
const NOW = 1_700_000_000_000;
const OKX_OK = {
  code: '0',
  msg: '',
  data: [
    [String(NOW),             '3', '4', '2', '3.5', '10', '', '', '1'],
    [String(NOW - 3_600_000), '1', '2', '0.5', '1.5', '20', '', '', '1'],
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchOHLCVOkx — egress routing', () => {
  it('never calls global fetch directly (edge-proxy guard)', async () => {
    const liveFetch = vi.fn(() => Promise.reject(new Error('direct okx.com call')));
    vi.stubGlobal('fetch', liveFetch);
    try {
      fetchOkxCandles.mockResolvedValue(OKX_OK);
      await fetchOHLCVOkx('BTC', 'hour', 2, NOW);
      expect(liveFetch).not.toHaveBeenCalled();
      expect(fetchOkxCandles).toHaveBeenCalledWith('BTC-USDT', '1H', 2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('propagates the edge layer I3 rejection instead of swallowing it', async () => {
    // edgeApi.i3Guard() throws this in a decoy OR demo session. It must surface,
    // not be turned into a generic "okx down" that a caller might retry.
    fetchOkxCandles.mockRejectedValue(
      Object.assign(new Error('I3_DENIABILITY_ACTIVE'), { code: 'I3_DENIABILITY_ACTIVE' }),
    );
    await expect(fetchOHLCVOkx('BTC', 'hour', 2, NOW)).rejects.toThrow('I3_DENIABILITY_ACTIVE');
  });
});

describe('fetchOHLCVOkx — shape and validation', () => {
  it('returns oldest-first candles in the shared shape', async () => {
    fetchOkxCandles.mockResolvedValue(OKX_OK);
    const out = await fetchOHLCVOkx('BTC', 'hour', 2, NOW);
    expect(out).toEqual([
      { time: (NOW - 3_600_000) / 1000, open: 1, high: 2, low: 0.5, close: 1.5, volumefrom: 20 },
      { time: NOW / 1000,               open: 3, high: 4, low: 2,   close: 3.5, volumefrom: 10 },
    ]);
  });

  it('clamps limit to the OKX maximum of 300', async () => {
    fetchOkxCandles.mockResolvedValue(OKX_OK);
    await fetchOHLCVOkx('BTC', 'hour', 9999, NOW);
    expect(fetchOkxCandles).toHaveBeenCalledWith('BTC-USDT', '1H', 300);
  });

  it('throws on an OKX API-level error code', async () => {
    fetchOkxCandles.mockResolvedValue({ code: '51001', msg: 'Instrument ID does not exist', data: [] });
    await expect(fetchOHLCVOkx('BTC', 'hour', 2, NOW)).rejects.toThrow(/51001/);
  });

  it('rejects stale data rather than charting it', async () => {
    fetchOkxCandles.mockResolvedValue(OKX_OK);
    // Newest candle is ~3 days after NOW's clock → far beyond the hour-band window.
    await expect(fetchOHLCVOkx('BTC', 'hour', 2, NOW + 3 * 86_400_000)).rejects.toThrow(/stale/);
  });

  it('maps only allowlisted tickers', () => {
    expect(hasOkxMapping('BTC')).toBe(true);
    expect(hasOkxMapping('USDT')).toBe(false);
  });
});
