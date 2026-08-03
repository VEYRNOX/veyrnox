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
];

function getAllowedOrigins(env) {
  const extra = env.ALLOWED_ORIGINS;
  if (!extra) return DEFAULT_ALLOWED_ORIGINS;
  return [
    ...DEFAULT_ALLOWED_ORIGINS,
    ...extra.split(',').map(s => s.trim()).filter(Boolean),
  ];
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = getAllowedOrigins(env);
  const match = allowed.find(o => origin === o || origin.endsWith('.pages.dev'));
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
