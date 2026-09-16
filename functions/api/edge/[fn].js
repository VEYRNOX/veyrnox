// functions/api/edge/[fn].js
//
// Supabase Edge Functions proxy. Forwards requests to Supabase edge
// functions (e.g. first-referral-bonus, tip-screen) with the anon key
// injected server-side.
//
// Allowlist — only these edge functions are proxied:
//   first-referral-bonus, tip-screen, tip-chat

import { enforceRateLimit, clientIpOf } from '../_lib/rate-limit.js';

const ALLOWED_FUNCTIONS = new Set([
  'first-referral-bonus',
  'tip-screen',
  'tip-chat',
]);

function err(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  throw e;
}

// Cap request body at ~1 MiB before forwarding to Supabase. Every edge function
// here has a small JSON payload; anything larger is either abuse or a bug, and
// forwarding it would waste both our egress and the Supabase invocation cost.
const MAX_BODY_BYTES = 1_048_576;

// The ONLY client header forwarded upstream, and it is copied by name rather
// than passed through — this proxy injects SUPABASE_ANON_KEY server-side, so a
// blanket passthrough would let a caller override Authorization/apikey.
//
// WHY IT EXISTS: supabase/functions/tip-chat reads `x-rc-user-id` and resolves
// it against RevenueCat to decide entitlement. The header set here was fixed at
// {Content-Type, Authorization, apikey}, so the id never arrived and every
// Advisor chat request from an entitled subscriber got 403 entitlement_required
// on this path. SecurityAdvisor.jsx then fell through to LEGACY_TIP_CHAT_URL
// (Supabase direct), which does carry it — so the feature "worked" only via the
// route this proxy exists to replace, at the cost of a wasted round trip, and
// not at all on a native build with no legacy URL configured.
//
// It is an IDENTIFIER, not a credential: possession of someone's RevenueCat
// app_user_id is enough to use their entitlement. Anonymous RC ids are
// high-entropy (`$RCAnonymousID:<32 hex>`) so they are not enumerable, but do
// not treat this as authentication.
//
// Bounds: RevenueCat caps app_user_id at 1500 chars. Anything with a control
// character is rejected outright rather than stripped — fetch() would throw on
// it anyway, and a 500 is a worse answer than proceeding without entitlement.
const MAX_RC_USER_ID = 1500;

function safeRcUserId(raw) {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v || v.length > MAX_RC_USER_ID) return null;
  if (/[\u0000-\u001F\u007F]/.test(v)) return null;
  return v;
}

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const fn = params.fn;

  if (!ALLOWED_FUNCTIONS.has(fn)) err(403, 'Function not allowed');

  // Per-IP cap: this POST proxy forwards with SUPABASE_ANON_KEY server-side
  // and burns Supabase invocation quota. Same limiter class as the sibling
  // data/* proxies; fail-CLOSED on limiter error per _lib/rate-limit.js.
  await enforceRateLimit({ bucket: `edge-${fn}`, clientIp: clientIpOf(request) });

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) err(503, 'Backend not configured');

  // Cheap reject via Content-Length before draining the stream. Callers can lie
  // (or omit the header) so we still enforce the byte cap on the actual read.
  const declaredLen = Number(request.headers.get('Content-Length') || '0');
  if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
    err(413, 'Request body too large');
  }

  let body;
  try {
    body = await request.text();
  } catch {
    err(400, 'Invalid body');
  }
  // Byte length, not code-point length — non-ASCII payloads count correctly.
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    err(413, 'Request body too large');
  }

  const url = `${supabaseUrl}/functions/v1/${encodeURIComponent(fn)}`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${supabaseKey}`,
    'apikey': supabaseKey,
  };
  const rcUserId = safeRcUserId(request.headers.get('X-Rc-User-Id'));
  if (rcUserId) headers['X-Rc-User-Id'] = rcUserId;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body,
  });

  if ((res.headers.get('Content-Type') || '').includes('text/event-stream')) {
    return new Response(res.body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'text/event-stream',
        'Cache-Control': res.headers.get('Cache-Control') || 'no-cache, no-transform',
        'Connection': res.headers.get('Connection') || 'keep-alive',
      },
    });
  }

  const responseBody = await res.text();

  return new Response(responseBody, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'application/json',
    },
  });
}
