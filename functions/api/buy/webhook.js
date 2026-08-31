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

  const eventID = body?.eventID || 'UNKNOWN';
  const orderId = body?.webhookData?.id || body?.webhookData?.orderId || null;
  const status = body?.webhookData?.status || null;

  // Log only non-PII fields. Full payload contains user email + address on
  // some events; we do not need those for operator triage.
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
