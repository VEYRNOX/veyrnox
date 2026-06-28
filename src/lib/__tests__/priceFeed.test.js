import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  LIVE_PRICE_PREF_KEY, isLivePricesEnabled, setLivePricesEnabled,
  fetchLivePricesUsd,
} from '../priceFeed.js';

describe('live-prices opt-in pref', () => {
  beforeEach(() => { try { localStorage.removeItem(LIVE_PRICE_PREF_KEY); } catch { /* noop */ } });

  it('is ON by default (absence = on) and toggles', () => {
    expect(isLivePricesEnabled()).toBe(true);
    setLivePricesEnabled(false);
    expect(isLivePricesEnabled()).toBe(false);
    expect(localStorage.getItem(LIVE_PRICE_PREF_KEY)).toBe('0'); // off = '0'
    setLivePricesEnabled(true);
    expect(isLivePricesEnabled()).toBe(true);
    expect(localStorage.getItem(LIVE_PRICE_PREF_KEY)).toBeNull(); // on = ABSENT
  });
});

describe('fetchLivePricesUsd — holdings-agnostic live fetch', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('requests the FULL fixed supported-symbol list (never holdings) in USD via CoinGecko', async () => {
    // CoinGecko returns { [coin-id]: { usd: number } } — mock that shape.
    const cgResponse = {
      ethereum: { usd: 10 },
      'usd-coin': { usd: 1 },
      tether: { usd: 1 },
      'matic-network': { usd: 0.5 },
      arbitrum: { usd: 0.8 },
      optimism: { usd: 1.2 },
      'avalanche-2': { usd: 20 },
      binancecoin: { usd: 300 },
      bitcoin: { usd: 60000 },
      solana: { usd: 150 },
    };
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => cgResponse }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await fetchLivePricesUsd();
    const url = fetchMock.mock.calls[0][0];
    // CoinGecko URL uses coin IDs and vs_currencies, not tickers or tsyms
    expect(url).toContain('api.coingecko.com');
    expect(url).toContain('vs_currencies=usd');
    expect(url).toContain('ethereum');
    expect(url).toContain('bitcoin');
    // Output is keyed by Veyrnox ticker
    expect(out.ETH).toBe(10);
    expect(out.BTC).toBe(60000);
  });

  it('throws on a non-OK HTTP response (caller treats as unavailable)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    await expect(fetchLivePricesUsd()).rejects.toThrow();
  });
});
