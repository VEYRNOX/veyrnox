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
import { onRequestPost, onRequestGet, upstreamUrlFor } from '../session.js';

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

describe('static-egress relay routing (issue #2655)', () => {
  const STG = 'https://api-stg.transak.com/partners/api/v2/refresh-token';
  const SESSION = 'https://api-gateway.transak.com/api/v2/auth/session';

  it('is a NO-OP when no relay is configured', () => {
    // Merging the relay must not change behaviour until it is deployed.
    expect(upstreamUrlFor(STG, {})).toBe(STG);
    expect(upstreamUrlFor(SESSION, { TRANSAK_PROXY_BASE: '' })).toBe(SESSION);
  });

  it('routes both endpoints through the relay, per environment', () => {
    const env = { TRANSAK_PROXY_BASE: 'https://relay.example', TRANSAK_ENVIRONMENT: 'PRODUCTION' };
    expect(upstreamUrlFor(STG, env)).toBe('https://relay.example/transak/refresh-token/production');
    expect(upstreamUrlFor(SESSION, env)).toBe('https://relay.example/transak/session/production');

    const stg = { TRANSAK_PROXY_BASE: 'https://relay.example' };
    expect(upstreamUrlFor(SESSION, stg)).toBe('https://relay.example/transak/session/staging');
  });

  it('tolerates a trailing slash on the base', () => {
    expect(upstreamUrlFor(SESSION, { TRANSAK_PROXY_BASE: 'https://relay.example///' }))
      .toBe('https://relay.example/transak/session/staging');
  });

  it('falls back to the direct URL for an endpoint it does not recognise', () => {
    // Fail OPEN to Transak rather than silently routing an unknown call.
    const other = 'https://api.transak.com/api/v2/currencies/crypto-currencies';
    expect(upstreamUrlFor(other, { TRANSAK_PROXY_BASE: 'https://relay.example' })).toBe(other);
  });

  it('sends the relay secret only when one is set', async () => {
    await onRequestPost(ctx(VALID));
    const call = fetch.mock.calls.find(([u]) => String(u).includes('auth/session'));
    expect(call[1].headers['x-proxy-secret']).toBeUndefined();

    vi.clearAllMocks();
    mockTransakOk();
    await onRequestPost(ctx(VALID, { env: { ...ENV, TRANSAK_PROXY_SECRET: 'shh' } }));
    const withSecret = fetch.mock.calls.find(([u]) => String(u).includes('auth/session'));
    expect(withSecret[1].headers['x-proxy-secret']).toBe('shh');
  });
});

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

describe('request shape matches the Create Widget URL spec', () => {
  it('sends widgetParams and nothing else at the top level', async () => {
    await onRequestPost(ctx(VALID));

    const call = fetch.mock.calls.find(([u]) => String(u).includes('auth/session'));
    const body = JSON.parse(call[1].body);
    // https://docs.transak.com/reference/create-widget-url — the endpoint takes
    // `widgetParams` only; apiKey/referrerDomain are mandatory INSIDE it.
    expect(Object.keys(body)).toEqual(['widgetParams']);
    expect(body.widgetParams.apiKey).toBe('pk_test');
    expect(body.widgetParams.referrerDomain).toBe('veyrnox.com');
  });

  it('sends the three headers the spec marks required', async () => {
    await onRequestPost(ctx(VALID));

    const call = fetch.mock.calls.find(([u]) => String(u).includes('auth/session'));
    expect(call[1].headers['access-token']).toBe('tok');
    expect(call[1].headers['x-api-key']).toBe('pk_test');
    expect(call[1].headers['x-user-ip']).toBe('203.0.113.7');
  });
});

describe('token re-mint is bounded', () => {
  function mock401CreateSession() {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('refresh-token')) {
        return new Response(JSON.stringify({ data: { accessToken: 'tok' } }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'invalid_api_key' }), { status: 401 });
    }));
  }

  it('does NOT re-mint when the token was freshly minted this request', async () => {
    // A token created seconds ago cannot be expired, so a 401 is about
    // something else. Re-minting here is what turned a live outage into a
    // token-regeneration storm against an endpoint Transak rate-limits.
    mock401CreateSession();

    await thrown(() => onRequestPost(ctx(VALID)));

    const refreshes = fetch.mock.calls.filter(([u]) => String(u).includes('refresh-token'));
    expect(refreshes).toHaveLength(1);
  });

  it('re-mints once when the token came from cache', async () => {
    // Prime the cache so the request starts with a possibly-stale token.
    await cache.put(
      new Request('https://edge-cache.internal/transak-partner-token-STAGING'),
      new Response(JSON.stringify({ accessToken: 'stale' })),
    );
    mock401CreateSession();

    await thrown(() => onRequestPost(ctx(VALID)));

    const refreshes = fetch.mock.calls.filter(([u]) => String(u).includes('refresh-token'));
    expect(refreshes).toHaveLength(1); // exactly one re-mint, not a loop
    const sessions = fetch.mock.calls.filter(([u]) => String(u).includes('auth/session'));
    expect(sessions).toHaveLength(2); // original + one retry
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

  it('fails CLOSED (429) when the rate-limit cache read throws', async () => {
    // 2026-08 audit reversed the prior fail-OPEN policy: an undetected cache
    // outage silently exposing the paid partner account is the worse failure.
    // Pinned so the choice stays visible and matches functions/api/_lib/
    // rate-limit.js which fails closed for the data proxies too.
    //
    // Only the rate-limit key throws. `getPartnerToken` reads its own key from
    // the same cache WITHOUT a try/catch (pre-existing, unchanged here), so a
    // blanket-throwing stub would fail the request for an unrelated reason and
    // this test would pass for the wrong one.
    vi.stubGlobal('caches', {
      default: {
        async match(req) {
          if (String(req.url).includes('/rl/buy-session/')) throw new Error('cache down');
          return undefined;
        },
        async put() {},
      },
    });
    const e = await thrown(() => onRequestPost(ctx(VALID)));
    expect(e.status).toBe(429);
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

describe('Transak WAF Referer requirement (T-INF-103 fix)', () => {
  it('sends Referer=https://veyrnox.com/ on refresh-token and create-session', async () => {
    await onRequestPost(ctx(VALID));
    const calls = globalThis.fetch.mock.calls;
    // Two upstream calls: refresh-token then create-session.
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const [url, init] of calls) {
      expect(String(url)).toMatch(/transak\.com/);
      expect(init.headers['Referer']).toBe('https://veyrnox.com/');
    }
  });
});

describe('upstream error detail is field-selected before it reaches the log', () => {
  // The log line used to be `body=${String(text).slice(0, 500)}` — the whole
  // response body. The request we just sent Transak carries
  // widgetParams.walletAddress, and an API rejecting a payload commonly echoes
  // the offending field back, so a failed create-session could write a user's
  // wallet address into the Workers tail log.
  function mockCreateSessionFailure(body) {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('refresh-token')) {
        return new Response(JSON.stringify({ data: { accessToken: 'tok' } }), { status: 200 });
      }
      return new Response(body, { status: 400 });
    }));
  }

  it('does not log an echoed wallet address', async () => {
    mockCreateSessionFailure(JSON.stringify({
      error: {
        statusCode: 400,
        name: 'BadRequest',
        message: 'Invalid walletAddress',
        // Transak echoing our payload back is the whole hazard.
        request: { walletAddress: VALID.address, apiKey: 'pk_test' },
      },
    }));

    await thrown(() => onRequestPost(ctx(VALID)));

    const line = console.error.mock.calls[0].join(' ');
    expect(line).not.toContain(VALID.address);
    // ...while still carrying what an operator actually greps for.
    expect(line).toContain('BadRequest');
    expect(line).toContain('Invalid walletAddress');
    expect(line).toContain('code=400');
  });

  it('caps each field so a padded body cannot flood the log', async () => {
    mockCreateSessionFailure(JSON.stringify({
      error: { name: 'X', message: 'y'.repeat(5000) },
    }));

    await thrown(() => onRequestPost(ctx(VALID)));

    const line = console.error.mock.calls[0].join(' ');
    expect(line.length).toBeLessThan(600);
    expect(line).toContain('…');
  });

  it('keeps a short slice of an unparseable body', async () => {
    // A WAF challenge page has no field structure to be selective about.
    mockCreateSessionFailure('<html><title>Just a moment…</title></html>');

    await thrown(() => onRequestPost(ctx(VALID)));

    const line = console.error.mock.calls[0].join(' ');
    expect(line).toContain('unparsed=');
    expect(line).toContain('Just a moment');
  });

  it('logs a STRING error field as the message', async () => {
    // Transak's real gateway response for a key it does not recognise. The
    // previous field-selection read .name/.message/.errorCode off the string
    // and logged `code= name= message=`, discarding the only useful word.
    mockCreateSessionFailure(JSON.stringify({ error: 'invalid_api_key' }));

    await thrown(() => onRequestPost(ctx(VALID)));

    const line = console.error.mock.calls[0].join(' ');
    expect(line).toContain('message=invalid_api_key');
  });

  it('logs a bare string body as the message', async () => {
    mockCreateSessionFailure(JSON.stringify('service unavailable'));

    await thrown(() => onRequestPost(ctx(VALID)));

    const line = console.error.mock.calls[0].join(' ');
    expect(line).toContain('message=service unavailable');
  });

  it('still field-selects an OBJECT error envelope', async () => {
    // The string case must not regress the shape this function was written for.
    mockCreateSessionFailure(JSON.stringify({
      error: { name: 'Unauthorized', message: 'nope', errorCode: 1002 },
    }));

    await thrown(() => onRequestPost(ctx(VALID)));

    const line = console.error.mock.calls[0].join(' ');
    expect(line).toContain('code=1002');
    expect(line).toContain('name=Unauthorized');
    expect(line).toContain('message=nope');
  });

  it('strips newlines so a field cannot forge a second log line', async () => {
    mockCreateSessionFailure(JSON.stringify({
      error: { name: 'X', message: 'ok\n[buy/session] forged line status=200' },
    }));

    await thrown(() => onRequestPost(ctx(VALID)));

    const line = console.error.mock.calls[0].join(' ');
    expect(line).not.toContain('\n');
  });
});
