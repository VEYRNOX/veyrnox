// functions/api/edge/[fn].js
//
// Supabase Edge Functions proxy. Forwards requests to Supabase edge
// functions (e.g. first-referral-bonus, tip-screen) with the anon key
// injected server-side.
//
// Allowlist — only these edge functions are proxied:
//   first-referral-bonus, tip-screen

const ALLOWED_FUNCTIONS = new Set([
  'first-referral-bonus',
  'tip-screen',
]);

function err(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  throw e;
}

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const fn = params.fn;

  if (!ALLOWED_FUNCTIONS.has(fn)) err(403, 'Function not allowed');

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) err(503, 'Backend not configured');

  let body;
  try {
    body = await request.text();
  } catch {
    err(400, 'Invalid body');
  }

  const url = `${supabaseUrl}/functions/v1/${encodeURIComponent(fn)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
    },
    body,
  });

  const responseBody = await res.text();

  return new Response(responseBody, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'application/json',
    },
  });
}
