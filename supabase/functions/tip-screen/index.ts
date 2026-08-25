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
//
// `http://localhost` is deliberately NOT here. It was added on 2026-08-06
// alongside the chat routing change, which re-introduced the pattern the
// 2026-07-28 internal audit removed from first-referral-bonus as finding L-9.
// This allowlist is the only origin-level control this function has — the
// anon-key check below is explicitly NOT authentication — so a plaintext-HTTP
// origin compiled into every deployment lets any process serving on localhost
// drive it cross-origin and burn our TIP quota, on production as much as on a
// developer's machine.
//
// Local development sets it per-deployment instead, via the ALLOWED_ORIGINS
// env var this function already merges in below:
//   supabase secrets set ALLOWED_ORIGINS=http://localhost:5173
// That keeps the dev affordance without shipping it to production, and makes
// each grant a deliberate, reviewable act rather than a compiled-in default.
const DEFAULT_ALLOWED_ORIGINS = [
  'https://veyrnox.com',
  'https://www.veyrnox.com',
  'https://veyrnox-prod.pages.dev',
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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-rc-user-id',
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
// serialized_tx is larger than the calldata cap: a Solana transaction with
// several priority-fee + system-transfer instructions comes in base64-encoded
// at around 300–500 bytes, but the Worker's solana-sim contract lets the
// upstream simulate any reasonably-sized tx. Cap at 8 KiB — enough for real
// multi-ix transactions, small enough that a caller cannot use the field to
// smuggle bulk data through our Alchemy account.
const MAX_SERIALIZED_TX = 8 * 1024;
// serialized_tx is chain-scoped: only forward it when the request is for a
// chain whose Worker lane actually consumes it. Anything else is dropped so a
// caller cannot use this field to funnel arbitrary bytes to TIP.
const CHAINS_ACCEPTING_SERIALIZED_TX = new Set(['solana', 'bitcoin']);
// Base64 alphabet (Solana). Bitcoin serialized_tx is hex — a separate check.
const BASE64_RE = /^[A-Za-z0-9+/=]+$/;
const HEX_RE = /^(0x)?[0-9a-fA-F]+$/;

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
  // serialized_tx passthrough — chain-gated, size-capped, encoding-validated.
  // Wallet-side (SendCrypto.jsx) builds unsigned Solana tx pre-sign for the
  // Worker's solana-sim lane. Bitcoin support requires a signed raw tx (btc-sim
  // consumes testmempoolaccept), so is deferred but the shape is ready.
  const st = input.serialized_tx;
  if (
    typeof st === 'string' &&
    st.length > 0 &&
    st.length <= MAX_SERIALIZED_TX &&
    CHAINS_ACCEPTING_SERIALIZED_TX.has(out.chain as string)
  ) {
    const encodingOk =
      (out.chain === 'solana' && BASE64_RE.test(st)) ||
      (out.chain === 'bitcoin' && HEX_RE.test(st));
    if (encodingOk) out.serialized_tx = st;
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
    // Codex P2 2026-08-15: byte-count, not UTF-16-code-unit count.
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413, origin);
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
  // Canonical string is ts.METHOD.pathname.body per veyrnox-tip PR #48
  // (57c9bed). Legacy ts.body form no longer accepted upstream.
  const endpoint = '/api/v1/screen';
  const sig = await hmacHex(`${ts}.POST.${endpoint}.${bodyStr}`, keySecret);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIP_TIMEOUT_MS);
  try {
    // SCREENING ONLY. There used to be an `action: 'chat'` branch here that
    // forwarded to /api/v1/agents/security-advisor/chat. It is removed, not
    // fixed, because it was a worse liability than it looked:
    //
    //   - Dead client-side. #1614 repointed SecurityAdvisor at the TIP Worker's
    //     /api/v1/chat directly; nothing under src/ has sent action:'chat' here
    //     since.
    //   - Live server-side. This function stays deployed and anon-reachable, so
    //     the route remained callable by anyone holding the public anon key.
    //   - Unvalidated. `messages` was forwarded upstream verbatim — no role
    //     allowlist, no per-message length cap, no message count cap.
    //   - And it laundered the two controls that protect the real endpoint.
    //     Requests from here are HMAC-signed with TIP_API_KEY, which is
    //     PRECISELY why Cloudflare Bot Fight Mode lets them through (#1614
    //     established that the unsigned tip-chat function gets a 403 challenge).
    //     It also carries no device_id, so the per-device 30-turns/24h cap on
    //     the Worker never applied. A caller who could not reach the LLM
    //     directly, and would have been rate-limited if they could, got a
    //     signed uncapped path to it through here.
    //
    // Hardening it would have kept a signed bypass alive to protect a route
    // with no callers. Deleting it removes the surface instead. If a
    // server-side chat proxy is ever wanted again, supabase/functions/tip-chat
    // is the place — it is unsigned by design, so it cannot launder Bot Fight
    // Mode, and it now carries the message validation this route never had.
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

    // Screening is JSON only. The SSE passthrough that used to live here went
    // with the chat route above.
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
