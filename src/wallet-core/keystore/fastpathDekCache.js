/**
 * Fast-path DEK cache — pure wrap/unwrap primitive (issue #2019).
 *
 * Second slot alongside `dekCache.js`, owner-approved separate (Q5) —
 * `docs/kek-fast-path-design.md`. Sibling of `wrapDekForCache` /
 * `unwrapDekFromCache` with the SAME AES-GCM primitive but a DIFFERENT AAD
 * (`veyrnox/kek/fastpath/v1/aad`), so a slot mixup fails closed:
 *   - a Personal Backup cache blob does NOT authenticate as a fast-path blob,
 *   - a fast-path blob does NOT authenticate as a Personal Backup blob,
 *   - wrong KEK / tampered / cross-AAD failures all surface as the SAME
 *     generic `FASTPATH_UNWRAP_FAILED` (no oracle).
 *
 * ## What this file does NOT do
 *
 * - Talk to Android Keystore. The wrapped blob is stored server-side of the
 *   Capacitor bridge inside the biometric-gated Android Keystore alias
 *   `com.veyrnox.app.biometricCacheFastpath.v1` (see
 *   AndroidBiometricCachePlugin.kt); this module is pure JS crypto.
 * - Derive the KEK. Caller passes a 32-byte KEK; typically that is
 *   `HKDF-SHA256(H, info='veyrnox/kek/fastpath/v1')` computed by the unlock
 *   hot path.
 * - Take part in unlock decisioning — no callers under `src/` outside tests
 *   at this stage. Wiring into `native.js` is a follow-up commit.
 *
 * ## Status (honesty tag)
 *
 * TARGET / pre-audit. Issue #2019 is an opt-in latency feature (Q3), OFF by
 * default; owner accepted the coerced-biometric gap (Q1). Landing this file
 * does NOT enable the fast path anywhere — see the wiring commit.
 */

import { KEK_ERR } from './kek.js';

const enc = new TextEncoder();

// Distinct AAD from BOTH dek-cache/v1 AND the primary vault-DEK wrap. A blob
// tag made under this AAD does NOT verify against `dekCache.js` (which uses
// `veyrnox/kek/dek-cache/v1/aad`) nor against `kek.js` (which uses
// `veyrnox/kek/wrap/v2/aad`). Version pinned so a v2 fast-path format is a
// hard-visible upgrade, not an accidental one.
const FASTPATH_AAD_V1 = enc.encode('veyrnox/kek/fastpath/v1/aad');

/** Wire format version. Increment when the AAD or blob shape changes. */
export const FASTPATH_DEK_V1 = 1;

/**
 * SecureStorage key name for the fast-path cache blob. Distinct from
 * dek-cache/v1's `vault_dek_v1` per owner Q5.
 */
export const FASTPATH_DEK_STORAGE_KEY = 'vault_fastpath_dek_v1';

/**
 * Distinct error code for fast-path unwrap failures. Callers can
 * distinguish a fast-path miss from a Personal Backup cache miss without
 * any information leak — both remain generic wrong-KEK-or-tampered to the
 * user; only the CODE tells the caller which slot to retry.
 */
export const FASTPATH_UNWRAP_FAILED = 'FASTPATH_UNWRAP_FAILED';

function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

function b64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

function unb64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function zero(u8) { if (u8 && u8.fill) u8.fill(0); }

async function importAesKey(rawKek, usages) {
  if (!(rawKek instanceof Uint8Array) || rawKek.length !== 32) {
    // MALFORMED_VAULT is the closest existing structural code — same
    // discipline as dekCache.js.
    throw new Error(KEK_ERR.MALFORMED_VAULT);
  }
  return crypto.subtle.importKey(
    'raw',
    /** @type {BufferSource} */ (rawKek),
    { name: 'AES-GCM' },
    /* extractable */ false,
    usages,
  );
}

/**
 * Wrap a DEK for the fast-path cache slot. AES-256-GCM, distinct AAD.
 *
 * @param {Uint8Array} kek 32-byte KEK (typically HKDF(H))
 * @param {Uint8Array} dek 32-byte DEK to cache
 * @returns {Promise<{v:number, iv:string, ct:string}>}
 */
export async function wrapForFastpath(kek, dek) {
  if (!(dek instanceof Uint8Array) || dek.length !== 32) {
    throw new Error(KEK_ERR.MALFORMED_VAULT);
  }
  const key = await importAesKey(kek, ['encrypt']);
  const iv = randomBytes(12);
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: FASTPATH_AAD_V1 },
    key,
    /** @type {BufferSource} */ (dek),
  );
  return { v: FASTPATH_DEK_V1, iv: b64(iv), ct: b64(new Uint8Array(ctBuf)) };
}

/**
 * Unwrap a fast-path blob. Wrong KEK / tampered blob / cross-AAD blob (e.g.
 * a dek-cache/v1 or vault wrap) all fail with the SAME generic
 * `FASTPATH_UNWRAP_FAILED` — no oracle, same discipline as `unwrapDek` /
 * `unwrapDekFromCache`.
 *
 * @param {Uint8Array} kek
 * @param {{v:number, iv:string, ct:string}} blob
 * @returns {Promise<Uint8Array>} the recovered 32-byte DEK
 */
export async function unwrapFromFastpath(kek, blob) {
  if (!blob || blob.v !== FASTPATH_DEK_V1
      || typeof blob.iv !== 'string' || typeof blob.ct !== 'string') {
    throw new Error(FASTPATH_UNWRAP_FAILED);
  }
  const key = await importAesKey(kek, ['decrypt']);
  try {
    const ptBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(blob.iv), additionalData: FASTPATH_AAD_V1 },
      key,
      unb64(blob.ct),
    );
    const raw = new Uint8Array(ptBuf);
    if (raw.length !== 32) {
      const dupe = new Uint8Array(raw.length);
      dupe.set(raw);
      zero(raw);
      zero(dupe);
      throw new Error(FASTPATH_UNWRAP_FAILED);
    }
    const dek = new Uint8Array(32);
    dek.set(raw);
    zero(raw);
    return dek;
  } catch {
    throw new Error(FASTPATH_UNWRAP_FAILED);
  }
}
