import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  LIVE_PRICE_PREF_KEY, isLivePricesEnabled, setLivePricesEnabled,
  SUPPORTED_SYMBOLS, fetchLivePricesUsd,
} from '../priceFeed.js';

describe('live-prices opt-in pref', () => {
  beforeEach(() => { try { localStorage.removeItem(LIVE_PRICE_PREF_KEY); } catch { /* noop */ } });

  it('is OFF by default (absence = off) and toggles', () => {
    expect(isLivePricesEnabled()).toBe(false);
    setLivePricesEnabled(true);
    expect(isLivePricesEnabled()).toBe(true);
    expect(localStorage.getItem(LIVE_PRICE_PREF_KEY)).toBe('1');
    setLivePricesEnabled(false);
    expect(isLivePricesEnabled()).toBe(false);
    expect(localStorage.getItem(LIVE_PRICE_PREF_KEY)).toBeNull(); // off = ABSENT, no "0" tell
  });
});

describe('fetchLivePricesUsd — holdings-agnostic live fetch', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('requests the FULL fixed supported-symbol list (never holdings) in USD', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => Object.fromEntries(SUPPORTED_SYMBOLS.map((s) => [s, { USD: 10 }])),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await fetchLivePricesUsd();
    const url = fetchMock.mock.calls[0][0];
    for (const s of SUPPORTED_SYMBOLS) expect(url).toContain(s);
    expect(url).toContain('tsyms=USD');
    expect(out.ETH).toBe(10);
    expect(Object.keys(out).sort()).toEqual([...SUPPORTED_SYMBOLS].sort());
  });

  it('throws on a non-OK HTTP response (caller treats as unavailable)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    await expect(fetchLivePricesUsd()).rejects.toThrow();
  });
});
