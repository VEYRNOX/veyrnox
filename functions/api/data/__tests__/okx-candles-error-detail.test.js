// functions/api/data/__tests__/okx-candles-error-detail.test.js
//
// What the proxy SAYS when every OKX host fails.
//
// WHY THIS EXISTS. On 2026-08-07 and 2026-08-08 the `deploy` job's
// "Check edge endpoints" step failed on main with:
//
//     FAIL  okx-candles (chart primary) — HTTP 502 (expected 200)
//
// `staging-gate` is a required merge check and depends on `deploy`, so both
// times a merge gate went red. Neither failure could be diagnosed: the handler
// collapsed every application-level failure to the literal 502 and threw away
// OKX's own `code`, so an upstream RATE LIMIT (HTTP 200 + code 50011 — very
// likely here, since OKX allows 40 req/2s per IP and Cloudflare Workers share
// egress addresses) was indistinguishable from a malformed body or a genuine
// outage. The endpoint returned 200 again minutes later, so the evidence was
// gone by the time anyone looked.
//
// These tests pin the diagnostic, not the happy path. The handler already tries
// three hosts; what was missing was any way to tell WHY all three gave up.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestGet } from '../okx-candles.js';

const URL_OK = 'https://x/api/data/okx-candles?instId=BTC-USDT&bar=1H&limit=5';

function makeContext(url = URL_OK) {
  return { request: new Request(url), waitUntil: () => {} };
}

/** Every host answers identically. */
function stubAllHosts(responder) {
  vi.stubGlobal('fetch', vi.fn(async () => responder()));
}

beforeEach(() => {
  // No cache, so the handler always takes the live path.
  vi.stubGlobal('caches', { default: { match: async () => undefined, put: async () => {} } });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('okx-candles — upstream failure diagnostics', () => {
  it('preserves the OKX application error code (rate limit reads as 50011, not 502)', async () => {
    // OKX signals a rate limit with HTTP 200 and a non-zero `code`.
    stubAllHosts(() => new Response(
      JSON.stringify({ code: '50011', msg: 'Requests too frequent', data: [] }),
      { status: 200 },
    ));

    await expect(onRequestGet(makeContext())).rejects.toThrow(/50011/);
  });

  it('distinguishes an unparseable body from an OKX application error', async () => {
    // A Cloudflare challenge page or truncated response — NOT the same failure
    // as OKX answering with an error code, and it must not read as one.
    stubAllHosts(() => new Response('<html>challenge</html>', { status: 200 }));

    await expect(onRequestGet(makeContext())).rejects.toThrow(/unparseable/i);
  });

  it('keeps the real upstream HTTP status when the host returns one', async () => {
    stubAllHosts(() => new Response('rate limited', { status: 429 }));

    await expect(onRequestGet(makeContext())).rejects.toThrow(/429/);
  });

  it('still reports a network error when no host answers at all', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));

    await expect(onRequestGet(makeContext())).rejects.toThrow(/network error/i);
  });

  it('does NOT echo OKX msg text to the client', async () => {
    // The message is thrown with expose=true, so _middleware.js returns it
    // verbatim in the response body. OKX's `msg` is third-party text and must
    // not become a passthrough channel into our error envelope — the same
    // response-hygiene rule that functions/api/buy/session.js `upstreamErr()`
    // applies to Transak. The CODE is a bounded token and is safe; the prose
    // is not, and belongs in the server-side log instead.
    stubAllHosts(() => new Response(
      JSON.stringify({ code: '50011', msg: 'SENSITIVE-UPSTREAM-PROSE', data: [] }),
      { status: 200 },
    ));

    await expect(onRequestGet(makeContext())).rejects.toThrow(/50011/);
    await expect(onRequestGet(makeContext())).rejects.not.toThrow(/SENSITIVE-UPSTREAM-PROSE/);
  });

  it('logs the full upstream detail server-side, where operators can read it', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubAllHosts(() => new Response(
      JSON.stringify({ code: '50011', msg: 'Requests too frequent', data: [] }),
      { status: 200 },
    ));

    await expect(onRequestGet(makeContext())).rejects.toThrow();

    const logged = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toMatch(/okx-candles/);
    expect(logged).toMatch(/Requests too frequent/);
  });

  it('rejects a bad instId before any upstream call (unchanged)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      onRequestGet(makeContext('https://x/api/data/okx-candles?instId=EVIL-USDT&bar=1H&limit=5')),
    ).rejects.toThrow(/Invalid instId/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
