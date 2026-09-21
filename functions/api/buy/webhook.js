// functions/api/buy/webhook.js
//
// Transak order-lifecycle webhook receiver.
//
// Registered with Transak via the Webhook URL Whitelisting form on 2026-08-31
// as https://veyrnox-{prod,staging}.pages.dev/api/buy/webhook. Transak POSTs
// order events here as they progress: ORDER_CREATED → ORDER_PAYMENT_VERIFYING
// → ORDER_PROCESSING → ORDER_COMPLETED, plus ORDER_FAILED and ORDER_REFUNDED.
// KYC_* events do not apply — those are Whitelabel-only, and we ship the
// hosted widget.
//
// Payload shape (per docs.transak.com/features/webhooks):
//   { eventID: 'ORDER_COMPLETED', createdAt: '...', webhookData: <object|JWT> }
//
// SIGNATURE VERIFICATION — three modes, selected by env.TRANSAK_WEBHOOK_VERIFY_MODE:
//   - "strict" (DEFAULT since audit 2026-09-21 L6) — HMAC verify; on mismatch
//                or missing header return 401. If TRANSAK_WEBHOOK_SECRET is
//                unset in this mode the endpoint returns 503: nothing can be
//                verified, so nothing is accepted (Transak retries; a deploy
//                without the secret is a deployment fault, not a reason to
//                accept unauthenticated order-state updates).
//   - "warn"   — attempt HMAC verify; on mismatch log a WARN with 8-char
//                PREFIXES of the received header and the computed HMAC (never
//                the full digests — see logSigPrefix) and STILL return 200.
//                Diagnostic only. With no secret it degrades to `off`.
//   - "off"    — log-only, no crypto, return 200. Explicit opt-out.
// Mode is logged server-side with `ref` for operator triage — never echoed
// on the response, since an unauthenticated attacker POSTing would otherwise
// learn whether webhook verification is disabled and invite forgery.

// Cap the request body. This endpoint is UNAUTHENTICATED by design — Transak
// signs but we do not yet enforce that signature (see the mode switch below) —
// so anyone who knows the URL can POST to it. Without a cap, each such POST
// buys an unbounded read plus an HMAC over the whole body, in `warn` and
// `strict` alike. A real Transak order event is a couple of KB.
//
// Same guard, same limit, as functions/api/edge/[fn].js and
// functions/api/rpc/[fn].js.
const MAX_BODY_BYTES = 1_048_576;

function reqId() {
  return crypto.randomUUID().slice(0, 8);
}

// Max characters kept per logged field. Transak's longest real value is an
// order id (UUID, 36 chars); 64 leaves headroom without letting a caller pad
// the log.
const MAX_FIELD = 64;

// Defense-in-depth on the log line even after signature verification: a valid
// signer with a compromised backend could still push newlines into fields.
// Strips C0 controls + DEL and the Unicode line separators. Returns null
// unchanged so an absent field still prints as `null`.
function logSafe(value) {
  if (value == null) return null;
  const cleaned = String(value).replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, '');
  return cleaned.length > MAX_FIELD ? `${cleaned.slice(0, MAX_FIELD)}…` : cleaned;
}

// Characters of a signature digest kept in the `warn` log line. 8 hex chars is
// 32 bits — ample to tell at a glance whether the received header and the
// computed HMAC agree, which is the only question `warn` mode exists to answer.
const SIG_LOG_PREFIX = 8;

// Log-safe rendering of a signature-shaped value: a short prefix only, never
// the whole digest.
//
// Why (daily security diff, 2026-09-03): `warn` mode used to log
// `computed=${logSafe(verify.expected)}` in full. `verify.expected` is
// HMAC-SHA256(rawBody, TRANSAK_WEBHOOK_SECRET) over a body an UNAUTHENTICATED
// caller fully controls, and logSafe's MAX_FIELD is 64 while a SHA-256 hex
// digest is exactly 64 — so nothing was ever truncated. That made the log a
// signing oracle: POST a chosen body, read back a valid signature for it.
// HMACs do not expire, so signatures harvested during the warn window would
// still verify after the planned flip to `strict` — precisely the enforcement
// they would defeat. Exploiting it needs log-read access, so this was never an
// open door; the cheap moment to close it is before warn traffic runs.
//
// Do NOT widen this back to the full digest to "make debugging easier". If the
// prefixes match and the full values do not, the scheme is wrong in a way a
// longer prefix would not explain — capture the body and compute locally.
function logSigPrefix(value) {
  if (value == null) return null;
  const cleaned = logSafe(value);
  if (cleaned === null || cleaned.length === 0) return cleaned;
  return `${cleaned.slice(0, SIG_LOG_PREFIX)}…(len=${cleaned.length})`;
}

// Constant-time hex comparison so a partial-prefix match cannot be timed.
function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function bufToHex(buf) {
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

// Compute HMAC-SHA256(rawBody, secret) as hex.
export async function computeTransakSignature(rawBody, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  return bufToHex(sig);
}

// Verify the `X-Transak-Signature` header against HMAC-SHA256(rawBody, secret).
// Returns { ok:true, header, expected } on match, { ok:false, reason, header, expected } otherwise.
export async function verifyTransakSignature(request, rawBody, secret) {
  const header =
    request.headers.get('x-transak-signature') ||
    request.headers.get('X-Transak-Signature');
  if (!header) return { ok: false, reason: 'missing_signature', header: null, expected: null };
  let expected;
  try {
    expected = await computeTransakSignature(rawBody, secret);
  } catch {
    return { ok: false, reason: 'hmac_error', header, expected: null };
  }
  const ok = timingSafeEqualHex(header.trim().toLowerCase(), expected);
  return ok
    ? { ok: true, header, expected }
    : { ok: false, reason: 'signature_mismatch', header, expected };
}

function jsonResponse(status, body, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
  });
}

const VALID_MODES = new Set(['off', 'warn', 'strict']);

// Audit 2026-09-21 L6: default is `strict`. It sat at `warn` (before that
// `off`) waiting for "evidence" that never arrived, which meant an order-state
// webhook that nobody signed was acknowledged with 200. `warn` and `off`
// remain as explicit, logged opt-outs for scheme debugging.
const DEFAULT_MODE = 'strict';

function resolveMode(env) {
  const rawRaw = (env && env.TRANSAK_WEBHOOK_VERIFY_MODE) || '';
  const raw = String(rawRaw).toLowerCase();
  if (!raw) return DEFAULT_MODE;
  if (VALID_MODES.has(raw)) return raw;
  console.warn(
    `[buy/webhook] invalid TRANSAK_WEBHOOK_VERIFY_MODE=${logSafe(rawRaw)}, falling back to ${DEFAULT_MODE}`,
  );
  return DEFAULT_MODE;
}

export async function onRequestPost({ request, env }) {
  const ref = reqId();
  const secret = env && env.TRANSAK_WEBHOOK_SECRET;
  let mode = resolveMode(env);
  // Audit 2026-09-21 L6: no secret means nothing can be verified. In strict
  // mode that is a deployment fault, so fail closed (Transak retries) rather
  // than silently accepting unauthenticated order-state webhooks.
  if (!secret && mode === 'strict') {
    console.error(`[buy/webhook] ref=${ref} config_error=missing_secret mode=strict`);
    return jsonResponse(503, { ok: false, error: 'webhook_not_configured' });
  }
  if (!secret && mode !== 'off') {
    console.warn(`[buy/webhook] ref=${ref} config_warn=missing_secret mode=${mode}→off`);
    mode = 'off';
  }

  // Cheap reject via Content-Length before draining the stream; callers can lie
  // or omit it, so the byte cap is re-checked on the actual read.
  const declaredLen = Number(request.headers.get('Content-Length') || '0');
  if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
    console.warn(`[buy/webhook] ref=${ref} payload_too_large declared=${declaredLen}`);
    return jsonResponse(413, { ok: false, error: 'payload_too_large' });
  }

  // Read raw body ONCE for both HMAC verify and JSON parse — a second read
  // would drain nothing (Request bodies are single-use).
  let rawBody;
  try {
    rawBody = await request.text();
  } catch {
    console.error(`[buy/webhook] ref=${ref} read_error`);
    return jsonResponse(400, { ok: false, error: 'read_error' });
  }
  // Byte length, not code-point length — non-ASCII payloads count correctly.
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    console.warn(`[buy/webhook] ref=${ref} payload_too_large`);
    return jsonResponse(413, { ok: false, error: 'payload_too_large' });
  }

  if (mode !== 'off') {
    const verify = await verifyTransakSignature(request, rawBody, secret);
    if (!verify.ok) {
      if (mode === 'strict') {
        console.error(`[buy/webhook] ref=${ref} auth_fail reason=${verify.reason}`);
        return jsonResponse(401, { ok: false, error: 'unauthorized' });
      }
      // warn: log detail but ack 200 so no legit webhook is dropped while
      // we confirm the real scheme.
      console.warn(
        `[buy/webhook] ref=${ref} verify_warn reason=${verify.reason} ` +
          `header=${logSigPrefix(verify.header)} computed=${logSigPrefix(verify.expected)} ` +
          `hint=confirm_transak_signing_scheme`,
      );
    }
  }

  let body = null;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    console.error(`[buy/webhook] ref=${ref} parse_error`);
    return jsonResponse(200, { ok: true });
  }

  const eventID = logSafe(body?.eventID) || 'UNKNOWN';
  const orderId = logSafe(body?.webhookData?.id || body?.webhookData?.orderId);
  const status = logSafe(body?.webhookData?.status);

  // Log only non-PII fields. Full payload contains user email + address on
  // some events; we do not need those for operator triage.
  console.log(
    `[buy/webhook] ref=${ref} mode=${mode} event=${eventID} order=${orderId} status=${status}`,
  );

  return jsonResponse(200, { ok: true });
}

// Any non-POST — Transak only POSTs. Reject cleanly rather than falling
// through to the 405-with-HTML default.
export async function onRequest({ request, env }) {
  if (request.method === 'POST') return onRequestPost({ request, env });
  return new Response('Method Not Allowed', { status: 405 });
}
