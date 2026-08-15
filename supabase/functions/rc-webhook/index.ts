// supabase/functions/rc-webhook/index.ts
//
// RevenueCat webhook handler for H-1 remediation (2026-07-28 internal audit).
//
// PURPOSE
//
// Bind referrals.rc_user_id server-side from a verified RevenueCat webhook,
// closing the self-serve mint that the client-callable p_rc_user_id used to
// allow. The client no longer supplies rc_user_id
// (see sql/first-referral-bonus.sql BLOCK 4). Until this handler is deployed,
// check_first_referral_bonus() returns NULL for every code and the
// first-referral bonus path is inert (I4: fail closed).
//
// FLOW
//
//   1. Verify Authorization header against REVENUECAT_WEBHOOK_AUTHORIZATION
//      using a timing-safe compare. Fail-closed on missing/wrong/misconfigured.
//   2. Bound the body (32 KB defensive cap; real RC events are ~4 KB).
//   3. Filter event.type — only INITIAL_PURCHASE / NON_RENEWING_PURCHASE
//      progress; every other type returns 200 ignored and writes nothing
//      (renewals must not re-bind).
//   4. Extract referrer code from
//      event.subscriber_attributes.veyrnox_referral_code.value
//      Absent → 200 no_code (majority of purchases; not an error).
//   5. Call set_referral_rc_user(p_code, p_rc_user_id) with SERVICE_ROLE.
//      SQL is first-writer-wins, so duplicate deliveries are safe no-ops.
//
// AUTHENTICATION, HONESTLY
//
// This endpoint's ONLY security control is the shared-secret compare in step
// 1. There is no user identity (Veyrnox has no accounts, I1/I5) and there is
// no anon-key check like first-referral-bonus's — RC sends the request as
// server-to-server without the app bundle's anon key at all. If
// REVENUECAT_WEBHOOK_AUTHORIZATION leaks, an attacker can bind arbitrary RC
// users to arbitrary referral codes; the SQL first-writer-wins bounds blast
// radius but does not eliminate it. Rotate the secret through both
// RC dashboard and Supabase env atomically; runbook in
// docs/play-launch/rc-webhook-deploy.md.
//
// DEPLOY
//
//   supabase functions deploy rc-webhook
//
// NOTE the missing --no-verify-jwt. Same rationale as first-referral-bonus:
// keep the platform's bearer check in front of this handler, even though the
// real gate is the shared-secret compare below. If your project uses the
// newer non-JWT publishable keys, verify the platform still enforces bearer
// presence after deploying.
//
// ENV (Supabase dashboard → Edge Functions → Secrets):
//   SUPABASE_URL                        auto-injected
//   SUPABASE_SERVICE_ROLE_KEY           auto-injected; used for the RPC call
//   REVENUECAT_WEBHOOK_AUTHORIZATION    shared bearer value configured on the
//                                       RC dashboard webhook page. NOT the
//                                       same as REVENUECAT_V1_SECRET_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// Same referral-code shape as first-referral-bonus/index.ts. Reject anything
// else before it reaches the DB.
const CODE_RE = /^VYX-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

// RC events are ~4 KB; 32 KB is defensive without capping legitimate payloads.
const MAX_BODY_BYTES = 32 * 1024;

// First-purchase only. Renewals must not re-bind rc_user_id (first-writer-wins
// makes it a no-op anyway, but filtering here avoids the SQL round-trip and
// keeps the "ignored" telemetry legible).
const ACCEPTED_EVENT_TYPES = new Set([
  'INITIAL_PURCHASE',
  'NON_RENEWING_PURCHASE',
]);

// In-memory rate limit, per-IP, 100/min. Not a security control — the
// shared-secret compare is. This is a smoothing bound against amplification
// if the secret ever leaks. Per-worker state is fine; RC retries idempotently.
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBucket = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateBucket.get(ip);
  if (!entry || entry.resetAt < now) {
    rateBucket.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

function clientIp(req: Request): string {
  const raw =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for');
  if (!raw) return 'unknown';
  const first = raw.split(',')[0]?.trim();
  return first || 'unknown';
}

// Constant-time string compare. Compare over the SHA-256 of each side so the
// length itself is not a side channel; a size mismatch on the raw strings
// would leak through Response timing otherwise.
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const ha = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(a)));
  const hb = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(b)));
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Exported for tests.
export interface RcEvent {
  type?: string;
  app_user_id?: string;
  subscriber_attributes?: Record<string, { value?: string }>;
}

export function extractReferralCode(event: RcEvent): string | null {
  const raw = event?.subscriber_attributes?.veyrnox_referral_code?.value;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toUpperCase();
  return trimmed || null;
}

// deno-lint-ignore no-explicit-any
type SbClient = { rpc: (fn: string, args: unknown) => Promise<{ data: any; error: any }> };

export async function handle(req: Request, deps?: {
  supabase?: SbClient;
  env?: (k: string) => string | undefined;
}): Promise<Response> {
  const env = deps?.env ?? ((k: string) => Deno.env.get(k));

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const ip = clientIp(req);
  if (!rateLimit(ip)) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
    });
  }

  const expected = env('REVENUECAT_WEBHOOK_AUTHORIZATION');
  const supabaseUrl = env('SUPABASE_URL');
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');

  if (!expected || !supabaseUrl || !serviceRoleKey) {
    console.error('server_config_missing: required env unset');
    return json({ error: 'server_config_missing' }, 500);
  }

  const auth = req.headers.get('authorization') ?? '';
  if (!auth || !(await timingSafeEqual(auth, expected))) {
    return json({ error: 'unauthorized' }, 401);
  }

  // Bound body BEFORE reading. Content-Length can lie or be absent so cap the
  // read too.
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return json({ error: 'payload_too_large' }, 413);
  }

  const raw = await req.text();
  // Codex P2 2026-08-15: byte-count, not UTF-16-code-unit count.
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return json({ error: 'payload_too_large' }, 413);
  }

  let parsed: { event?: RcEvent };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const event = parsed?.event;
  const type = event?.type;
  if (!type || !ACCEPTED_EVENT_TYPES.has(type)) {
    // Log presence-only, never the payload.
    console.log(`ignored event_type=${type ?? 'none'}`);
    return json({ ok: true, reason: 'ignored' }, 200);
  }

  const rcUserId = event?.app_user_id;
  if (typeof rcUserId !== 'string' || !rcUserId) {
    return json({ error: 'missing_app_user_id' }, 400);
  }

  const code = extractReferralCode(event);
  if (!code) {
    console.log('no_code');
    return json({ ok: true, reason: 'no_code' }, 200);
  }
  if (!CODE_RE.test(code)) {
    console.log('bad_code');
    return json({ error: 'bad_code' }, 400);
  }

  const supabase: SbClient =
    deps?.supabase ?? (createClient(supabaseUrl, serviceRoleKey) as unknown as SbClient);

  const { error } = await supabase.rpc('set_referral_rc_user', {
    p_code: code,
    p_rc_user_id: rcUserId,
  });

  if (error) {
    // P0009 / P0010 are our defined error codes on the SQL side. Anything
    // else stays a generic 500 so PG error text does not leak.
    // deno-lint-ignore no-explicit-any
    const pgCode = (error as any).code as string | undefined;
    if (pgCode === 'P0009') return json({ error: 'bad_request' }, 400);
    if (pgCode === 'P0010') return json({ error: 'bad_rc_user_id' }, 400);
    console.error(`set_referral_rc_user failed: ${error.message}`);
    return json({ error: 'db_error' }, 500);
  }

  console.log('ok');
  return json({ ok: true }, 200);
}

// Only start the server when running as a Deno entrypoint. Tests import
// `handle` directly and never call serve.
if (import.meta.main) {
  serve((req) => handle(req));
}
