// src/lib/bugReport/uploadClient.js
//
// Slice 1e-4 — client helper wiring encrypt → RPC reserve → upload.
//
// Called from BugReportFlow.jsx onSend after the user reviews + confirms.
// Callers must NOT invoke this from a decoy/demo session — the rpc()
// helper's i3Guard fails closed, but a call site should still gate its
// own render (which BugReportFlow does via the enable gate + deniability
// check).
//
// Wire format for the octet-stream body (see also src/lib/bugReport/
// encrypt.js FORMAT_TAG 'br1'):
//
//   [0..2]   ASCII 'br1' — format tag (3 bytes)
//   [3..34]  ephemeral x25519 public key (32 bytes)
//   [35..46] AES-GCM IV (12 bytes)
//   [47..]   AES-GCM ciphertext || 16-byte auth tag (variable)
//
// Fixed 47-byte header keeps the decoder trivial on the offline support
// device. Serialisation lives HERE not in encrypt.js so encrypt.js stays
// a pure crypto leaf; the wire format is a slice-1e-4 concern.

import { rpc } from '@/api/edgeApi';
import { encrypt, FORMAT_TAG } from '@/lib/bugReport/encrypt';

const HEADER_SIZE = 3 /* v */ + 32 /* epk */ + 12 /* iv */;

/**
 * Concatenates a sealed-box envelope into the on-wire byte layout above.
 * @param {{ v: string, epk: Uint8Array, iv: Uint8Array, ct: Uint8Array }} env
 * @returns {Uint8Array}
 */
export function serializeEnvelope(env) {
  if (env.v !== FORMAT_TAG) throw new Error('BUG_REPORT_SERIALIZE_UNKNOWN_FORMAT');
  if (env.epk.length !== 32) throw new Error('BUG_REPORT_SERIALIZE_BAD_EPK');
  if (env.iv.length !== 12) throw new Error('BUG_REPORT_SERIALIZE_BAD_IV');
  const out = new Uint8Array(HEADER_SIZE + env.ct.length);
  out[0] = 0x62; // 'b'
  out[1] = 0x72; // 'r'
  out[2] = 0x31; // '1'
  out.set(env.epk, 3);
  out.set(env.iv, 35);
  out.set(env.ct, 47);
  return out;
}

/**
 * Ships a bug-report recording to support.
 *
 * @param {{
 *   captureBuffer: Uint8Array,
 *   deviceId: string,       // FRESH random uuid per report — NOT telemetry id
 *   platform: 'ios'|'android',
 *   appVersion: string,
 *   supportPublicKey: Uint8Array,  // 32-byte x25519 — slice 3 will bake real key
 *   description?: string,
 * }} args
 * @returns {Promise<{ report_id: string }>}
 */
export async function sendBugReport({
  captureBuffer,
  deviceId,
  platform,
  appVersion,
  supportPublicKey,
  description,
}) {
  if (!(captureBuffer instanceof Uint8Array) || captureBuffer.length === 0) {
    // Explicitly refuse: a slice-1d mock capture returns blob=null so
    // there is nothing to encrypt. Wiring the Send button to this helper
    // must ALWAYS have real bytes to send, not a placeholder.
    throw new Error('BUG_REPORT_NO_CAPTURE');
  }

  // Compose the plaintext that goes INSIDE the sealed box. This is where
  // the user's optional typed description travels — encrypted end-to-end
  // to the offline support key, never visible server-side.
  const encoder = new TextEncoder();
  const meta = {
    ver: 1,
    platform,
    app: appVersion,
    device_id: deviceId,
    ts: Date.now(),
    description: typeof description === 'string' ? description.slice(0, 4000) : '',
  };
  const metaBytes = encoder.encode(JSON.stringify(meta));
  // [4-byte little-endian meta length] || metaBytes || captureBuffer
  const plaintext = new Uint8Array(4 + metaBytes.length + captureBuffer.length);
  new DataView(plaintext.buffer).setUint32(0, metaBytes.length, true);
  plaintext.set(metaBytes, 4);
  plaintext.set(captureBuffer, 4 + metaBytes.length);

  // Encrypt (slice 1e-1). encrypt() refuses the placeholder key so a
  // build that flipped the flag with the real support key still absent
  // fails HERE with a clear error rather than silently sealing to a
  // key no one holds.
  const envelope = await encrypt(plaintext, supportPublicKey);
  const wire = serializeEnvelope(envelope);

  // Reserve the row (slice 1e-2 SQL) via the Pages Function proxy
  // (slice 1e-3 allowlist). RPC enforces size cap + rate limit + platform
  // allowlist; failures surface as thrown Error with P0004 message.
  const reportId = crypto.randomUUID();
  await rpc('create_bug_report_upload', {
    p_report_id: reportId,
    p_device_id: deviceId,
    p_size_bytes: wire.byteLength,
    p_app_version: appVersion,
    p_platform: platform,
    p_client_meta: {},
  });

  // Upload the envelope. Endpoint (slice 1e-3) validates report_id,
  // size vs body, PUTs to Supabase Storage via service_role, PATCHes
  // the row to status='uploaded'. Failures throw with generic messages
  // (fail-closed hygiene — see functions/api/bug-report/upload.js).
  const res = await fetch('/api/bug-report/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Report-Id': reportId,
      'X-Envelope-Size': String(wire.byteLength),
    },
    body: wire,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw Object.assign(
      new Error(data.error || `BUG_REPORT_UPLOAD_${res.status}`),
      { status: res.status },
    );
  }

  return { report_id: reportId };
}
