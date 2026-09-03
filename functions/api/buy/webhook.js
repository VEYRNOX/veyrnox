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
// SIGNATURE VERIFICATION (added 2026-08-16, round 9):
// Transak's webhook signing uses HMAC-SHA256 over the raw request body with a
// shared secret, delivered in the `X-Transak-Signature` header (hex). We
// require env.TRANSAK_WEBHOOK_SECRET; a missing secret fail-closes with 500
// (RASP-style — no silent accept). A missing/mismatched header returns 401.
// The endpoint still does no state-changing side effect (log-only), but we no
// longer let an unauthenticated caller mislead an operator via forged log
// entries even under the sanitiser (see logSafe below for the residual
// defense-in-depth).

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
// Returns { ok:true } on match, { ok:false, reason } otherwise.
export async function verifyTransakSignature(request, rawBody, secret) {
  const header =
    request.headers.get('x-transak-signature') ||
    request.headers.get('X-Transak-Signature');
  if (!header) return { ok: false, reason: 'missing_signature' };
  let expected;
  try {
    expected = await computeTransakSignature(rawBody, secret);
  } catch {
    return { ok: false, reason: 'hmac_error' };
  }
  return timingSafeEqualHex(header.trim().toLowerCase(), expected)
    ? { ok: true }
    : { ok: false, reason: 'signature_mismatch' };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost({ request, env }) {
  const ref = reqId();
  const secret = env && env.TRANSAK_WEBHOOK_SECRET;
  if (!secret) {
    // RASP-style fail-closed: a receiver deployed without a secret cannot
    // authenticate anything, so refuse rather than accept-and-log.
    console.error(`[buy/webhook] ref=${ref} config_error=missing_secret`);
    return jsonResponse(500, { ok: false, error: 'server_misconfigured' });
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

  const verify = await verifyTransakSignature(request, rawBody, secret);
  if (!verify.ok) {
    console.error(`[buy/webhook] ref=${ref} auth_fail reason=${verify.reason}`);
    return jsonResponse(401, { ok: false, error: 'unauthorized' });
  }

  let body = null;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    // Signature was valid but body isn't JSON — Transak-side issue. Ack so
    // they do not retry the same broken payload forever.
    console.error(`[buy/webhook] ref=${ref} parse_error`);
    return jsonResponse(200, { ok: true });
  }

  const eventID = logSafe(body?.eventID) || 'UNKNOWN';
  const orderId = logSafe(body?.webhookData?.id || body?.webhookData?.orderId);
  const status = logSafe(body?.webhookData?.status);

  // Log only non-PII fields. Full payload contains user email + address on
  // some events; we do not need those for operator triage.
  console.log(`[buy/webhook] ref=${ref} event=${eventID} order=${orderId} status=${status}`);

  return jsonResponse(200, { ok: true });
}

// Any non-POST — Transak only POSTs. Reject cleanly rather than falling
// through to the 405-with-HTML default.
export async function onRequest({ request, env }) {
  if (request.method === 'POST') return onRequestPost({ request, env });
  return new Response('Method Not Allowed', { status: 405 });
}
