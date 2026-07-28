// supabase/functions/first-referral-bonus/index.ts
//
// Supabase Edge Function: grants the REFERRER a 1-month free Safety Plus
// entitlement via RevenueCat when their first referee converts to paid.
//
// Called by the client after record_attribution succeeds. The function:
//   1. Rate-limits the attempt (record_bonus_claim_attempt, 5/hour/code)
//   2. Calls check_first_referral_bonus(p_code) — atomically claims the bonus
//      and returns the referrer's RevenueCat app_user_id, or NULL
//   3. If claimed, calls the RevenueCat REST API to grant a promotional
//      entitlement for 1 month
//
// ─── ON "AUTHENTICATION", HONESTLY ──────────────────────────────────────────
//
// Veyrnox is a self-custody wallet with NO user accounts and no server-side
// identity (I1/I5). There is no user JWT, because there is no user. The only
// credential the client can present is the Supabase anon key, which ships in
// the app bundle and is therefore PUBLIC.
//
// So the check below is NOT authentication and must not be described as such.
// It establishes exactly one thing: the caller is using this project's public
// key, which is the same bar every other Supabase RPC in this app sits behind.
// It stops unkeyed drive-by traffic. It does not stop anyone who has opened
// the app bundle, and nothing here pretends otherwise (I4).
//
// The real containment is elsewhere, and it is worth stating plainly:
//   - check_first_referral_bonus is now a single atomic claim, so the bonus
//     can be granted at most once no matter how many callers race;
//   - it is granted only when a referee has actually paid;
//   - the RPCs it uses are service_role-only, so this function is the sole
//     route to them;
//   - and the rate limit bounds how hard that route can be pushed.
//
// DEPLOY:
//   supabase functions deploy first-referral-bonus
//
// NOTE the missing --no-verify-jwt. It used to be there, which told the
// platform to skip JWT verification entirely and accept anonymous requests.
// Without it, Supabase validates the bearer token's signature and expiry
// before this code runs, and the client already sends the anon key, so the
// existing call path keeps working with a real platform-level check in front
// of it. If your project has migrated to the newer non-JWT publishable keys
// (sb_publishable_…), verify this after deploying — the platform's behaviour
// differs between key generations, and the in-function check below is then the
// backstop rather than the belt.
//
// Environment variables (Supabase dashboard → Edge Functions → Secrets):
//   SUPABASE_URL              — auto-injected
//   SUPABASE_ANON_KEY         — auto-injected; the public key we compare against
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected; used for DB access
//   REVENUECAT_V1_SECRET_KEY  — RevenueCat v1 API secret (sk_xxx)
//   ALLOWED_ORIGINS           — optional, comma-separated; extra browser
//                               origins (e.g. a Cloudflare Pages preview)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const ENTITLEMENT_ID = 'safety_plus';
const BONUS_DURATION = 'P1M'; // ISO 8601: 1 month

// Same shape the client and the SQL generator produce: 'VYX-' + 6 chars from a
// 32-char alphabet with I/O/0/1 removed. Rejecting anything else here keeps
// invented input away from the database entirely.
const CODE_RE = /^VYX-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

// A valid body is ~35 bytes. 1 KiB is generous and still bounds what we parse.
const MAX_BODY_BYTES = 1024;

// Browser origins allowed to call this cross-origin.
//   - veyrnox.com is the web app.
//   - capacitor://localhost (iOS) and https://localhost (Android) are the
//     Capacitor WebView origins for the default schemes this project uses
//     (capacitor.config.json sets no androidScheme/iosScheme override).
// Native builds enable CapacitorHttp, which routes fetch through the native
// HTTP stack rather than the WebView — those requests carry no Origin header
// at all, which is why a missing Origin is allowed below.
const DEFAULT_ALLOWED_ORIGINS = [
  'https://veyrnox.com',
  'https://www.veyrnox.com',
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
];

function allowedOrigins(): Set<string> {
  const extra = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}

// CORS is a BROWSER control: it stops another site from making this call from
// a victim's browser. It does nothing about curl, and is not load-bearing for
// the protections described in the header. Wildcard '*' is gone because this
// is a write endpoint that grants a paid entitlement.
function corsHeaders(origin: string | null): Record<string, string> {
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // The response varies by request Origin, so caches must not share it.
    'Vary': 'Origin',
  };
  if (origin && allowedOrigins().has(origin)) {
    base['Access-Control-Allow-Origin'] = origin;
  }
  return base;
}

// Extract the caller's IP address from the platform's forwarding headers so it
// can be passed as the second rate-limit dimension (L-10). The order matches
// what Supabase's Edge Runtime and Cloudflare front them with; the first
// well-formed entry wins.
//
// x-forwarded-for is a comma-separated list — the ORIGINAL client is the
// left-most entry, downstream proxies are appended on the right. Anything
// past the first entry is caller-controlled and cannot be trusted.
//
// A NULL return is deliberate on unknown/unparseable input: the RPC's per-IP
// branch is skipped rather than collapsing every anonymous caller into one
// shared bucket, which would rate-limit legitimate traffic and give an
// attacker a trivial bypass by stripping headers.
function clientIp(req: Request): string | null {
  const raw =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for');
  if (!raw) return null;
  const first = raw.split(',')[0]?.trim();
  if (!first) return null;
  // Reject anything that is not a plausible IPv4 or IPv6 literal before it
  // reaches Postgres — inet parsing raises on garbage, and we want a plain
  // "unknown, skip per-IP" outcome rather than a 500.
  const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-fA-F:]+$/;
  if (!ipv4.test(first) && !ipv6.test(first)) return null;
  return first;
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const originOk = !origin || allowedOrigins().has(origin);

  if (req.method === 'OPTIONS') {
    // Preflight from a disallowed origin gets no allow-origin header, so the
    // browser blocks the real request before it is ever sent.
    return new Response(originOk ? 'ok' : 'origin not allowed', {
      status: originOk ? 200 : 403,
      headers: corsHeaders(origin),
    });
  }

  if (!originOk) {
    return json({ error: 'origin_not_allowed' }, 403, origin);
  }

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, origin);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const rcSecretKey = Deno.env.get('REVENUECAT_V1_SECRET_KEY');

    // Fail closed on a half-configured deployment rather than running with a
    // check silently disabled (I4). anonKey is included: without it there is
    // nothing to compare the bearer token against, and proceeding would mean
    // serving traffic with the key check quietly switched off.
    if (!supabaseUrl || !serviceRoleKey || !anonKey || !rcSecretKey) {
      console.error('server_config_missing: one or more required env vars unset');
      return json({ error: 'server_config_missing' }, 500, origin);
    }

    // See the header: this proves possession of a PUBLIC key, nothing more.
    // No constant-time comparison, deliberately — the value being compared is
    // published in the app bundle, so a timing side channel reveals nothing and
    // pretending otherwise would be security theatre.
    const auth = req.headers.get('authorization') ?? '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!bearer || bearer !== anonKey) {
      return json({ error: 'unauthorized' }, 401, origin);
    }

    const declared = Number(req.headers.get('content-length') ?? '0');
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return json({ error: 'payload_too_large' }, 413, origin);
    }

    // Content-Length can lie or be absent (chunked), so bound the actual read
    // too rather than trusting the header.
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return json({ error: 'payload_too_large' }, 413, origin);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ error: 'invalid_json' }, 400, origin);
    }

    const rawCode = (parsed as { referral_code?: unknown })?.referral_code;
    const referralCode =
      typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';

    if (!CODE_RE.test(referralCode)) {
      return json({ error: 'referral_code required' }, 400, origin);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Rate limit BEFORE the claim, on TWO dimensions (L-10): 5/hour/code and
    // 20/hour/IP. Either exceeded => denied. Per-code stops one attacker
    // hammering one referrer; per-IP stops one host fanning out across many
    // codes. Server-side counters throughout. Also rejects codes that do not
    // exist, so invented codes never reach the claim path.
    const ip = clientIp(req);
    const { data: allowed, error: rlError } = await supabase.rpc(
      'record_bonus_claim_attempt',
      { p_code: referralCode, p_ip: ip },
    );

    if (rlError) {
      console.error('rate limit error:', rlError.message);
      return json({ error: 'db_error' }, 500, origin);
    }
    if (allowed !== true) {
      // Covers both "too many attempts" and "no such code". They are reported
      // identically on purpose: distinguishing them would turn this endpoint
      // into an oracle for which referral codes exist.
      return json({ error: 'rate_limited' }, 429, origin);
    }

    // Atomic check + claim: returns the referrer's RC user ID if this call is
    // the one that claimed the bonus, NULL if ineligible or already claimed.
    const { data: rcUserId, error: dbError } = await supabase.rpc(
      'check_first_referral_bonus',
      { p_code: referralCode },
    );

    if (dbError) {
      console.error('DB error:', dbError.message);
      return json({ error: 'db_error' }, 500, origin);
    }

    if (!rcUserId) {
      return json({ granted: false, reason: 'not_eligible' }, 200, origin);
    }

    // Grant 1-month promotional entitlement via RevenueCat REST API v1.
    // POST /v1/subscribers/{app_user_id}/entitlements/{entitlement_id}/promotional
    const rcUrl = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(rcUserId)}/entitlements/${ENTITLEMENT_ID}/promotional`;
    const rcResponse = await fetch(rcUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${rcSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ duration: BONUS_DURATION }),
    });

    if (!rcResponse.ok) {
      const rcBody = await rcResponse.text();
      console.error('RevenueCat error:', rcResponse.status, rcBody);

      // Release the claim so a retry can succeed. The rate limit above is what
      // stops that retry path from being abused.
      await supabase
        .from('referrals')
        .update({ first_bonus_granted_at: null })
        .eq('code', referralCode);

      return json({ error: 'revenuecat_error', status: rcResponse.status }, 502, origin);
    }

    return json({ granted: true }, 200, origin);
  } catch (err) {
    console.error('Unhandled error:', err);
    return json({ error: 'internal' }, 500, origin);
  }
});
