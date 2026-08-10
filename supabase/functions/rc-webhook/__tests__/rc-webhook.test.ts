// Run: deno test --allow-env supabase/functions/rc-webhook/__tests__/rc-webhook.test.ts

import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { handle, extractReferralCode } from '../index.ts';

const SECRET = 'test-webhook-secret-value';

function env(map: Record<string, string>) {
  return (k: string) => map[k];
}

const baseEnv = env({
  REVENUECAT_WEBHOOK_AUTHORIZATION: SECRET,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'srk',
});

function mockSupabase() {
  const calls: Array<{ fn: string; args: unknown }> = [];
  const client = {
    // deno-lint-ignore no-explicit-any
    rpc(fn: string, args: unknown): any {
      calls.push({ fn, args });
      return Promise.resolve({ data: null, error: null });
    },
  };
  return { client: client as unknown as any, calls };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://x/rc-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function validEvent(overrides: Record<string, unknown> = {}) {
  return {
    event: {
      type: 'INITIAL_PURCHASE',
      app_user_id: 'rc-user-abc-123',
      subscriber_attributes: {
        veyrnox_referral_code: { value: 'VYX-ABCDEF' },
      },
      ...overrides,
    },
  };
}

Deno.test('missing Authorization → 401', async () => {
  const { client } = mockSupabase();
  const res = await handle(post(validEvent()), { env: baseEnv, supabase: client });
  assertEquals(res.status, 401);
});

Deno.test('wrong Authorization → 401 (length differs, still constant-time)', async () => {
  const { client } = mockSupabase();
  const res = await handle(
    post(validEvent(), { authorization: 'Bearer wrong' }),
    { env: baseEnv, supabase: client },
  );
  assertEquals(res.status, 401);
});

Deno.test('GET → 405', async () => {
  const { client } = mockSupabase();
  const req = new Request('http://x/rc-webhook', { method: 'GET' });
  const res = await handle(req, { env: baseEnv, supabase: client });
  assertEquals(res.status, 405);
});

Deno.test('payload > 32 KB → 413', async () => {
  const { client } = mockSupabase();
  const big = 'x'.repeat(33 * 1024);
  const res = await handle(
    post(big, { authorization: SECRET }),
    { env: baseEnv, supabase: client },
  );
  assertEquals(res.status, 413);
});

Deno.test('RENEWAL → 200 ignored, no DB write', async () => {
  const { client, calls } = mockSupabase();
  const res = await handle(
    post(validEvent({ type: 'RENEWAL' }), { authorization: SECRET }),
    { env: baseEnv, supabase: client },
  );
  assertEquals(res.status, 200);
  assertEquals(calls.length, 0);
});

Deno.test('no referral code → 200 no_code, no DB write', async () => {
  const { client, calls } = mockSupabase();
  const evt = validEvent();
  // deno-lint-ignore no-explicit-any
  delete (evt.event as any).subscriber_attributes;
  const res = await handle(post(evt, { authorization: SECRET }), {
    env: baseEnv,
    supabase: client,
  });
  assertEquals(res.status, 200);
  assertEquals(calls.length, 0);
});

Deno.test('malformed code → 400 bad_code', async () => {
  const { client, calls } = mockSupabase();
  const evt = validEvent({
    subscriber_attributes: { veyrnox_referral_code: { value: 'not-a-code' } },
  });
  const res = await handle(post(evt, { authorization: SECRET }), {
    env: baseEnv,
    supabase: client,
  });
  assertEquals(res.status, 400);
  assertEquals(calls.length, 0);
});

Deno.test('valid event → 200 ok, SQL called with correct args', async () => {
  const { client, calls } = mockSupabase();
  const res = await handle(post(validEvent(), { authorization: SECRET }), {
    env: baseEnv,
    supabase: client,
  });
  assertEquals(res.status, 200);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].fn, 'set_referral_rc_user');
  assertEquals(calls[0].args, {
    p_code: 'VYX-ABCDEF',
    p_rc_user_id: 'rc-user-abc-123',
  });
});

Deno.test('duplicate event → 200 on both calls (SQL first-writer-wins)', async () => {
  const { client, calls } = mockSupabase();
  const req1 = post(validEvent(), { authorization: SECRET });
  const req2 = post(validEvent(), { authorization: SECRET });
  const r1 = await handle(req1, { env: baseEnv, supabase: client });
  const r2 = await handle(req2, { env: baseEnv, supabase: client });
  assertEquals(r1.status, 200);
  assertEquals(r2.status, 200);
  assertEquals(calls.length, 2);
});

Deno.test('rate limit → 429 after 100 in window', async () => {
  // Fresh IP for this test so it does not collide with the module-level bucket.
  const headers = {
    authorization: SECRET,
    'x-forwarded-for': '203.0.113.99',
  };
  const { client } = mockSupabase();
  let last: Response | null = null;
  for (let i = 0; i < 101; i++) {
    last = await handle(post(validEvent(), headers), {
      env: baseEnv,
      supabase: client,
    });
  }
  assertEquals(last?.status, 429);
});

Deno.test('missing env → 500 misconfigured, not silent 200', async () => {
  const { client } = mockSupabase();
  const res = await handle(
    post(validEvent(), { authorization: SECRET }),
    { env: env({}), supabase: client },
  );
  assertEquals(res.status, 500);
});

Deno.test('extractReferralCode uppercases + trims', () => {
  assertEquals(
    extractReferralCode({
      subscriber_attributes: { veyrnox_referral_code: { value: '  vyx-abcdef  ' } },
    }),
    'VYX-ABCDEF',
  );
  assertEquals(extractReferralCode({}), null);
});
