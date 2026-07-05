import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// CORS (native): the WebView origin (https://localhost) is blocked by CryptoCompare's
// CORS policy, so on native platforms getJson must route through CapacitorHttp (an
// OS-level request, no CORS preflight) and fall back to fetch() on web. Mock the
// plugin surface with a controllable platform flag; the DEFAULT is web (false) so the
// pre-existing fetch()-based tests exercise the unchanged web path.
let nativePlatform = false;
const capHttpGet = vi.fn();
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => nativePlatform },
  CapacitorHttp: { get: (...a) => capHttpGet(...a) },
}));

import {
  PORTFOLIO_SYMBOLS, MARKET_SYMBOLS,
  fetchPortfolioPricesUsd, fetchMarketPricesUsd, fetchMarketPricesFiat, fetchMarketChanges24h,
} from '../cryptoCompare.js';

afterEach(() => vi.restoreAllMocks());

const ok = (json) => vi.fn(async () => ({ ok: true, json: async () => json }));

describe('cryptoCompare — holdings-agnostic by construction', () => {
  it('no USD/changes fetcher accepts a caller symbol list (arity 0)', () => {
    expect(fetchPortfolioPricesUsd.length).toBe(0);
    expect(fetchMarketPricesUsd.length).toBe(0);
    expect(fetchMarketChanges24h.length).toBe(0);
  });

  it('fetchPortfolioPricesUsd requests the fixed PORTFOLIO_SYMBOLS in USD and returns a flat map', async () => {
    const f = ok(Object.fromEntries(PORTFOLIO_SYMBOLS.map((s) => [s, { USD: 5 }])));
    vi.stubGlobal('fetch', f);
    const out = await fetchPortfolioPricesUsd();
    const url = f.mock.calls[0][0];
    expect(url).toContain('/pricemulti?');
    for (const s of PORTFOLIO_SYMBOLS) expect(url).toContain(s);
    expect(url).toContain('tsyms=USD');
    expect(out).toEqual(Object.fromEntries(PORTFOLIO_SYMBOLS.map((s) => [s, 5])));
  });

  it('fetchMarketPricesUsd requests the fixed MARKET_SYMBOLS in USD', async () => {
    const f = ok(Object.fromEntries(MARKET_SYMBOLS.map((s) => [s, { USD: 9 }])));
    vi.stubGlobal('fetch', f);
    const out = await fetchMarketPricesUsd();
    const url = f.mock.calls[0][0];
    for (const s of MARKET_SYMBOLS) expect(url).toContain(s);
    expect(out.BTC).toBe(9);
  });

  it('fetchMarketPricesFiat passes fiats as tsyms and returns the raw matrix', async () => {
    const raw = Object.fromEntries(MARKET_SYMBOLS.map((s) => [s, { USD: 1, EUR: 2 }]));
    const f = ok(raw);
    vi.stubGlobal('fetch', f);
    const out = await fetchMarketPricesFiat(['USD', 'EUR']);
    const url = f.mock.calls[0][0];
    expect(url).toContain('tsyms=USD,EUR');
    expect(out.BTC.EUR).toBe(2);
  });

  it('fetchMarketChanges24h uses pricemultifull and maps CHANGEPCT24HOUR', async () => {
    const raw = { RAW: Object.fromEntries(MARKET_SYMBOLS.map((s) => [s, { USD: { CHANGEPCT24HOUR: 3.5 } }])) };
    const f = ok(raw);
    vi.stubGlobal('fetch', f);
    const out = await fetchMarketChanges24h();
    expect(f.mock.calls[0][0]).toContain('/pricemultifull?');
    expect(out.ETH.change24h).toBe(3.5);
  });

  it('throws on a non-OK HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    await expect(fetchMarketPricesUsd()).rejects.toThrow();
  });
});

describe('cryptoCompare — native CORS routing via CapacitorHttp', () => {
  beforeEach(() => { nativePlatform = true; capHttpGet.mockReset(); });
  afterEach(() => { nativePlatform = false; });

  it('routes through CapacitorHttp.get on native (never fetch)', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    capHttpGet.mockResolvedValue({
      status: 200,
      data: Object.fromEntries(MARKET_SYMBOLS.map((s) => [s, { USD: 7 }])),
    });
    const out = await fetchMarketPricesUsd();
    expect(capHttpGet).toHaveBeenCalledTimes(1);
    expect(capHttpGet.mock.calls[0][0].url).toContain('/pricemulti?');
    expect(f).not.toHaveBeenCalled();
    expect(out.BTC).toBe(7);
  });

  it('parses a STRING data payload (CapacitorHttp may return raw text)', async () => {
    capHttpGet.mockResolvedValue({
      status: 200,
      data: JSON.stringify(Object.fromEntries(MARKET_SYMBOLS.map((s) => [s, { USD: 4 }]))),
    });
    const out = await fetchMarketPricesUsd();
    expect(out.ETH).toBe(4);
  });

  it('throws on a non-2xx CapacitorHttp status (fail honest, no silent empty result)', async () => {
    capHttpGet.mockResolvedValue({ status: 503, data: '' });
    await expect(fetchMarketPricesUsd()).rejects.toThrow(/503/);
  });
});
