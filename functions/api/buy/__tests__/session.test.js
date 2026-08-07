// functions/api/buy/__tests__/session.test.js
//
// Hardening tests for the Transak session proxy.
//
// This endpoint is unauthenticated by design, CORS-reachable, and every POST
// spends a real upstream `POST /api/v2/auth/session` against the Veyrnox
// Transak partner account. It shipped with no rate limit of any kind and with
// both upstream failure paths echoing up to 300 characters of the third-party
// error body straight to the caller (`err()` sets `expose = true`, which
// _middleware.js returns verbatim).
//
// Nothing under functions/ was executed by CI until the vitest glob landed in
// 65e1cb45, so neither had ever been exercised by a test.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestPost, onRequestGet } from '../session.js';

const ENV = {
  TRANSAK_API_KEY: 'pk_test',
  TRANSAK_API_SECRET: 'sk_test',
  TRANSAK_ENVIRONMENT: 'STAGING',
};

/** In-memory stand-in for the Cloudflare Cache API. */
function makeCache() {
  const store = new Map();
  return {
    store,
    async match(req) {
      const v = store.get(req.url);
      return v === undefined ? undefined : new Response(v);
    },
    async put(req, res) { store.set(req.url, await res.text()); },
    async delete(req) { return store.delete(req.url); },
  };
}

let cache;

function ctx(body, { ip = '203.0.113.7', env = ENV } = {}) {
  return {
    request: new Request('https://veyrnox.com/api/buy/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
      body: JSON.stringify(body),
    }),
    env,
  };
}

const VALID = { asset: 'ETH', network: 'ethereum', address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' };

/** Captures the thrown error object the middleware would turn into a response. */
async function thrown(fn) {
  try { await fn(); } catch (e) { return e; }
  throw new Error('expected a throw');
}

function mockTransakOk() {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (String(url).includes('refresh-token')) {
      return new Response(JSON.stringify({ data: { accessToken: 'tok' } }), { status: 200 });
    }
    return new Response(JSON.stringify({ data: { widgetUrl: 'https://global-stg.transak.com/?x=1' } }), { status: 200 });
  }));
}

beforeEach(() => {
  cache = makeCache();
  vi.stubGlobal('caches', { default: cache });
  mockTransakOk();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('happy path', () => {
  it('returns the Transak widget URL', async () => {
    const res = await onRequestPost(ctx(VALID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://global-stg.transak.com/?x=1' });
  });

  it('rejects GET', async () => {
    expect((await onRequestGet()).status).toBe(405);
  });
});

describe('upstream errors are not echoed to the client', () => {
  it('does not leak the refresh-token error body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      'INTERNAL: partner acct 88213 suspended; contact ops@transak',
      { status: 500 },
    )));

    const e = await thrown(() => onRequestPost(ctx(VALID)));

    expect(e.status).toBe(502);
    expect(e.expose).toBe(true); // the generic text IS meant to reach the client
    expect(e.message).not.toContain('partner acct 88213');
    expect(e.message).not.toContain('ops@transak');
    expect(e.message).toMatch(/^Buy is temporarily unavailable \(ref [0-9a-f]{8}\)$/);
  });

  it('does not leak the create-session error body', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('refresh-token')) {
        return new Response(JSON.stringify({ data: { accessToken: 'tok' } }), { status: 200 });
      }
      return new Response('INTERNAL: kyc rule 7731 tripped for 203.0.113.7', { status: 422 });
    }));

    const e = await thrown(() => onRequestPost(ctx(VALID)));

    expect(e.status).toBe(502);
    expect(e.message).not.toContain('kyc rule 7731');
    expect(e.message).not.toContain('203.0.113.7');
  });

  it('still records the real detail server-side, correlated by ref', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('partner acct 88213 suspended', { status: 500 })));

    const e = await thrown(() => onRequestPost(ctx(VALID)));

    const ref = e.message.match(/ref ([0-9a-f]{8})/)[1];
    const logged = console.error.mock.calls.flat().join(' ');
    // Detail must be preserved for operators — suppressed, not discarded.
    expect(logged).toContain('partner acct 88213');
    expect(logged).toContain(ref);
  });
});

describe('per-IP rate limit', () => {
  it('allows up to the cap then refuses with 429', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await onRequestPost(ctx(VALID))).status).toBe(200);
    }
    const e = await thrown(() => onRequestPost(ctx(VALID)));
    expect(e.status).toBe(429);
  });

  it('does not spend partner quota once the cap is hit', async () => {
    for (let i = 0; i < 10; i++) await onRequestPost(ctx(VALID));
    const before = globalThis.fetch.mock.calls.length;

    await thrown(() => onRequestPost(ctx(VALID)));

    // The whole point: a throttled request must not reach Transak.
    expect(globalThis.fetch.mock.calls.length).toBe(before);
  });

  it('buckets per IP — one abuser does not throttle everyone else', async () => {
    for (let i = 0; i < 10; i++) await onRequestPost(ctx(VALID, { ip: '203.0.113.7' }));
    await thrown(() => onRequestPost(ctx(VALID, { ip: '203.0.113.7' })));

    const other = await onRequestPost(ctx(VALID, { ip: '198.51.100.4' }));
    expect(other.status).toBe(200);
  });

  it('refuses outright when the client IP is unknown', async () => {
    // A shared "unknown" bucket would let one abuser exhaust the allowance for
    // every other unidentifiable caller, so unknown gets none (I4).
    const req = new Request('https://veyrnox.com/api/buy/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID),
    });
    const e = await thrown(() => onRequestPost({ request: req, env: ENV }));
    expect(e.status).toBe(429);
  });

  it('fails OPEN if the rate-limit cache read throws', async () => {
    // Deliberate exception to this codebase's fail-closed default: the limiter
    // protects a spend quota, not key material, and turning a cache blip into a
    // total Buy outage is the worse failure. Pinned so the choice stays visible.
    //
    // Only the rate-limit key throws. `getPartnerToken` reads its own key from
    // the same cache WITHOUT a try/catch (pre-existing, unchanged here), so a
    // blanket-throwing stub would fail the request for an unrelated reason and
    // this test would pass for the wrong one.
    vi.stubGlobal('caches', {
      default: {
        async match(req) {
          if (String(req.url).includes('buy-session-rl')) throw new Error('cache down');
          return undefined;
        },
        async put() {},
      },
    });
    expect((await onRequestPost(ctx(VALID))).status).toBe(200);
  });
});

describe('forwarded parameter validation', () => {
  it.each([
    ['not-a-number', 'abc'],
    ['negative', -5],
    ['zero', 0],
    // As a JSON *string* — a bare Infinity cannot survive JSON.stringify
    // (it serialises to null), so the string form is the reachable case.
    ['Infinity as a string', 'Infinity'],
    ['absurd', 5_000_000],
  ])('rejects fiatAmount: %s', async (_label, fiatAmount) => {
    const e = await thrown(() => onRequestPost(ctx({ ...VALID, fiatAmount })));
    expect(e.status).toBe(400);
    expect(e.message).toBe('Invalid fiatAmount');
  });

  it('rejects a malformed fiatCurrency', async () => {
    const e = await thrown(() => onRequestPost(ctx({ ...VALID, fiatCurrency: 'POUNDS' })));
    expect(e.status).toBe(400);
    expect(e.message).toBe('Invalid fiatCurrency');
  });

  it('accepts and normalises a valid fiatCurrency', async () => {
    const res = await onRequestPost(ctx({ ...VALID, fiatCurrency: 'gbp', fiatAmount: 100 }));
    expect(res.status).toBe(200);
    const sent = JSON.parse(globalThis.fetch.mock.calls.at(-1)[1].body);
    expect(sent.widgetParams.fiatCurrency).toBe('GBP');
    expect(sent.widgetParams.fiatAmount).toBe(100);
  });

  it('keeps the existing asset/network and address guards', async () => {
    expect((await thrown(() => onRequestPost(ctx({ ...VALID, asset: 'DOGE' })))).status).toBe(400);
    expect((await thrown(() => onRequestPost(ctx({ ...VALID, address: 'short' })))).status).toBe(400);
  });
});
