// Run: deno test --allow-env supabase/functions/tip-manifest/__tests__/tip-manifest.test.ts

import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { handle } from '../index.ts';

const API_KEY = 'test-api-key';
const SIGNING_SECRET = 'test-signing-secret';

const baseEnv = (k: string) => ({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'srk',
  TIP_BASE_URL: 'https://tip.example/',
  TIP_API_KEY: API_KEY,
  TIP_SIGNING_SECRET: SIGNING_SECRET,
} as Record<string, string>)[k];

const MANIFEST = JSON.stringify({
  payload: { version: 'v1', generated_at: '2026-10-03T00:00:00Z', entries: [] },
  signature: 'c2ln',
  public_key_id: 'veyrnox-ioc-v1',
});
const STALE = JSON.stringify({
  payload: { version: 'v1', generated_at: '2026-10-01T00:00:00Z', entries: [] },
  signature: 'b2xk',
  public_key_id: 'veyrnox-ioc-v1',
});

function mockSupabase(take: { body: string | null; should_refresh: boolean } | { error: true }) {
  const calls: Array<{ fn: string; args: unknown }> = [];
  const client = {
    rpc(fn: string, args?: unknown) {
      calls.push({ fn, args });
      if (fn === 'tip_manifest_cache_take') {
        return Promise.resolve('error' in take
          ? { data: null, error: { message: 'boom' } }
          : { data: [take], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
  return { client, calls };
}

function mockFetch(response: Response | Error) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const f = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
  }) as unknown as typeof fetch;
  return { f, calls };
}

let ipCounter = 0;
function post(headers: Record<string, string> = {}): Request {
  ipCounter += 1;
  return new Request('http://x/tip-manifest', {
    method: 'POST',
    headers: { apikey: 'anon', 'x-forwarded-for': `198.51.100.${ipCounter}`, ...headers },
    body: '{}',
  });
}

async function hex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function expectedSignature(ts: string) {
  const enc = new TextEncoder();
  const keyHash = await hex(await crypto.subtle.digest('SHA-256', enc.encode(API_KEY)));
  const hmac = async (msg: string, secret: string) => {
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
  };
  return hmac(`${ts}.GET./api/v1/manifest.`, await hmac(keyHash, SIGNING_SECRET));
}

Deno.test('fresh cache → served without touching TIP', async () => {
  const { client, calls } = mockSupabase({ body: MANIFEST, should_refresh: false });
  const up = mockFetch(new Response('nope', { status: 500 }));
  const res = await handle(post(), { env: baseEnv, supabase: client, fetch: up.f });
  assertEquals(res.status, 200);
  assertEquals(await res.text(), MANIFEST);
  assertEquals(up.calls.length, 0);
  assertEquals(calls.map((c) => c.fn), ['tip_manifest_cache_take']);
});

Deno.test('lease won → signed GET upstream, stored, served', async () => {
  const { client, calls } = mockSupabase({ body: STALE, should_refresh: true });
  const up = mockFetch(new Response(MANIFEST, { status: 200 }));
  const res = await handle(post(), { env: baseEnv, supabase: client, fetch: up.f });
  assertEquals(res.status, 200);
  assertEquals(await res.text(), MANIFEST);

  assertEquals(up.calls.length, 1);
  assertEquals(up.calls[0].url, 'https://tip.example/api/v1/manifest');
  assertEquals(up.calls[0].init.method, 'GET');
  assertEquals(up.calls[0].init.body, undefined);
  const h = up.calls[0].init.headers as Record<string, string>;
  assertEquals(h['X-Api-Key'], API_KEY);
  assertEquals(h['X-Signature'], await expectedSignature(h['X-Timestamp']));

  assertEquals(calls[1], { fn: 'tip_manifest_cache_put', args: { p_body: MANIFEST } });
});

Deno.test('upstream fails with a stale body cached → stale body, nothing stored', async () => {
  const { client, calls } = mockSupabase({ body: STALE, should_refresh: true });
  const up = mockFetch(new Response('{"error":"rate"}', { status: 429 }));
  const res = await handle(post(), { env: baseEnv, supabase: client, fetch: up.f });
  assertEquals(res.status, 200);
  assertEquals(await res.text(), STALE);
  assertEquals(calls.length, 1);
});

Deno.test('upstream fails with nothing cached → 502, no upstream detail', async () => {
  const { client } = mockSupabase({ body: null, should_refresh: true });
  const up = mockFetch(new Error('network'));
  const res = await handle(post(), { env: baseEnv, supabase: client, fetch: up.f });
  assertEquals(res.status, 502);
  assertEquals(await res.json(), { error: 'tip_upstream_error' });
});

Deno.test('upstream 200 that is not a manifest is not stored or served', async () => {
  const { client, calls } = mockSupabase({ body: null, should_refresh: true });
  const up = mockFetch(new Response('{"payload":{}}', { status: 200 }));
  const res = await handle(post(), { env: baseEnv, supabase: client, fetch: up.f });
  assertEquals(res.status, 502);
  assertEquals(calls.length, 1);
});

Deno.test('another isolate holds the lease and nothing is cached → 503, no upstream', async () => {
  const { client } = mockSupabase({ body: null, should_refresh: false });
  const up = mockFetch(new Response(MANIFEST, { status: 200 }));
  const res = await handle(post(), { env: baseEnv, supabase: client, fetch: up.f });
  assertEquals(res.status, 503);
  assertEquals(up.calls.length, 0);
});

Deno.test('cache RPC error fails closed: 503 and NO upstream call', async () => {
  const { client } = mockSupabase({ error: true });
  const up = mockFetch(new Response(MANIFEST, { status: 200 }));
  const res = await handle(post(), { env: baseEnv, supabase: client, fetch: up.f });
  assertEquals(res.status, 503);
  assertEquals(up.calls.length, 0);
});

Deno.test('missing TIP secret → 503 before any DB or upstream call', async () => {
  const { client, calls } = mockSupabase({ body: MANIFEST, should_refresh: false });
  const env = (k: string) => (k === 'TIP_SIGNING_SECRET' ? undefined : baseEnv(k));
  const res = await handle(post(), { env, supabase: client });
  assertEquals(res.status, 503);
  assertEquals(calls.length, 0);
});

Deno.test('disallowed origin → 403; no credential header → 401; GET → 405', async () => {
  const { client, calls } = mockSupabase({ body: MANIFEST, should_refresh: false });
  const deps = { env: baseEnv, supabase: client };
  assertEquals((await handle(post({ origin: 'https://evil.example' }), deps)).status, 403);
  assertEquals((await handle(post({ apikey: '' }), deps)).status, 401);
  assertEquals((await handle(new Request('http://x/tip-manifest', { method: 'GET' }), deps)).status, 405);
  assertEquals(calls.length, 0);
});

Deno.test('per-IP bound: the 11th request in a minute from one IP is 429', async () => {
  const { client } = mockSupabase({ body: MANIFEST, should_refresh: false });
  const deps = { env: baseEnv, supabase: client };
  const req = () => new Request('http://x/tip-manifest', {
    method: 'POST', headers: { apikey: 'anon', 'x-forwarded-for': '203.0.113.77' }, body: '{}',
  });
  for (let i = 0; i < 10; i++) assertEquals((await handle(req(), deps)).status, 200);
  assertEquals((await handle(req(), deps)).status, 429);
});
