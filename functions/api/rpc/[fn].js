// functions/api/rpc/[fn].js
//
// Supabase RPC proxy. Forwards allowed RPC calls to the Supabase REST API
// with the anon key injected server-side. The anon key never ships in the
// client bundle.
//
// Allowlist — only these RPCs are proxied (no raw table access):
//   track_event, generate_referral_code, register_referral_code,
//   increment_referral, get_referral_count, get_referral_paid_count,
//   record_attribution, get_referral_earnings
//
// Edge functions (first-referral-bonus, tip-screen) are proxied separately
// via /api/edge/[fn].js if needed in the future.

const ALLOWED_RPCS = new Set([
  'track_event',
  'generate_referral_code',
  'register_referral_code',
  'increment_referral',
  'get_referral_count',
  'get_referral_paid_count',
  'record_attribution',
  'get_referral_earnings',
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

  if (!ALLOWED_RPCS.has(fn)) err(403, 'RPC not allowed');

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) err(503, 'Database not configured');

  let body;
  try {
    body = await request.text();
  } catch {
    err(400, 'Invalid body');
  }

  const url = `${supabaseUrl}/rest/v1/rpc/${encodeURIComponent(fn)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer': 'return=representation',
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
