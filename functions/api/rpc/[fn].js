// functions/api/rpc/[fn].js
//
// Supabase RPC proxy. Forwards allowed RPC calls to the Supabase REST API
// with the anon key injected server-side. The anon key never ships in the
// client bundle.
//
// Allowlist — only these RPCs are proxied (no raw table access):
//   track_event, generate_referral_code, register_referral_code,
//   increment_referral, get_referral_count, get_referral_paid_count
//
// Edge functions (first-referral-bonus, tip-screen) are proxied separately
// via /api/edge/[fn].js if needed in the future.

import { enforceRateLimit, clientIpOf } from '../_lib/rate-limit.js';

const ALLOWED_RPCS = new Set([
  'track_event',
  'generate_referral_code',
  'register_referral_code',
  'increment_referral',
  'get_referral_count',
  'get_referral_paid_count',
]);

// SQLSTATEs our own SECURITY DEFINER functions RAISE on purpose. Only an error
// carrying one of these has a message written by us, for a user to read — every
// other code is Postgres describing its own internals, and is withheld (see the
// !res.ok branch).
//
// Sourced from `RAISE EXCEPTION ... USING errcode` in
// sql/api-security-hardening.sql:
//   P0001  'Code not found: %'        P0003  'Unknown event'
//   P0006  'device_id required'       P0007  'Invalid plan'
//   P0008  'Invalid revenue'          22004  'device_id required'
//
// ADD TO THIS LIST when the SQL adds a new deliberate RAISE, or its message
// will be replaced by the generic one. That direction of failure is chosen: a
// missing entry degrades a message, a wrong entry leaks database internals.
//
// 22004 is a standard Postgres code (null_value_not_allowed) that our SQL
// reuses deliberately, so in principle Postgres could raise it itself. Kept
// because our own use is live and PG's own 22004 text names a column at worst.
const APP_ERRCODES = new Set(['P0001', 'P0003', 'P0006', 'P0007', 'P0008', '22004']);

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

  // Per-IP cap: every sibling data/* proxy already enforces one. Without it, a
  // single caller can spam the RPC allowlist (track_event, increment_referral,
  // record_attribution) uncapped, wasting Supabase quota and driving abuse
  // through the service_role key path. Fails CLOSED on cache error, matching
  // functions/api/_lib/rate-limit.js's stated contract.
  await enforceRateLimit({ bucket: `rpc-${fn}`, clientIp: clientIpOf(request) });

  // 2026-08-16 audit remediation (MED): fail LOUD on a PROD deploy that lacks
  // SUPABASE_SERVICE_ROLE_KEY. The previous fallback to SUPABASE_ANON_KEY was
  // silent, so an operator who ran the H-3 REVOKE batch after only setting one
  // secret would see every referral / telemetry write start failing without any
  // indication that the missing secret was the cause. `env.ENVIRONMENT` is now
  // repo-controlled in wrangler.toml: [env.production.vars] sets "production"
  // and [env.preview.vars] sets "preview". Only production hard-fails; preview
  // and local/dev keep the anon fallback so the deploy and the secret can land
  // independently.
  const isProd = env.ENVIRONMENT === 'production';
  if (isProd && !env.SUPABASE_SERVICE_ROLE_KEY) {
    err(503, 'Database not configured');
  }

  const supabaseUrl = env.SUPABASE_URL;
  // Prefer the service-role key, fall back to anon.
  //
  // WHY: the 2026-07-28 audit's H-3 REVOKE batch (sql/api-security-hardening.sql)
  // has been un-runnable because six of its functions "still have live anon
  // callers". Those callers are no longer in the client — every RPC now routes
  // src/api/edgeApi.js `rpc()` -> POST /api/rpc/<fn> -> here, and nothing under
  // src/ reaches PostgREST directly. THIS FILE is the last anon caller, so
  // switching it is the whole of the "matching client refactor" the SQL waits on.
  //
  // With this deployed and SUPABASE_SERVICE_ROLE_KEY set, the REVOKEs can run:
  // anon loses direct PostgREST access to those functions entirely, while this
  // allowlisted proxy keeps working.
  //
  // ORDERING IS LOAD-BEARING — do not run the REVOKEs first:
  //   1. merge this,
  //   2. set SUPABASE_SERVICE_ROLE_KEY on the Pages project,
  //   3. verify it is set, THEN run the SQL.
  // The anon fallback exists so steps 1 and 2 are independently safe: until the
  // secret is set this behaves exactly as before. It is NOT a licence to skip the
  // ordering — run the SQL with the secret unset and every referral and telemetry
  // write starts failing.
  //
  // ⚠️ service_role BYPASSES RLS. ALLOWED_RPCS is then the only boundary between
  // a caller and these functions, which is acceptable only because (a) it is a
  // closed allowlist checked before any use, (b) it reaches ONLY
  // /rest/v1/rpc/<name>, never a table, and (c) each function does its own
  // validation and rate limiting. NEVER add a table-proxy route, a passthrough
  // path segment, or a wildcard to a file holding this key.
  //
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
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

  if (!res.ok) {
    // An error the SQL AUTHOR wrote is for the client. An error POSTGRES wrote
    // is not.
    //
    // This branch used to forward `parsed.message` whatever it was, which meant
    // 'permission denied for function track_event' (42501) and
    // 'duplicate key value violates unique constraint "uq_..."' (23505) went
    // straight to the caller — constraint names, function names, PG error text.
    // That was already against the response-hygiene rule, and #1606 sharpened
    // it by putting this proxy on the service_role key: RLS is bypassed, so a
    // failure now surfaces the underlying database error instead of a uniform
    // permission denial.
    //
    // Blanket-genericising would have broken two real things, so it is a split
    // rather than a sweep: src/api/referralApi.js matches
    // `e.message?.includes('not found')` to turn a bad referral code into a
    // 404, and the operational canary below depends on the text surviving
    // SOMEWHERE.
    const ref = crypto.randomUUID().slice(0, 8);
    let clientMsg = null;
    let code = '';
    let logMsg = null;
    let parsedOk = false;
    try {
      const parsed = JSON.parse(responseBody);
      parsedOk = true;
      code = String(parsed.code ?? '');
      const msg = parsed.message ?? parsed.error;
      if (typeof msg === 'string' && msg) logMsg = msg;
      if (APP_ERRCODES.has(code) && logMsg) clientMsg = logMsg;
    } catch { /* non-JSON upstream body — nothing forwardable in it */ }

    if (clientMsg) {
      return new Response(JSON.stringify({ error: clientMsg }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Not ours: generic to the caller, everything to the tail log.
    //
    // The H-3 canary is not lost, it MOVES. 'permission denied for function X'
    // is exactly what appears if the REVOKEs in sql/api-security-hardening.sql
    // are run before SUPABASE_SERVICE_ROLE_KEY is set on the Pages project, and
    // it stays greppable here — tied to the `ref` the caller was handed —
    // rather than being disclosed to every client to keep it visible.
    // WHAT GOES IN THE LOG: `code` and `message`, never `details`/`hint`, and
    // never the raw body when we could parse one.
    //
    // This used to log `responseBody.slice(0, 500)` — the whole PostgREST error
    // object. PostgREST splits its errors across four fields, and only one of
    // them carries user VALUES:
    //   message  'duplicate key value violates unique constraint "uq_..."'
    //            — names the constraint. No values. This is the canary.
    //   details  'Key (referral_code, plan)=(ABC, annual) already exists.'
    //            — the conflicting values. On our dedup tables that is a
    //            device_id or a referral code.
    //   hint     free text, may quote input.
    // Logging the raw body swept all four in, so a unique-violation on
    // `increment_referral` or `record_attribution` wrote a device_id into the
    // tail log. CLAUDE.md's logging rule is "never log sensitive data ...
    // truncate or hash identifiers", and `veyrnox-device-id` is treated as
    // residue-grade elsewhere in this codebase (DIFF-0723).
    //
    // Dropping details/hint costs nothing operationally: `code` says what class
    // of failure it was and `message` names the constraint or function, which
    // is what you actually grep for. The H-3 canary lives in `message`
    // ('permission denied for function X'), so it is untouched.
    //
    // Unparseable bodies still get a short slice — an HTML challenge page or a
    // gateway error has no field structure to be selective about, and 200 chars
    // is enough to recognise one.
    console.error(
      `[rpc/${fn}] upstream ${res.status} ref=${ref} code=${code} `
      + (parsedOk
        ? `message=${String(logMsg ?? '').slice(0, 300)}`
        : `unparsed=${responseBody.slice(0, 200)}`),
    );
    return new Response(JSON.stringify({ error: `RPC ${fn} failed`, ref }), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(responseBody, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'application/json',
    },
  });
}
