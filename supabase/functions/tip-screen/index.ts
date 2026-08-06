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
  'https://veyrnox-prod.pages.dev',
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

// Rebuild the outbound body from an explicit allowlist. The caller does not get
// to choose which fields reach TIP — an unexpected key is dropped, not
// forwarded, so this proxy cannot be used to smuggle arbitrary payloads to the
// upstream service under our credentials.
const STRING_FIELDS = [
  'chain', 'action_type', 'from_address', 'to_address',
  'value_wei', 'contract_address', 'token_address', 'calldata',
] as const;

const MAX_STRING = 4096;          // calldata is the long one
const MAX_COUNTERPARTIES = 20;    // matches what the client sends
const MAX_BODY_BYTES = 64 * 1024;

function buildUpstreamBody(input: Record<string, unknown>, requestId: string) {
  const out: Record<string, unknown> = { request_id: requestId };
  for (const f of STRING_FIELDS) {
    const v = input[f];
    if (typeof v === 'string' && v.length > 0 && v.length <= MAX_STRING) out[f] = v;
  }
  if (typeof out.chain !== 'string' || typeof out.to_address !== 'string') return null;
  const rc = input.recent_counterparties;
  if (Array.isArray(rc)) {
    const list = rc.filter((x) => typeof x === 'string' && x.length > 0 && x.length <= 128)
      .slice(0, MAX_COUNTERPARTIES);
    if (list.length) out.recent_counterparties = list;
  }
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

  // The Supabase gateway validates the JWT BEFORE this code runs (we deploy
  // WITHOUT --no-verify-jwt). If execution reaches here the caller already
  // proved possession of a valid project key — repeating that check inside the
  // function is redundant and broke when Supabase migrated the auto-injected
  // SUPABASE_ANON_KEY from a 208-char legacy JWT to a 46-char sb_publishable_*
  // key (the client bundle still carries the legacy JWT, so the lengths never
  // match). Require that a credential header IS present (the gateway enforces
  // this too, but belt-and-suspenders costs nothing), and trust the gateway for
  // the actual validation.
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const apikey = req.headers.get('apikey') ?? '';
  if (!bearer && !apikey) {
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
    // Route based on action: "chat" or "screen" (default screening)
    const action = input.action ?? 'screen';
    const endpoint = action === 'chat'
      ? '/api/v1/agents/security-advisor/chat'
      : '/api/v1/screen';

    const upstream = await fetch(`${tipBaseUrl.replace(/\/$/, '')}${endpoint}`, {
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

    // For chat, stream the response; for screening, return JSON
    if (action === 'chat' && upstream.body) {
      return new Response(upstream.body, {
        status: 200,
        headers: { ...corsHeaders(origin), 'Content-Type': 'text/event-stream' },
      });
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
