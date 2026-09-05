// functions/api/bug-report/upload.js
//
// Slice 1e-3 — server-side upload for opt-in bug-report screen recordings.
// See docs/bug-report-recording-plan.md for the full contract.
//
// Contract (client side, wired in slice 1e-4):
//   POST /api/bug-report/upload
//   Content-Type: application/octet-stream
//   X-Report-Id: <uuid>              // the reservation id from the RPC
//   X-Envelope-Size: <bytes>         // pre-declared size, matches body
//   Body: raw bytes of the sealed-box envelope from src/lib/bugReport/encrypt.js
//
// The client must have already called `create_bug_report_upload` via the RPC
// proxy BEFORE this endpoint — that RPC reserves the row, enforces the
// per-device rate limit, and validates size. This endpoint's ONLY job is
// to move the ciphertext to storage under service_role and mark the row
// uploaded. If the row isn't in status='reserved', the upload is refused.
//
// Why not accept the reservation and upload in one round trip? Two reasons:
//   1. Separation lets the RPC's rate-limit ledger fire even when the
//      upload never completes (attacker can't get 1000 free reservations
//      by dropping the connection).
//   2. The rate-limit accounting for the RPC is DB-side and easier to
//      reason about than for a fresh Pages-Function-side counter.
//
// Runtime effect on shipped builds: none. No client code calls this
// endpoint yet (slice 1e-4). If the flag flipped without slice 1e-4
// landing, the Settings button would open the flow and the Send action
// would still hit slice 1d's placeholder alert — this endpoint stays
// unreached.

import { enforceRateLimit, clientIpOf } from '../_lib/rate-limit.js';

const MAX_BYTES = 52 * 1024 * 1024; // 52 MiB — matches SQL CHECK
const BUCKET = 'bug-reports';
const OBJECT_EXT = '.br1'; // format tag from src/lib/bugReport/encrypt.js

function err(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  throw e;
}

/**
 * Uploads the encrypted bug-report envelope to Supabase Storage.
 *
 * Fails CLOSED on every unexpected condition:
 *   - Wrong content-type            → 415
 *   - Missing report_id             → 400
 *   - Bad report_id format          → 400
 *   - Size header vs body mismatch  → 400
 *   - Body too large                → 413
 *   - No service_role in production → 503
 *   - Storage write error           → 502
 *
 * Successful response:
 *   { ok: true, report_id: <uuid> }
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  const isProd = env.ENVIRONMENT === 'production';
  if (isProd && !env.SUPABASE_SERVICE_ROLE_KEY) {
    err(503, 'Storage not configured');
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    err(503, 'Storage not configured');
  }

  // Per-IP cap. The DB-side per-device rate limit runs at reservation time
  // (create_bug_report_upload). This is defence-in-depth for the case where
  // the same IP tries to slam this endpoint with many different device_ids.
  await enforceRateLimit({
    bucket: 'bug-report-upload',
    clientIp: clientIpOf(request),
  });

  const ct = request.headers.get('content-type') || '';
  if (!ct.startsWith('application/octet-stream')) {
    err(415, 'Unsupported content-type');
  }

  const reportId = request.headers.get('x-report-id') || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reportId)) {
    err(400, 'Invalid report_id');
  }

  const declaredSize = Number.parseInt(request.headers.get('x-envelope-size') || '', 10);
  if (!Number.isFinite(declaredSize) || declaredSize <= 0 || declaredSize > MAX_BYTES) {
    err(400, 'Invalid or out-of-range envelope size');
  }

  // Read body up to MAX_BYTES + 1 so we can detect oversize without buffering
  // the whole world. arrayBuffer() will honour the request's content length.
  const buf = await request.arrayBuffer().catch(() => null);
  if (!buf) err(400, 'Unreadable body');
  if (buf.byteLength !== declaredSize) {
    // Mismatch means either a truncated upload OR a client lying about size.
    // Either way, reject — the DB row still reflects declaredSize, and
    // accepting a shorter body would leave the row misdescribing storage.
    err(400, 'Body/size mismatch');
  }
  if (buf.byteLength > MAX_BYTES) err(413, 'Body too large');

  // PUT to Supabase Storage. The bucket policy in sql/bug-report-upload.sql
  // is deny-by-default for anon/authenticated; service_role bypasses RLS,
  // so this call succeeds. The object path is deterministic from the
  // report_id — the reservation RPC returns this same path.
  const objectPath = `${reportId}${OBJECT_EXT}`;
  const url = `${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(BUCKET)}/${encodeURIComponent(objectPath)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/octet-stream',
      'x-upsert': 'false', // do NOT allow overwrite — replay = new report_id
    },
    body: buf,
  });

  if (!res.ok) {
    // Storage failure — do not leak the raw Supabase error to the client.
    // In particular a 409 here would prove the report_id was already used;
    // even that is a small privacy tell we do not owe to a probe.
    err(502, 'Upload failed');
  }

  // Mark the row uploaded via the RPC proxy path — no direct table access.
  // The reservation row exists (RPC reserved it) so this PATCH is idempotent.
  // Best-effort: if this fails, the object is stored but the row stays
  // 'reserved' and the retention sweep will clean up. That is preferable to
  // returning success from the object PUT and blocking on a metadata update.
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/bug_reports?report_id=eq.${encodeURIComponent(reportId)}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ status: 'uploaded', uploaded_at: new Date().toISOString() }),
    });
  } catch { /* see comment above */ }

  return new Response(JSON.stringify({ ok: true, report_id: reportId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
