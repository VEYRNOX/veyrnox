// wallet-core/coldkey/qr.js
//
// COLD-KEY SIGNING (Feature 5) — the versioned, self-describing QR envelope that
// moves UNSIGNED transactions to an external signer and SIGNED bytes back.
//
// The envelope carries NO secret (I1): an unsigned EVM tx / BTC PSBT, or the
// signed raw bytes returned by the signer. decodeColdPayload NEVER throws and
// FAILS CLOSED to null on anything that is not a recognised Veyrnox cold payload
// (unknown fmt/version/kind, or non-JSON) so a malicious/garbled QR can never be
// mistaken for a valid transaction to broadcast.

const FMT = 'veyrnox-cold';
const VERSION = 1;

// The transaction KINDS carried over the air gap (the machine contract — copy
// elsewhere may change, these codes do not).
export const COLD_KIND = Object.freeze({
  EVM_UNSIGNED: 'EVM_UNSIGNED',
  EVM_SIGNED: 'EVM_SIGNED',
  BTC_PSBT_UNSIGNED: 'BTC_PSBT_UNSIGNED',
  BTC_PSBT_SIGNED: 'BTC_PSBT_SIGNED',
  BTC_RAW_SIGNED: 'BTC_RAW_SIGNED',
});

/** @type {Set<string>} */
const KINDS = new Set(Object.values(COLD_KIND));

/**
 * Encode a cold payload to the string the QR encodes. The payload's own `kind`
 * field is preserved; everything else rides under `data`.
 * @param {{kind:string, [k:string]:any}} payload  must include a recognised COLD_KIND.
 * @returns {string}
 */
export function encodeColdPayload(payload) {
  if (!payload || !KINDS.has(payload.kind)) {
    throw new Error('encodeColdPayload: unknown cold payload kind');
  }
  const { kind, ...data } = payload;
  return JSON.stringify({ fmt: FMT, v: VERSION, kind, data });
}

/**
 * Decode a scanned QR string back to the original payload object, or null if it is
 * not a valid Veyrnox cold payload. NEVER throws (fail closed to null).
 * @param {string} raw
 * @returns {object|null}
 */
export function decodeColdPayload(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || parsed.fmt !== FMT || parsed.v !== VERSION) return null;
  if (!KINDS.has(parsed.kind)) return null;
  return { kind: parsed.kind, ...(parsed.data || {}) };
}
