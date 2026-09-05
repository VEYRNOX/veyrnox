// functions/api/bug-report/__tests__/upload.test.js
//
// Slice 1e-3 — the Pages Function that moves an encrypted bug-report
// envelope from client into Supabase Storage under service_role.
//
// Mutation targets covered:
//   - content-type check dropped → 415-not-thrown test goes green
//   - report_id validation dropped → arbitrary bucket path writes possible
//   - size mismatch check dropped → row misdescribes storage
//   - x-upsert: 'false' removed → replay overwrites an earlier report
//   - PATCH failure propagated as endpoint failure → object stored but
//     endpoint returns 500 (test asserts endpoint stays 200)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the rate-limit helper: allow through by default. Tests that need
// to prove the limiter fires re-configure it inline.
vi.mock('../../_lib/rate-limit.js', () => ({
  enforceRateLimit: vi.fn(async () => {}),
  clientIpOf: () => '203.0.113.1',
}));

let onRequestPost;
beforeEach(async () => {
  vi.resetModules();
  ({ onRequestPost } = await import('../upload.js'));
});
afterEach(() => { vi.restoreAllMocks(); });

const ENV = {
  SUPABASE_URL: 'https://db.example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'srk-test',
  ENVIRONMENT: 'preview',
};
const GOOD_REPORT_ID = '11111111-2222-3333-4444-555555555555';

function makeBody(bytes = 128) {
  return new Uint8Array(bytes).fill(0x42);
}

function makeRequest(headers, body) {
  return new Request('https://veyrnox.com/api/bug-report/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Report-Id': GOOD_REPORT_ID,
      'X-Envelope-Size': String(body.byteLength),
      'CF-Connecting-IP': '203.0.113.1',
      ...headers,
    },
    body,
  });
}

// Helper: install a fetch stub that records calls and returns 200 for
// storage PUT and 204 for the row PATCH.
function installGoodFetch() {
  const calls = [];
  const stub = vi.fn(async (url, init) => {
    calls.push({ url: url.toString(), init });
    if (url.toString().includes('/storage/v1/object/')) {
      return new Response(JSON.stringify({ Key: 'ok' }), { status: 200 });
    }
    if (url.toString().includes('/rest/v1/bug_reports')) {
      return new Response('', { status: 204 });
    }
    return new Response('unhandled', { status: 500 });
  });
  vi.stubGlobal('fetch', stub);
  return { calls, stub };
}

describe('upload — happy path', () => {
  it('returns 200 { ok, report_id } on a good request', async () => {
    installGoodFetch();
    const body = makeBody(64);
    const res = await onRequestPost({ request: makeRequest({}, body), env: ENV });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, report_id: GOOD_REPORT_ID });
  });

  it('PUTs to the bug-reports bucket under the report_id key with .br1 ext', async () => {
    const { calls } = installGoodFetch();
    await onRequestPost({ request: makeRequest({}, makeBody(64)), env: ENV });
    const putCall = calls.find((c) => c.url.includes('/storage/v1/object/'));
    expect(putCall).toBeDefined();
    expect(putCall.url).toContain('/bug-reports/');
    expect(putCall.url).toContain(`${GOOD_REPORT_ID}.br1`);
    expect(putCall.init.headers['x-upsert']).toBe('false');
  });

  it('PATCHes the row to status=uploaded after successful PUT', async () => {
    const { calls } = installGoodFetch();
    await onRequestPost({ request: makeRequest({}, makeBody(64)), env: ENV });
    const patchCall = calls.find((c) => c.url.includes('/rest/v1/bug_reports'));
    expect(patchCall).toBeDefined();
    expect(patchCall.init.method).toBe('PATCH');
    const parsed = JSON.parse(patchCall.init.body);
    expect(parsed.status).toBe('uploaded');
  });
});

describe('upload — input validation (fail-closed I4)', () => {
  it('415 on wrong content-type', async () => {
    installGoodFetch();
    const res = await onRequestPost({
      request: makeRequest({ 'Content-Type': 'application/json' }, makeBody(64)),
      env: ENV,
    }).catch((e) => new Response(e.message, { status: e.status }));
    expect(res.status).toBe(415);
  });

  it('400 on missing / malformed report_id', async () => {
    installGoodFetch();
    for (const bad of ['', 'not-a-uuid', '1234']) {
      const res = await onRequestPost({
        request: makeRequest({ 'X-Report-Id': bad }, makeBody(64)),
        env: ENV,
      }).catch((e) => new Response(e.message, { status: e.status }));
      expect(res.status).toBe(400);
    }
  });

  it('400 on missing / invalid X-Envelope-Size', async () => {
    installGoodFetch();
    const res = await onRequestPost({
      request: makeRequest({ 'X-Envelope-Size': 'nope' }, makeBody(64)),
      env: ENV,
    }).catch((e) => new Response(e.message, { status: e.status }));
    expect(res.status).toBe(400);
  });

  it('400 on body/size mismatch (client lied about length)', async () => {
    installGoodFetch();
    // Body is 64 bytes; header claims 128.
    const req = new Request('https://veyrnox.com/api/bug-report/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Report-Id': GOOD_REPORT_ID,
        'X-Envelope-Size': '128',
        'CF-Connecting-IP': '203.0.113.1',
      },
      body: makeBody(64),
    });
    const res = await onRequestPost({ request: req, env: ENV })
      .catch((e) => new Response(e.message, { status: e.status }));
    expect(res.status).toBe(400);
  });

  it('400 when declared size is 0 or negative', async () => {
    installGoodFetch();
    const res = await onRequestPost({
      request: makeRequest({ 'X-Envelope-Size': '0' }, makeBody(0)),
      env: ENV,
    }).catch((e) => new Response(e.message, { status: e.status }));
    expect(res.status).toBe(400);
  });
});

describe('upload — env / config guards', () => {
  it('503 if SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (any env)', async () => {
    installGoodFetch();
    const res = await onRequestPost({
      request: makeRequest({}, makeBody(64)),
      env: { ENVIRONMENT: 'preview' },
    }).catch((e) => new Response(e.message, { status: e.status }));
    expect(res.status).toBe(503);
  });

  it('503 in production without SUPABASE_SERVICE_ROLE_KEY', async () => {
    installGoodFetch();
    const res = await onRequestPost({
      request: makeRequest({}, makeBody(64)),
      env: { SUPABASE_URL: ENV.SUPABASE_URL, ENVIRONMENT: 'production' },
    }).catch((e) => new Response(e.message, { status: e.status }));
    expect(res.status).toBe(503);
  });
});

describe('upload — storage failure hygiene', () => {
  it('502 (generic) when storage PUT fails, does not leak upstream error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'Duplicate key value violates unique constraint' }),
      { status: 409, headers: { 'content-type': 'application/json' } },
    )));
    const res = await onRequestPost({
      request: makeRequest({}, makeBody(64)),
      env: ENV,
    }).catch((e) => ({ status: e.status, msg: e.message }));
    expect(res.status).toBe(502);
    // Mutation defence: earlier drafts forwarded the storage body verbatim,
    // which leaked constraint names + confirmed report_id existence to any
    // probe. Keep this 502 opaque.
    expect(res.msg).not.toMatch(/Duplicate|constraint|already/i);
  });

  it('still returns 200 when the row PATCH fails (best-effort, sweep cleans up)', async () => {
    // Storage PUT succeeds, row PATCH throws.
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      call += 1;
      if (url.toString().includes('/storage/v1/object/')) {
        return new Response('', { status: 200 });
      }
      throw new Error('network down mid-PATCH');
    }));
    const res = await onRequestPost({
      request: makeRequest({}, makeBody(64)),
      env: ENV,
    });
    expect(res.status).toBe(200);
  });
});
