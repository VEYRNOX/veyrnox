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
// The docs say "verify with your Partner Access Token before processing" but
// do not spell out the signing scheme (Ed25519 pub key? HMAC?). Until we
// confirm the exact verification with Transak, this receiver logs-and-acks
// with no cryptographic verification — cheaper than shipping a wrong verifier.
// The endpoint itself does no side effect other than console logging, so an
// unverified event cannot corrupt state; the risk is a spoofed event misleads
// an operator reading logs. Add real verification before this data drives
// any user-visible action (attribution, referral bonuses, UI state).
// ponytail: log-only, add HMAC/JWT verify when Transak returns exact spec.

function reqId() {
  return crypto.randomUUID().slice(0, 8);
}

// Max characters kept per logged field. Transak's longest real value is an
// order id (UUID, 36 chars); 64 leaves headroom without letting a caller pad
// the log.
const MAX_FIELD = 64;

// Every logged field below comes from an unauthenticated caller — this endpoint
// deliberately does no signature verification yet (see the header note), so the
// body is fully attacker-controlled.
//
// Without this, a newline inside eventID forges additional log lines:
//
//   {"eventID": "X\n[buy/webhook] ref=deadbeef event=ORDER_COMPLETED order=…"}
//
// which renders as a second, well-formed-looking entry. The header already
// names "a spoofed event misleads an operator reading logs" as the residual
// risk; forged log LINES are the sharper form of it, and are not mitigated by
// the endpoint being side-effect-free.
//
// Strips C0 controls + DEL (covers CR, LF, tab) and the Unicode line
// separators, which some log viewers also break on. Returns null unchanged so
// an absent field still prints as `null`.
function logSafe(value) {
  if (value == null) return null;
  const cleaned = String(value).replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, '');
  return cleaned.length > MAX_FIELD ? `${cleaned.slice(0, MAX_FIELD)}…` : cleaned;
}

export async function onRequestPost({ request }) {
  const ref = reqId();
  let body = null;
  try {
    body = await request.json();
  } catch {
    // Return 200 anyway — Transak retries on non-2xx, and a malformed body is
    // a Transak-side issue we cannot fix by retrying.
    console.error(`[buy/webhook] ref=${ref} parse_error`);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const eventID = logSafe(body?.eventID) || 'UNKNOWN';
  const orderId = logSafe(body?.webhookData?.id || body?.webhookData?.orderId);
  const status = logSafe(body?.webhookData?.status);

  // Log only non-PII fields. Full payload contains user email + address on
  // some events; we do not need those for operator triage. Every value goes
  // through logSafe first — see its note; the body is unauthenticated.
  console.log(`[buy/webhook] ref=${ref} event=${eventID} order=${orderId} status=${status}`);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Any non-POST — Transak only POSTs. Reject cleanly rather than falling
// through to the 405-with-HTML default.
export async function onRequest({ request }) {
  if (request.method === 'POST') return onRequestPost({ request });
  return new Response('Method Not Allowed', { status: 405 });
}
