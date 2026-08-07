// src/api/__tests__/edgeApi.nativeBase.test.js
//
// Every external call in this app routes through /api/* (e99dd422). On web that
// is same-origin and correct. On NATIVE it is not: capacitor.config.json sets no
// `server.url`, so the bundle loads from webDir and the document origin is
// capacitor://localhost (iOS) or https://localhost (Android). A relative
// /api/* resolves against the local bundle, which serves no /api/*, so every
// edge call fails inside the webview — prices, klines, news, gas, referrals,
// telemetry and the Transak buy session.
//
// Nothing caught it because the Play build in the store predates e99dd422 and
// still called Supabase directly; the breakage lands on the NEXT native build.
// These tests pin the guard so it cannot regress into silence again.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const isNativePlatform = vi.fn(() => false);
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => isNativePlatform() } }));
vi.mock('@/wallet-core/deniabilitySession', () => ({ isDeniabilityOrDemoActive: () => false }));
vi.mock('@/api/demoClient', () => ({ DEMO: false }));

let fetchMock;

beforeEach(() => {
  vi.resetModules();
  isNativePlatform.mockReturnValue(false);
  fetchMock = vi.fn(async () => new Response('{"ok":true}', {
    status: 200, headers: { 'Content-Type': 'application/json' },
  }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('web: relative /api/* is correct and preserved', () => {
  it('issues a relative path when no base is configured', async () => {
    const { fetchPrices } = await import('../edgeApi.js');
    await fetchPrices('simple/price', { ids: 'bitcoin' });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url.startsWith('/api/')).toBe(true);
  });

  it('does not throw on web when the base is unset', async () => {
    const { rpc } = await import('../edgeApi.js');
    await expect(rpc('track_event', {})).resolves.toBeTruthy();
  });
});

describe('native: an unset base fails loudly instead of 404ing silently', () => {
  beforeEach(() => { isNativePlatform.mockReturnValue(true); });

  it('throws EDGE_BASE_UNSET rather than emitting a doomed request', async () => {
    const { rpc } = await import('../edgeApi.js');

    await expect(rpc('track_event', {})).rejects.toMatchObject({ code: 'EDGE_BASE_UNSET' });
    // The point of the guard: no request is made at all. A relative fetch here
    // would hit capacitor://localhost/api/... and fail with a confusing 404.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('covers GET paths too, not just POST', async () => {
    const { fetchPrices } = await import('../edgeApi.js');

    await expect(fetchPrices('simple/price', { ids: 'bitcoin' }))
      .rejects.toMatchObject({ code: 'EDGE_BASE_UNSET' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('native: a configured base produces absolute URLs', () => {
  beforeEach(() => {
    isNativePlatform.mockReturnValue(true);
    vi.stubEnv('VITE_EDGE_BASE', 'https://veyrnox.com');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('prefixes the origin so the request leaves the webview', async () => {
    const { rpc } = await import('../edgeApi.js');
    await rpc('track_event', {});

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toBe('https://veyrnox.com/api/rpc/track_event');
    // That origin must also be in index.html's CSP connect-src, or the webview
    // blocks it before it reaches the network — the second half of this fix.
  });
});
