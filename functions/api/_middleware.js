// functions/api/_middleware.js
//
// Shared middleware for all /api/* edge routes.
// Runs on every request before the handler. Provides:
//   - CORS with origin allowlist
//   - Preflight (OPTIONS) handling
//   - Error envelope (never leak internal details to the client)
//
// It does NOT validate Content-Type, or anything else about the request. This
// list claimed "Request-level validation (Content-Type on POST)" and no such
// check has ever existed in this file — a reader checking whether a handler
// needed its own body validation would have been told, here, that the
// middleware had it covered. Each handler validates its own input; see
// api/rpc/[fn].js and api/edge/[fn].js for the body-size and allowlist checks.
// If a shared check is ever wanted, add the code and the line together.

// Origins the SHIPPED app actually runs on. Allowed everywhere, production
// included. `capacitor://localhost` and `https://localhost` are the WebView's
// own origins on Android and iOS — they are not dev conveniences and removing
// them breaks every native build.
const APP_ORIGINS = [
  'https://veyrnox.com',
  'https://www.veyrnox.com',
  'https://veyrnox-staging.pages.dev',
  'capacitor://localhost',
  'https://localhost',
];

// The Vite dev server. NOT an origin the shipped app ever uses, and the only
// plaintext-http entry the list has ever carried.
//
// It was unconditional, so production reflected it: a page served from a
// developer's own machine — or from anything else listening on :5173 while a
// user has a browser open — got Access-Control-Allow-Origin back from
// veyrnox.com/api/*, and those routes are not inert. /api/rpc/[fn] injects the
// Supabase key server-side and proxies referral + telemetry writes;
// /api/buy/session mints a Transak widget URL. No cookies and no
// Allow-Credentials, so this was never session-riding — it is an unnecessary
// production allowance, removed rather than argued about.
//
// Gated on env.ENVIRONMENT, which wrangler.toml sets per Pages environment
// ("production" / "preview") and which functions/api/rpc/[fn].js already reads
// for the same purpose. Undefined (local `wrangler dev`, vitest) is treated as
// not-production, so the dev origin keeps working where it is meant to.
const DEV_ORIGINS = ['http://localhost:5173'];

function getAllowedOrigins(env) {
  const base = env.ENVIRONMENT === 'production'
    ? APP_ORIGINS
    : [...APP_ORIGINS, ...DEV_ORIGINS];
  const extra = env.ALLOWED_ORIGINS;
  if (!extra) return base;
  // ALLOWED_ORIGINS stays the deliberate escape hatch, in production too: an
  // operator who genuinely needs an extra origin names it explicitly, which is
  // a decision on the record rather than a default nobody chose.
  return [
    ...base,
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
  // Base headers regardless of match; ACAO omitted when unmatched so we don't
  // assert an origin the request never presented. `Vary: Origin` stays so
  // caches key on origin.
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Rc-User-Id',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (match) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
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
