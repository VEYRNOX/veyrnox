// functions/api/_middleware.js
//
// Shared middleware for all /api/* edge routes.
// Runs on every request before the handler. Provides:
//   - CORS with origin allowlist
//   - Preflight (OPTIONS) handling
//   - Request-level validation (Content-Type on POST)
//   - Error envelope (never leak internal details to the client)

const DEFAULT_ALLOWED_ORIGINS = [
  'https://veyrnox.com',
  'https://www.veyrnox.com',
  'https://veyrnox-staging.pages.dev',
  'capacitor://localhost',
  'https://localhost',
  'http://localhost:5173',
];

function getAllowedOrigins(env) {
  const extra = env.ALLOWED_ORIGINS;
  if (!extra) return DEFAULT_ALLOWED_ORIGINS;
  return [
    ...DEFAULT_ALLOWED_ORIGINS,
    ...extra.split(',').map(s => s.trim()).filter(Boolean),
  ];
}

// Cloudflare Pages preview deployments for THIS project only.
//
// `deploy-preview.yml` publishes with `--project-name=veyrnox-prod`, so previews
// land on `https://<branch-slug>.veyrnox-prod.pages.dev` and the project alias is
// `https://veyrnox-prod.pages.dev`. Those are the origins the preview allowance
// is for, and the pattern is anchored to them.
//
// This replaces `origin.endsWith('.pages.dev')`, which was not a preview
// allowance but an open door: the test ignored the allowlist entry it was
// nominally comparing against, so ANY origin ending in `.pages.dev` was
// reflected straight back into Access-Control-Allow-Origin — and *.pages.dev is
// a free, self-service namespace, so an attacker could simply deploy
// `evil-attacker.pages.dev` and be inside the allowlist. Everything under
// /api/* was covered, including /api/rpc/[fn] (which injects the Supabase anon
// key server-side and proxies referral + telemetry writes) and
// /api/buy/session.
//
// The slug is Cloudflare's own charset, matching the `tr -c 'a-zA-Z0-9-'`
// sanitiser in deploy-preview.yml. A dot is NOT permitted in it, so
// `evil.veyrnox-prod.pages.dev.attacker.com` cannot match.
const PAGES_PREVIEW_RE = /^https:\/\/(?:[a-z0-9-]+\.)?veyrnox-(?:prod|staging)\.pages\.dev$/;

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = getAllowedOrigins(env);
  const match = allowed.includes(origin) || PAGES_PREVIEW_RE.test(origin);
  return {
    // Unmatched origins get the canonical origin rather than their own, so the
    // browser refuses the response instead of us reflecting an attacker's.
    'Access-Control-Allow-Origin': match ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const cors = corsHeaders(request, env);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const response = await context.next();

    const out = new Response(response.body, response);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  } catch (err) {
    const status = err.status || 500;
    const body = { error: err.expose ? err.message : 'Internal error' };
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
}
