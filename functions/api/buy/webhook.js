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
// SIGNATURE VERIFICATION — three modes (round 10 audit concern):
// Round 9 assumed Transak's signing scheme is raw-hex HMAC-SHA256 in a bare
// `X-Transak-Signature` header. docs.transak.com does not spell this out, so
// if Transak actually sends `sha256=<hex>`, base64, JWT, or Ed25519, every
// legitimate webhook 401s. Gate verification behind env.TRANSAK_WEBHOOK_VERIFY_MODE:
//   - "off"    (default) — log-only, no crypto, return 200. Current pre-round-9 behaviour.
//   - "warn"   — attempt HMAC verify; on mismatch log a WARN with header +
//                computed values and STILL return 200. Use to confirm the
//                scheme against real Transak traffic before enforcing.
//   - "strict" — attempt HMAC verify; on mismatch return 401. Enable only
//                after `warn` telemetry confirms the scheme.
// If TRANSAK_WEBHOOK_SECRET is unset, we fall back to log-only regardless of
// mode (do NOT 500 — that would drop all legitimate webhooks the moment the
// secret rotates or is missing on a fresh deploy).
// Mode is logged server-side with `ref` for operator triage — never echoed
// on the response, since an unauthenticated attacker POSTing would otherwise
// learn whether webhook verification is disabled and invite forgery.
//
// TODO: once real Transak traffic is captured in `warn` mode with matching
// signatures, flip TRANSAK_WEBHOOK_VERIFY_MODE=strict on Cloudflare Pages.

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
function resolveMode(env) {
  const rawRaw = (env && env.TRANSAK_WEBHOOK_VERIFY_MODE) || '';
  const raw = String(rawRaw).toLowerCase();
  if (!raw) return 'off';
  if (VALID_MODES.has(raw)) return raw;
  console.warn(
    `[buy/webhook] invalid TRANSAK_WEBHOOK_VERIFY_MODE=${logSafe(rawRaw)}, falling back to off`,
  );
  return 'off';
}

export async function onRequestPost({ request, env }) {
  const ref = reqId();
  const secret = env && env.TRANSAK_WEBHOOK_SECRET;
  let mode = resolveMode(env);
  // No secret → cannot verify anything. Degrade to log-only rather than 500,
  // so a missing/rotating secret doesn't drop every legitimate webhook.
  if (!secret && mode !== 'off') {
    console.warn(`[buy/webhook] ref=${ref} config_warn=missing_secret mode=${mode}→off`);
    mode = 'off';
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
          `header=${logSafe(verify.header)} computed=${logSafe(verify.expected)} ` +
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
