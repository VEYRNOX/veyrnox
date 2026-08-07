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
  it('does not pass a raw PostgREST error through verbatim', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ message: 'permission denied for function track_event', code: '42501' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )));

    const res = await onRequestPost(ctx('track_event'));
    const body = await res.json();

    // Documents CURRENT behaviour: the upstream `message` is surfaced and the
    // PostgREST error `code` is not. Pinned because "permission denied for
    // function X" is exactly what a client would start seeing if the H-3
    // REVOKEs were run before SUPABASE_SERVICE_ROLE_KEY was set — this is the
    // symptom to grep for if that ordering is ever got wrong.
    expect(res.status).toBe(403);
    expect(body.error).toBe('permission denied for function track_event');
    expect(body.code).toBeUndefined();
  });
});
