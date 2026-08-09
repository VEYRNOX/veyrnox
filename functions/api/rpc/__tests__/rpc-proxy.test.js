// functions/api/rpc/__tests__/rpc-proxy.test.js
//
// The /api/rpc/<fn> proxy is the single server-side chokepoint for every
// Supabase RPC the app makes: src/api/edgeApi.js `rpc()` posts here, and nothing
// under src/ reaches PostgREST directly.
//
// It is about to hold the SERVICE-ROLE key, which bypasses RLS. That makes
// ALLOWED_RPCS the only boundary between a caller and those functions, so the
// allowlist gets pinned here rather than trusted. Nothing under functions/ was
// executed by CI until the vitest glob landed in 65e1cb45.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestPost } from '../[fn].js';

const URL_BASE = 'https://db.example.supabase.co';

function ctx(fn, env = { SUPABASE_URL: URL_BASE, SUPABASE_ANON_KEY: 'anon-key' }) {
  return {
    request: new Request(`https://veyrnox.com/api/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_device_id: 'd' }),
    }),
    env,
    params: { fn },
  };
}

async function thrown(fn) {
  try { await fn(); } catch (e) { return e; }
  throw new Error('expected a throw');
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}', {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('credential selection', () => {
  it('uses the service-role key when it is set', async () => {
    await onRequestPost(ctx('track_event', {
      SUPABASE_URL: URL_BASE,
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    }));

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.headers.apikey).toBe('service-key');
    expect(init.headers.Authorization).toBe('Bearer service-key');
  });

  it('falls back to the anon key when the service-role key is absent', async () => {
    // Makes deploying this change a no-op until the secret is set, so the
    // deploy and the secret can land independently. See the ordering note in
    // [fn].js — the SQL REVOKEs must not run until the secret IS set.
    await onRequestPost(ctx('track_event'));

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.headers.apikey).toBe('anon-key');
  });

  it('503s when neither key is configured', async () => {
    const e = await thrown(() => onRequestPost(ctx('track_event', { SUPABASE_URL: URL_BASE })));
    expect(e.status).toBe(503);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('RPC allowlist — the only boundary once service_role is in play', () => {
  it.each([
    'track_event',
    'generate_referral_code',
    'register_referral_code',
    'increment_referral',
    'get_referral_count',
    'get_referral_paid_count',
    'record_attribution',
    'get_referral_earnings',
  ])('allows %s', async (fn) => {
    const res = await onRequestPost(ctx(fn));
    expect(res.status).toBe(200);
  });

  it.each([
    ['an unlisted function', 'drop_everything'],
    ['a table read', 'referral_attributions'],
    ['path traversal out of /rpc/', '../../rest/v1/referral_codes'],
    ['an absolute URL', 'https://evil.com/x'],
    ['empty', ''],
  ])('refuses %s', async (_label, fn) => {
    const e = await thrown(() => onRequestPost(ctx(fn)));
    expect(e.status).toBe(403);
    // Nothing may reach Supabase — a rejected name must not be fetched at all.
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('never lets the function name escape the /rest/v1/rpc/ path', async () => {
    await onRequestPost(ctx('track_event'));
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`${URL_BASE}/rest/v1/rpc/track_event`);
    // Host is taken from env, never from caller input.
    expect(new URL(url).host).toBe(new URL(URL_BASE).host);
  });
});

describe('response hygiene', () => {
  // The rule this suite pins: an error the SQL AUTHOR wrote is for the client;
  // an error POSTGRES wrote is not.
  //
  // Our SECURITY DEFINER functions raise deliberate, user-facing errors with
  // their own SQLSTATEs (sql/api-security-hardening.sql):
  //     P0001 'Code not found: %'   P0003 'Unknown event'
  //     P0006 'device_id required'  P0007 'Invalid plan'
  //     P0008 'Invalid revenue'     22004 'device_id required'
  // Those must reach the caller — src/api/referralApi.js matches
  // `e.message?.includes('not found')` to turn a bad referral code into a 404
  // "Code not found", so genericising everything would silently break that.
  //
  // Everything else is Postgres talking about itself — 'permission denied for
  // function X' (42501), constraint names on 23505, internal detail/hint — and
  // is now generic + logged. That matters more since #1606 put the proxy on the
  // service_role key: RLS is bypassed, so failures surface the underlying
  // database error rather than a uniform permission denial.

  it('forwards an application error the SQL author wrote (P0001)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ message: 'Code not found: ABC123', code: 'P0001' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )));

    const res = await onRequestPost(ctx('increment_referral'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('Code not found: ABC123');
    expect(body.code).toBeUndefined();
  });

  it('does NOT forward a Postgres permission error (42501)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ message: 'permission denied for function track_event', code: '42501' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )));

    const res = await onRequestPost(ctx('track_event'));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).not.toMatch(/permission denied/);
    expect(body.code).toBeUndefined();
    // The RPC NAME is fine to echo and is deliberately not asserted against:
    // the caller put it in the request path (/api/rpc/track_event) and
    // ALLOWED_RPCS gates it, so `RPC track_event failed` discloses nothing the
    // caller did not supply. What must not come back is Postgres describing
    // itself — the permission text above, constraint names, detail/hint.
    expect(body.error).toBe('RPC track_event failed');
  });

  it('does NOT forward a constraint-violation message (23505)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({
        message: 'duplicate key value violates unique constraint "uq_referral_attributions_hour_dedup"',
        code: '23505',
        details: 'Key (referral_code, plan)=(ABC, annual) already exists.',
      }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    )));

    const res = await onRequestPost(ctx('record_attribution'));
    const body = await res.json();

    expect(body.error).not.toMatch(/uq_referral_attributions/);
    expect(body.error).not.toMatch(/duplicate key/);
    expect(JSON.stringify(body)).not.toMatch(/already exists/);
  });

  it('does not write the conflicting VALUES to the log either (23505 details)', async () => {
    // From the 2026-08-09 daily security diff. The response was already clean;
    // the LOG was not. It wrote `responseBody.slice(0, 500)` — the whole
    // PostgREST object — and PostgREST puts the constraint name in `message`
    // but the conflicting VALUES in `details`. On our dedup tables those values
    // are a device_id or a referral code, and `veyrnox-device-id` is treated as
    // residue-grade elsewhere in this codebase (DIFF-0723).
    //
    // The split is deliberate: `message` stays (it is the H-3 canary and names
    // the constraint), `details`/`hint` go.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({
        message: 'duplicate key value violates unique constraint "uq_referral_attributions_hour_dedup"',
        code: '23505',
        details: 'Key (device_id, referral_code)=(dev-abc123, GOLD42) already exists.',
        hint: 'Retry with a different device_id.',
      }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    )));

    await onRequestPost(ctx('record_attribution'));

    const logged = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    // Kept — this is what an operator greps for.
    expect(logged).toMatch(/uq_referral_attributions_hour_dedup/);
    expect(logged).toMatch(/23505/);
    // Dropped — these are user values.
    expect(logged).not.toMatch(/dev-abc123/);
    expect(logged).not.toMatch(/GOLD42/);
    expect(logged).not.toMatch(/already exists/);
    expect(logged).not.toMatch(/Retry with a different/);
  });

  it('gives the caller a correlation ref and logs the real error', async () => {
    // The H-3 canary is NOT lost, it MOVES. "permission denied for function X"
    // is exactly what appears if the REVOKEs are run before
    // SUPABASE_SERVICE_ROLE_KEY is set, and it stays greppable — in the Workers
    // tail log, tied to the ref the caller was given, instead of being handed
    // to every client.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ message: 'permission denied for function track_event', code: '42501' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )));

    const res = await onRequestPost(ctx('track_event'));
    const body = await res.json();

    expect(body.ref).toMatch(/^[0-9a-f]{8}$/);
    const logged = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toMatch(/permission denied for function track_event/);
    expect(logged).toMatch(body.ref);
  });

  it('does not leak upstream text when the body is not JSON at all', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '<html>gateway exploded at /var/lib/postgres</html>',
      { status: 502, headers: { 'Content-Type': 'text/html' } },
    )));

    const res = await onRequestPost(ctx('track_event'));
    const body = await res.json();

    expect(JSON.stringify(body)).not.toMatch(/var\/lib\/postgres/);
    expect(res.status).toBe(502);
  });
});
