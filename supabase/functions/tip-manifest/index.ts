// supabase/functions/tip-manifest/index.ts
//
// Supabase Edge Function: fetches the signed IOC manifest from the TIP
// threat-intelligence service and serves it to the wallet.
//
// ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
//
// src/lib/localIocCache.js screens addresses against a locally cached,
// Ed25519-signed manifest, which is the ONLY screening a deniability or offline
// session gets. It used to fetch `${VITE_TIP_BASE_URL}/api/v1/manifest`
// directly and unauthenticated. The TIP Worker made that route HMAC-only in
// veyrnox-tip #48 (2026-08-10), the wallet must never sign client-side (audit
// 2026-08-03 H-4, see tip-screen), and so no shipped wallet could refresh its
// cache from then until this function landed.
//
// This is a separate function, not a branch of tip-screen: tip-screen carries
// /api/v1/screen only and stays that way.
//
// ─── WHAT IT DOES AND DOES NOT DO ───────────────────────────────────────────
//
//   - Signs GET /api/v1/manifest with TIP_API_KEY / TIP_SIGNING_SECRET, which
//     never leave the server. The caller supplies NO input that reaches TIP:
//     the path is a constant and the request has no body.
//   - Caches the body in Postgres (sql/tip-manifest-cache.sql). The Worker
//     allows 5 manifest requests/hour for the whole wallet tenant, so the cache
//     must be shared across isolates; in-memory state would not be.
//   - Does NOT verify the manifest's Ed25519 signature. The wallet does, with a
//     pinned public key, and refuses rollbacks (I5: this backend is untrusted).
//     A tampered cache row yields a manifest the wallet throws away.
//   - The anon-key presence check is NOT authentication, for the reasons
//     tip-screen's header gives. The manifest is public threat data; the
//     controls here protect TIP's quota, not confidentiality.
//
// ─── DEPLOY ─────────────────────────────────────────────────────────────────
//
// Prod: .github/workflows/deploy-edge-functions.yml, on merge to main.
// Staging: by hand, `supabase functions deploy tip-manifest --no-verify-jwt`.
// verify_jwt is off for the same reason as tip-screen: the Pages proxy presents
// the publishable key, which is not a JWT.
//
// Secrets (all already set for tip-screen; nothing new):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — auto-injected
//   TIP_BASE_URL, TIP_API_KEY, TIP_SIGNING_SECRET
//   ALLOWED_ORIGINS — optional, comma-separated extra browser origins

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TIP_TIMEOUT_MS = 15_000;
const ENDPOINT = '/api/v1/manifest';
// Same bound the wallet applies before parsing, and the cache RPC before storing.
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;

// Mirrors tip-screen. A missing Origin is allowed: Capacitor's native HTTP
// stack and the Pages proxy send none.
const DEFAULT_ALLOWED_ORIGINS = [
  'https://veyrnox.com',
  'https://www.veyrnox.com',
  'https://veyrnox-prod.pages.dev',
  'capacitor://localhost',
  'https://localhost',
];

type Env = (k: string) => string | undefined;
// deno-lint-ignore no-explicit-any
type SbClient = { rpc: (fn: string, args?: unknown) => PromiseLike<{ data: any; error: any }> };
type Deps = { supabase?: SbClient; env?: Env; fetch?: typeof fetch };

function allowedOrigins(env: Env): Set<string> {
  const extra = (env('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  if (origin && allowedOrigins(env).has(origin)) {
    base['Access-Control-Allow-Origin'] = origin;
  }
  return base;
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

// Per-IP smoothing bound, same shape as tip-screen. A wallet asks once a day,
// so this is far tighter than screening. Not a security control.
const RATE_LIMIT_MAX = 10;
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
    req.headers.get('x-forwarded-for') ??
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip');
  if (!raw) return 'unknown';
  const first = raw.split(',')[0]?.trim();
  return first || 'unknown';
}

// Shape only. Authenticity is the wallet's job (see header).
function looksLikeManifest(text: string): boolean {
  try {
    const m = JSON.parse(text);
    return !!m && typeof m === 'object'
      && !!m.payload && typeof m.payload === 'object'
      && typeof m.signature === 'string' && m.signature.length > 0
      && typeof m.public_key_id === 'string';
  } catch {
    return false;
  }
}

async function fetchUpstream(
  tipBaseUrl: string, tipApiKey: string, tipSigningSecret: string, doFetch: typeof fetch,
): Promise<string | null> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const keySecret = await hmacHex(await sha256Hex(tipApiKey), tipSigningSecret);
  // Canonical string is ts.METHOD.pathname.body per veyrnox-tip #48; a GET has
  // an empty body, hence the trailing dot.
  const sig = await hmacHex(`${ts}.GET.${ENDPOINT}.`, keySecret);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIP_TIMEOUT_MS);
  try {
    const upstream = await doFetch(`${tipBaseUrl.replace(/\/$/, '')}${ENDPOINT}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Api-Key': tipApiKey,
        'X-Timestamp': ts,
        'X-Signature': sig,
      },
      signal: controller.signal,
    });
    if (!upstream.ok) return null;
    const text = await upstream.text();
    if (enc.encode(text).byteLength > MAX_MANIFEST_BYTES) return null;
    if (!looksLikeManifest(text)) return null;
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function handle(req: Request, deps?: Deps): Promise<Response> {
  const env: Env = deps?.env ?? ((k: string) => Deno.env.get(k));
  const origin = req.headers.get('origin');
  const originOk = !origin || allowedOrigins(env).has(origin);

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(origin, env), 'Content-Type': 'application/json' },
    });
  const manifest = (body: string) =>
    new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders(origin, env),
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });

  if (req.method === 'OPTIONS') {
    return new Response(originOk ? 'ok' : 'origin not allowed', {
      status: originOk ? 200 : 403,
      headers: corsHeaders(origin, env),
    });
  }
  if (!originOk) return json({ error: 'origin_not_allowed' }, 403);
  // POST, not GET: the Pages proxy (functions/api/edge/[fn].js) only forwards
  // POST. The body is ignored and never read.
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!rateLimit(clientIp(req))) return json({ error: 'rate_limited' }, 429);

  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const apikey = req.headers.get('apikey') ?? '';
  if (!bearer && !apikey) return json({ error: 'unauthorized' }, 401);

  const supabaseUrl = env('SUPABASE_URL');
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const tipBaseUrl = env('TIP_BASE_URL');
  const tipApiKey = env('TIP_API_KEY');
  const tipSigningSecret = env('TIP_SIGNING_SECRET');
  if (!supabaseUrl || !serviceRoleKey || !tipBaseUrl || !tipApiKey || !tipSigningSecret) {
    return json({ error: 'tip_not_configured' }, 503);
  }

  const supabase: SbClient =
    deps?.supabase ?? (createClient(supabaseUrl, serviceRoleKey) as unknown as SbClient);

  const { data, error } = await supabase.rpc('tip_manifest_cache_take');
  if (error) {
    // Fail closed. Going upstream without the cache would spend the tenant's
    // 5/hour manifest budget on every caller.
    console.error('tip_manifest_cache_take failed');
    return json({ error: 'manifest_unavailable' }, 503);
  }
  const row = Array.isArray(data) ? data[0] : data;
  const cached: string | null = typeof row?.body === 'string' && row.body ? row.body : null;

  if (!row?.should_refresh) {
    // Fresh, or another isolate holds the refresh lease.
    return cached ? manifest(cached) : json({ error: 'manifest_unavailable' }, 503);
  }

  const fresh = await fetchUpstream(tipBaseUrl, tipApiKey, tipSigningSecret, deps?.fetch ?? fetch);
  if (!fresh) {
    // Upstream failed. A stale manifest is still signed and still screens; the
    // wallet refuses anything older than what it already holds.
    return cached ? manifest(cached) : json({ error: 'tip_upstream_error' }, 502);
  }

  const put = await supabase.rpc('tip_manifest_cache_put', { p_body: fresh });
  if (put.error) console.error('tip_manifest_cache_put failed');
  return manifest(fresh);
}

if (import.meta.main) {
  Deno.serve((req) => handle(req));
}
