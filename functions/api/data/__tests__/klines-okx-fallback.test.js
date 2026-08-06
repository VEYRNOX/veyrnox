// functions/api/data/__tests__/klines-okx-fallback.test.js
//
// The OKX→Binance shape translation in klines.js, exercised directly.
//
// These edge functions are otherwise executed by nothing in CI (vitest does not
// load functions/, and `vite` does not serve /api/* locally), which is how
// /api/data/klines sat at HTTP 502 in production unnoticed. The synthetic check
// in scripts/check-edge-endpoints.mjs covers the deployed behaviour; this covers
// the translation logic, where a silent ordering or index mistake would produce
// a chart that renders but is WRONG — the worst failure mode of the two.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestGet } from '../klines.js';

// Minimal Cloudflare Pages Functions context. caches.default is a no-op so the
// handler always takes the live path.
function makeContext(url) {
  return {
    request: new Request(url),
    waitUntil: () => {},
  };
}

const OKX_BODY = JSON.stringify({
  code: '0',
  msg: '',
  // OKX is NEWEST-FIRST. Binance is oldest-first. The reversal is the thing
  // most likely to be silently wrong, so the fixture makes the order visible.
  data: [
    ['1786000000000', '30', '31', '29', '30.5', '300', '', '3000', '1'],
    ['1785996400000', '20', '21', '19', '20.5', '200', '', '2000', '1'],
    ['1785992800000', '10', '11', '9',  '10.5', '100', '', '1000', '1'],
  ],
});

beforeEach(() => {
  vi.stubGlobal('caches', { default: { match: async () => undefined, put: async () => {} } });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** All Binance hosts fail; OKX serves. */
function stubBinanceDownOkxUp() {
  vi.stubGlobal('fetch', vi.fn(async (u) => {
    if (String(u).includes('okx.com')) return new Response(OKX_BODY, { status: 200 });
    return new Response('blocked', { status: 451 });
  }));
}

describe('klines — OKX fallback when every Binance host fails', () => {
  it('serves Binance-shaped rows, OLDEST-first', async () => {
    stubBinanceDownOkxUp();
    const res = await onRequestGet(makeContext('https://x/api/data/klines?symbol=BTCUSDT&interval=1h&limit=3'));
    expect(res.status).toBe(200);

    const rows = await res.json();
    expect(rows).toHaveLength(3);
    // Oldest first — the reverse of the OKX fixture above.
    expect(rows.map((r) => r[0])).toEqual([1785992800000, 1785996400000, 1786000000000]);
    // OHLCV land in Binance's indices 1-5, which is all src/lib/binance.js reads.
    expect(rows[0].slice(1, 6)).toEqual(['10', '11', '9', '10.5', '100']);
  });

  it('labels the response so a source swap is visible, not silent', async () => {
    stubBinanceDownOkxUp();
    const res = await onRequestGet(makeContext('https://x/api/data/klines?symbol=BTCUSDT&interval=1h&limit=3'));
    expect(res.headers.get('X-Veyrnox-Source')).toBe('okx-fallback');
  });

  it('prefers Binance when it works, and does NOT label those', async () => {
    // Guards the fallback from becoming the default by accident.
    const binanceRows = JSON.stringify([[1, '1', '2', '0.5', '1.5', '9']]);
    vi.stubGlobal('fetch', vi.fn(async (u) => {
      if (String(u).includes('okx.com')) throw new Error('OKX must not be called');
      return new Response(binanceRows, { status: 200 });
    }));
    const res = await onRequestGet(makeContext('https://x/api/data/klines?symbol=BTCUSDT&interval=1h&limit=3'));
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Veyrnox-Source')).toBeNull();
    expect(await res.json()).toEqual([[1, '1', '2', '0.5', '1.5', '9']]);
  });

  it('reports the Binance failure when the pair has no OKX mapping', async () => {
    // USDTUSDC is allowlisted for Binance but absent from the OKX map, so there
    // is no fallback — it must surface as an error, never as an empty success.
    stubBinanceDownOkxUp();
    await expect(
      onRequestGet(makeContext('https://x/api/data/klines?symbol=USDTUSDC&interval=1h&limit=3')),
    ).rejects.toThrow(/OKX fallback unavailable/);
  });

  it('still rejects a symbol outside the allowlist', async () => {
    stubBinanceDownOkxUp();
    await expect(
      onRequestGet(makeContext('https://x/api/data/klines?symbol=EVILUSDT&interval=1h&limit=3')),
    ).rejects.toThrow(/Invalid symbol/);
  });

  it('maps the 1d interval to OKX 1D (case matters to OKX)', async () => {
    const seen = [];
    vi.stubGlobal('fetch', vi.fn(async (u) => {
      seen.push(String(u));
      if (String(u).includes('okx.com')) return new Response(OKX_BODY, { status: 200 });
      return new Response('blocked', { status: 451 });
    }));
    await onRequestGet(makeContext('https://x/api/data/klines?symbol=ETHUSDT&interval=1d&limit=3'));
    const okxCall = seen.find((u) => u.includes('okx.com'));
    expect(okxCall).toContain('instId=ETH-USDT');
    expect(okxCall).toContain('bar=1D');
  });
});
