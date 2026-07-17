// src/lib/__tests__/binance.test.js
//
// fetchOHLCVBinance — secondary OHLCV source (Binance public klines, no API key).
// Pins: ticker→pair mapping (incl. MATIC→POLUSDT, USDT unmapped), resolution→
// interval mapping, response-shape conversion to the CryptoCompare candle shape
// used app-wide, and the staleness guard (delisted pairs like MATICUSDT keep
// returning HTTP 200 with frozen candles — that must throw, not render as live).

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
  CapacitorHttp: { get: vi.fn() },
}));

import { fetchOHLCVBinance, hasBinanceMapping } from '../binance.js';

const NOW_MS = 1_784_268_000_000; // fixed "now" for staleness checks

/** Build one raw Binance kline row: [openTime, o, h, l, c, vol, ...]. */
const kline = (openTimeMs, o = '100', h = '110', l = '90', c = '105', v = '12.5') =>
  [openTimeMs, o, h, l, c, v, openTimeMs + 59_999, '0', 1, '0', '0', '0'];

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

const okJson = (body) =>
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => body });

describe('hasBinanceMapping', () => {
  it('maps the charted tickers', () => {
    for (const s of ['BTC', 'ETH', 'BNB', 'SOL', 'USDC', 'XRP', 'DOGE', 'ADA', 'TRX', 'MATIC', 'ARB', 'OP', 'AVAX']) {
      expect(hasBinanceMapping(s)).toBe(true);
    }
  });
  it('leaves USDT unmapped (no reliable Binance USD pair — CoinGecko-only)', () => {
    expect(hasBinanceMapping('USDT')).toBe(false);
  });
  it('leaves unknown tickers unmapped', () => {
    expect(hasBinanceMapping('NOPE')).toBe(false);
  });
});

describe('fetchOHLCVBinance — request construction', () => {
  it('requests the mapped pair with the mapped interval and limit', async () => {
    okJson([kline(NOW_MS - 60_000)]);
    await fetchOHLCVBinance('BTC', 'minute', 60, NOW_MS);
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('symbol=BTCUSDT');
    expect(url).toContain('interval=1m');
    expect(url).toContain('limit=60');
  });

  it('maps hour→1h and day→1d', async () => {
    okJson([kline(NOW_MS - 3_600_000)]);
    await fetchOHLCVBinance('ETH', 'hour', 24, NOW_MS);
    expect(fetchMock.mock.calls[0][0]).toContain('interval=1h');

    okJson([kline(NOW_MS - 86_400_000)]);
    await fetchOHLCVBinance('ETH', 'day', 30, NOW_MS);
    expect(fetchMock.mock.calls[1][0]).toContain('interval=1d');
  });

  it('maps MATIC to POLUSDT (MATIC→POL migration; MATICUSDT is delisted/frozen)', async () => {
    okJson([kline(NOW_MS - 86_400_000)]);
    await fetchOHLCVBinance('MATIC', 'day', 30, NOW_MS);
    expect(fetchMock.mock.calls[0][0]).toContain('symbol=POLUSDT');
  });

  it('clamps limit to Binance max 1000', async () => {
    okJson([kline(NOW_MS - 60_000)]);
    await fetchOHLCVBinance('BTC', 'minute', 5000, NOW_MS);
    expect(fetchMock.mock.calls[0][0]).toContain('limit=1000');
  });

  it('throws on unmapped ticker without any fetch', async () => {
    await expect(fetchOHLCVBinance('USDT', 'hour', 24, NOW_MS)).rejects.toThrow(/no mapping/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on unsupported resolution without any fetch', async () => {
    await expect(fetchOHLCVBinance('BTC', 'week', 4, NOW_MS)).rejects.toThrow(/resolution/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('fetchOHLCVBinance — response mapping', () => {
  it('converts klines to the CryptoCompare candle shape (numbers, seconds, real volume)', async () => {
    okJson([kline(NOW_MS - 120_000, '100.5', '110.1', '90.2', '105.9', '12.5')]);
    const out = await fetchOHLCVBinance('BTC', 'minute', 60, NOW_MS);
    expect(out).toEqual([
      {
        time: Math.floor((NOW_MS - 120_000) / 1000),
        open: 100.5,
        high: 110.1,
        low: 90.2,
        close: 105.9,
        volumefrom: 12.5,
      },
    ]);
  });

  it('throws on HTTP error status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 451, json: async () => ({}) });
    await expect(fetchOHLCVBinance('BTC', 'hour', 24, NOW_MS)).rejects.toThrow(/451/);
  });

  it('throws on empty response (caller falls back to the secondary source)', async () => {
    okJson([]);
    await expect(fetchOHLCVBinance('BTC', 'hour', 24, NOW_MS)).rejects.toThrow(/empty/);
  });

  it('throws on non-array response', async () => {
    okJson({ code: -1121, msg: 'Invalid symbol.' });
    await expect(fetchOHLCVBinance('BTC', 'hour', 24, NOW_MS)).rejects.toThrow();
  });
});

describe('fetchOHLCVBinance — staleness guard (I4: never present frozen data as live)', () => {
  it('throws when the newest candle is far older than the resolution allows', async () => {
    // Delisted-pair symptom: HTTP 200 with candles frozen months ago.
    okJson([kline(NOW_MS - 90 * 86_400_000)]);
    await expect(fetchOHLCVBinance('BTC', 'hour', 24, NOW_MS)).rejects.toThrow(/stale/);
  });

  it('accepts a fresh daily candle up to 3 intervals old', async () => {
    okJson([kline(NOW_MS - 2 * 86_400_000)]);
    const out = await fetchOHLCVBinance('BTC', 'day', 30, NOW_MS);
    expect(out).toHaveLength(1);
  });
});
