// src/rasp/__tests__/helpers/rawToDerEcdsa.js
//
// ECDSA raw R‖S → ASN.1 DER transcoder — JS mirror of the Kotlin transcoder used
// in PlayIntegrityPlugin.kt (rawEcdsaSignatureToDer). Its purpose is to make the
// transcode algorithm executable-testable from Node (the Kotlin function runs on
// Android, so its correctness is proved here by cross-checking against Node's
// crypto DER output on real EC P-256 keys).
//
// HONEST GAP: this JS mirror proves the algorithm. A Kotlin JVM harness would be
// required to prove the Kotlin plugin binding — see the test file header.
//
// Reference:
//   RFC 7518 §3.4 — JWS ES256 signature is raw R || S, 64 bytes for P-256.
//   RFC 3279   — ECDSA-Sig-Value ::= SEQUENCE { r INTEGER, s INTEGER }.
//
// I4 — fail-closed: any structural anomaly throws; the caller (Kotlin
// verifyJwsSignature) maps a throw to `return false`.

/**
 * Encode a positive big-endian byte array as a DER INTEGER.
 * Strips leading 0x00 bytes, but preserves one leading 0x00 when the high bit of
 * the resulting most-significant byte is set (so it stays a positive INTEGER).
 *
 * @param {Uint8Array} bytes  raw big-endian integer bytes (r or s), length >= 1
 * @returns {Uint8Array}      DER-encoded INTEGER: 0x02 <len> <content>
 */
export function derEncodeInteger(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error('derEncodeInteger: expected Uint8Array');
  }
  if (bytes.length === 0) {
    throw new Error('derEncodeInteger: empty input');
  }
  // Strip leading zeros, keep at least one byte.
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0x00) start += 1;
  let content = bytes.slice(start);
  // If high bit is set, prepend a 0x00 so the value stays positive.
  if ((content[0] & 0x80) !== 0) {
    const padded = new Uint8Array(content.length + 1);
    padded[0] = 0x00;
    padded.set(content, 1);
    content = padded;
  }
  // For our r/s (max ~33 bytes) length always fits in short-form (< 128).
  if (content.length >= 128) {
    // Long-form length encoding (not needed for P-256 r/s but honest to guard).
    throw new Error('derEncodeInteger: content too long for short-form length');
  }
  const out = new Uint8Array(2 + content.length);
  out[0] = 0x02; // INTEGER tag
  out[1] = content.length;
  out.set(content, 2);
  return out;
}

/**
 * Transcode a raw JWS ECDSA P-256 signature (R || S, 64 bytes) to ASN.1 DER
 * ECDSA-Sig-Value as required by JCA `Signature("SHA256withECDSA").verify()`.
 *
 * @param {Uint8Array} raw    concatenated R || S, MUST be exactly 64 bytes for P-256
 * @returns {Uint8Array}      DER SEQUENCE { INTEGER r, INTEGER s }
 * @throws                    on any length mismatch (fail-closed, I4)
 */
export function rawToDerEcdsa(raw) {
  if (!(raw instanceof Uint8Array)) {
    throw new Error('rawToDerEcdsa: expected Uint8Array');
  }
  if (raw.length !== 64) {
    // ES256 raw signature is exactly 64 bytes (32-byte R || 32-byte S).
    // Anything else is malformed → fail closed.
    throw new Error(`rawToDerEcdsa: expected 64 bytes, got ${raw.length}`);
  }
  const r = raw.slice(0, 32);
  const s = raw.slice(32, 64);
  const rDer = derEncodeInteger(r);
  const sDer = derEncodeInteger(s);
  const contentLen = rDer.length + sDer.length;
  if (contentLen >= 128) {
    throw new Error('rawToDerEcdsa: SEQUENCE content too long for short-form');
  }
  const out = new Uint8Array(2 + contentLen);
  out[0] = 0x30; // SEQUENCE tag
  out[1] = contentLen;
  out.set(rDer, 2);
  out.set(sDer, 2 + rDer.length);
  return out;
}
