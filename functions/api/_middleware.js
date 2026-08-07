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
  // The live Cloudflare Pages deployment. Named explicitly because it has to be:
  // the project is `veyrnox-prod` (wrangler.toml, deploy-preview.yml
  // --project-name), and it previously reached this API only via the
  // `.endsWith('.pages.dev')` bug removed below. The stale `veyrnox-staging`
  // entry it replaces had not matched anything since the project was renamed.
  'https://veyrnox-prod.pages.dev',
  'capacitor://localhost',
  'https://localhost',
];

// Branch preview deploys land on <branch-slug>.veyrnox-prod.pages.dev, which
// cannot be enumerated ahead of time — that is the legitimate need the old
// wildcard was reaching for. Anchored at BOTH ends and pinned to our own project
// host, so `evil.pages.dev`, `x.attacker-project.pages.dev`,
// `evilveyrnox-prod.pages.dev` and `veyrnox-prod.pages.dev.evil.com` all fail.
// https only: a plaintext origin is never ours.
const PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+\.veyrnox-prod\.pages\.dev$/;

function getAllowedOrigins(env) {
  const extra = env.ALLOWED_ORIGINS;
  if (!extra) return DEFAULT_ALLOWED_ORIGINS;
  return [
    ...DEFAULT_ALLOWED_ORIGINS,
    ...extra.split(',').map(s => s.trim()).filter(Boolean),
  ];
}

/**
 * Exact allowlist membership, plus our own project's preview subdomains.
 *
 * This replaces `allowed.find(o => origin === o || origin.endsWith('.pages.dev'))`,
 * whose second clause never referenced `o` — so the first iteration decided the
 * whole predicate and ANY `*.pages.dev` origin was reflected. Cloudflare hands
 * `<project>.pages.dev` to anyone who creates a Pages project, making that an
 * attacker-registrable namespace.
 *
 * Scope note, so this is neither over- nor under-sold: every /api/* route is
 * unauthenticated by design and no Access-Control-Allow-Credentials is set, so
 * CORS is not an authentication boundary here and a non-browser client reaches
 * these endpoints regardless. What it constrains is browser-driven abuse from a
 * hostile page, which is the route by which the per-IP rate limits
 * (M-6/M-7/L-10) would otherwise be spread across arbitrary visitors' IPs.
 */
function isAllowedOrigin(origin, allowed) {
  if (!origin) return false;
  return allowed.includes(origin) || PREVIEW_ORIGIN.test(origin);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = getAllowedOrigins(env);
  const match = isAllowedOrigin(origin, allowed);
  return {
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
