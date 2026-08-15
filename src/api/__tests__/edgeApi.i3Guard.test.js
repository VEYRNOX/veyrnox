// Codex P1 2026-08-15: fetchPrices/fetchKlines/fetchCoinGecko/fetchGasFees/
// fetchNews used to skip i3Guard() — the module comment declared the layer an
// "I3 CHOKEPOINT: every function checks isDeniabilityOrDemoActive() before
// making a network call" while five /api/data/* helpers did not. Any caller
// (or a UI regression that dropped a react-query `enabled: !decoy`) could
// bypass I3 and emit real network traffic from a decoy/hidden/demo session.
// This pins the invariant so a future edit cannot silently reopen it.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const deniable = vi.fn(() => true);
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@/wallet-core/deniabilitySession', () => ({ isDeniabilityOrDemoActive: () => deniable() }));
vi.mock('@/api/demoClient', () => ({ DEMO: false }));

let fetchMock;
beforeEach(() => {
  vi.resetModules();
  deniable.mockReturnValue(true);
  fetchMock = vi.fn(async () => new Response('{"ok":true}', {
    status: 200, headers: { 'Content-Type': 'application/json' },
  }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('edgeApi I3 gates on /api/data/* — every helper fails closed in decoy/demo', () => {
  const cases = [
    ['fetchPrices',    async (mod) => mod.fetchPrices('simple/price', { ids: 'bitcoin' })],
    ['fetchKlines',    async (mod) => mod.fetchKlines('BTCUSDT', '1h', 100)],
    ['fetchCoinGecko', async (mod) => mod.fetchCoinGecko('coins/list')],
    ['fetchGasFees',   async (mod) => mod.fetchGasFees(false)],
    ['fetchNews',      async (mod) => mod.fetchNews()],
    ['fetchOkxCandles', async (mod) => mod.fetchOkxCandles('BTC-USDT', '1H', 100)],
    // Belt-and-suspenders: the existing i3-guarded surfaces stay guarded.
    ['createBuySession', async (mod) => mod.createBuySession({ asset: 'ETH', network: 'ethereum', address: '0x0' })],
    ['rpc',    async (mod) => mod.rpc('track_event', {})],
    ['edgeFn', async (mod) => mod.edgeFn('first-referral-bonus', {})],
  ];

  it.each(cases)('%s throws I3_DENIABILITY_ACTIVE and NEVER touches fetch', async (_name, call) => {
    const mod = await import('../edgeApi.js');
    await expect(call(mod)).rejects.toMatchObject({ code: 'I3_DENIABILITY_ACTIVE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
