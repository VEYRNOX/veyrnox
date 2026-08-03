// supabase/functions/tip-screen/index.ts
//
// Supabase Edge Function: signs and forwards transaction-screening requests to
// the TIP threat-intelligence service.
//
// ─── WHY THIS EXISTS (audit 2026-08-03, H-4) ────────────────────────────────
//
// The client used to hold the TIP HMAC signing secret itself:
//
//   const signingSecret = import.meta.env.VITE_TIP_SIGNING_SECRET;
//   keySecret = HMAC(signingSecret, sha256(apiKey));   // computed IN THE APP
//
// Vite statically inlines every VITE_-prefixed variable into the built bundle —
// web and the Capacitor app alike — and the identifier-renaming obfuscation in
// vite.config.js does not hide string literals. So that secret would have
// shipped to every user's device, and an HMAC scheme whose verifying secret is
// handed to the caller authenticates nothing: anyone who unpacks the bundle can
// forge a validly-signed request.
//
// Worse, the TIP backend's own review (docs/tip-codex-review-2026-08-02.html,
// finding F1) describes API_SIGNING_SECRET as the root from which EVERY
// tenant's per-key secret is derived. Per-key derivation was a server-side
// mitigation to limit the blast radius of one leaked DERIVED key, on the
// assumption the root only ever lives on a server. Re-deriving it inside an
// untrusted client inverts that assumption entirely.
//
// Nothing leaked: VITE_TIP_* was never set in .env.example, .env.staging, or any
// CI workflow, so the feature has been inert in every build. This lands the
// architecture BEFORE the endpoint is provisioned, which is the cheap moment.
//
// ─── ON "AUTHENTICATION", HONESTLY ──────────────────────────────────────────
//
// Veyrnox is a self-custody wallet with NO user accounts (I1/I5). There is no
// user JWT because there is no user. The only credential a client can present is
// the Supabase anon key, which ships in the bundle and is therefore PUBLIC.
//
// So the anon-key check below is NOT authentication and is not described as
// such. It establishes one thing: the caller is using this project's public key,
// the same bar every other Supabase RPC in this app sits behind. It stops
// unkeyed drive-by traffic. It does not stop anyone who has opened the bundle.
//
// What this function actually buys, stated plainly:
//   - the TIP signing secret and API key never leave the server;
//   - a leaked anon key lets someone burn our TIP quota, but NOT forge requests
//     as Veyrnox to TIP directly, and NOT (per the backend's F1 note) reach
//     other tenants;
//   - the request is re-validated here, so the shape TIP sees is one we built,
//     not one a caller handed us.
//
// It does NOT make the caller trustworthy, and rate limiting still matters.
//
// ─── DEPLOY ─────────────────────────────────────────────────────────────────
//
//   supabase functions deploy tip-screen
//
// NOTE the missing --no-verify-jwt, deliberately, for the same reason as
// first-referral-bonus: that flag tells the platform to skip JWT verification
// and accept anonymous requests.
//
// Secrets (Supabase dashboard → Edge Functions → Secrets):
//   SUPABASE_URL       — auto-injected
//   SUPABASE_ANON_KEY  — auto-injected; the public key we compare against
//   TIP_BASE_URL       — e.g. https://veyrnox-tip-staging.al-jobson.workers.dev
//   TIP_API_KEY        — TIP tenant API key            (NEVER VITE_-prefixed)
//   TIP_SIGNING_SECRET — TIP HMAC signing secret       (NEVER VITE_-prefixed)
//   ALLOWED_ORIGINS    — optional, comma-separated extra browser origins
//
// STATUS: BUILT, NOT DEPLOYED. No request has ever been made through it.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const TIP_TIMEOUT_MS = 10_000;

// Mirrors first-referral-bonus. Capacitor's native HTTP stack sends no Origin
// header at all, which is why a missing Origin is allowed.
const DEFAULT_ALLOWED_ORIGINS = [
  'https://veyrnox.com',
  'https://www.veyrnox.com',
  'capacitor://localhost',
  'https://localhost',
];

function allowedOrigins(): Set<string> {
  const extra = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}

function corsHeaders(origin: string | null): Record<string, string> {
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  if (origin && allowedOrigins().has(origin)) {
    base['Access-Control-Allow-Origin'] = origin;
  }
  return base;
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

const enc = new TextEncoder();

async function sha256Hex(input: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time compare for the anon-key check, so a mismatch cannot be probed
// byte by byte.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Rebuild the outbound body from an explicit allowlist. The caller does not get
// to choose which fields reach TIP — an unexpected key is dropped, not
// forwarded, so this proxy cannot be used to smuggle arbitrary payloads to the
// upstream service under our credentials.
const STRING_FIELDS = [
  'chain', 'action_type', 'from_address', 'to_address',
  'value_wei', 'contract_address', 'token_address', 'calldata',
] as const;

const MAX_STRING = 4096;          // calldata is the long one
const MAX_BODY_BYTES = 64 * 1024;

// recent_counterparties is deliberately ABSENT from STRING_FIELDS and handled
// nowhere below (owner decision, 2026-08-03). The client no longer sends it, and
// because this function rebuilds the upstream body from an allowlist rather than
// forwarding input, dropping it here means a caller cannot reintroduce the field
// by putting it back in their own request — the proxy simply will not carry it.
// That is the allowlist earning its keep: the privacy decision is enforced
// server-side, not merely on the honour system in the client.
function buildUpstreamBody(input: Record<string, unknown>, requestId: string) {
  const out: Record<string, unknown> = { request_id: requestId };
  for (const f of STRING_FIELDS) {
    const v = input[f];
    if (typeof v === 'string' && v.length > 0 && v.length <= MAX_STRING) out[f] = v;
  }
  if (typeof out.chain !== 'string' || typeof out.to_address !== 'string') return null;
  return out;
}

serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const originOk = !origin || allowedOrigins().has(origin);

  if (req.method === 'OPTIONS') {
    return new Response(originOk ? 'ok' : 'origin not allowed', {
      status: originOk ? 200 : 403,
      headers: corsHeaders(origin),
    });
  }
  if (!originOk) return json({ error: 'origin_not_allowed' }, 403, origin);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);

  // Possession of the PUBLIC anon key — see the honesty note in the header.
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const apikey = req.headers.get('apikey') ?? '';
  if (!anonKey || !(timingSafeEqual(bearer, anonKey) || timingSafeEqual(apikey, anonKey))) {
    return json({ error: 'unauthorized' }, 401, origin);
  }

  const tipBaseUrl = Deno.env.get('TIP_BASE_URL');
  const tipApiKey = Deno.env.get('TIP_API_KEY');
  const tipSigningSecret = Deno.env.get('TIP_SIGNING_SECRET');
  if (!tipBaseUrl || !tipApiKey || !tipSigningSecret) {
    // I4: a misconfigured proxy must not look like a clean screening result.
    // The client maps a non-2xx to its CAUTION path.
    return json({ error: 'tip_not_configured' }, 503, origin);
  }

  let input: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413, origin);
    input = JSON.parse(raw);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('shape');
  } catch {
    return json({ error: 'bad_request' }, 400, origin);
  }

  // request_id is generated HERE, from a CSPRNG. The client used to build it
  // with Math.random(), which the project's own rules forbid for anything
  // security-relevant; a server-generated id is also one less caller-controlled
  // field reaching TIP.
  const requestId = `tip-${crypto.randomUUID()}`;
  const body = buildUpstreamBody(input, requestId);
  if (!body) return json({ error: 'bad_request' }, 400, origin);

  const bodyStr = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000).toString();
  const keySecret = await hmacHex(await sha256Hex(tipApiKey), tipSigningSecret);
  const sig = await hmacHex(`${ts}.${bodyStr}`, keySecret);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIP_TIMEOUT_MS);
  try {
    const upstream = await fetch(`${tipBaseUrl.replace(/\/$/, '')}/api/v1/screen`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': tipApiKey,
        'X-Timestamp': ts,
        'X-Signature': sig,
      },
      body: bodyStr,
      signal: controller.signal,
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      // Do NOT relay the upstream error body: it may carry internal detail, and
      // the client only needs "screening did not give a usable answer".
      return json({ error: 'tip_upstream_error' }, 502, origin);
    }
    return new Response(text, {
      status: 200,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  } catch {
    // Timeout or transport failure. 504 → the client's CAUTION path.
    return json({ error: 'tip_unavailable' }, 504, origin);
  } finally {
    clearTimeout(timer);
  }
});
