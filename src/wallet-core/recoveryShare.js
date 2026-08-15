// wallet-core/recoveryShare.js — Personal Backup Phase 3.
//
// Passphrase-encrypted envelope for a single shamir share, so a share destined
// for cloud storage (iCloud Drive, Google Drive, Dropbox, or any storage
// provider reached via the OS share sheet) carries its own AES-GCM layer on
// top of whatever the cloud provider offers. Matches spec §5.1 / §5.3 of
// docs/cloud-recovery-shard-spec.md.
//
// **Why an extra wrap on top of shamir?** One share alone is
// information-theoretically zero-knowledge — so the raw byte layout is safe
// in cloud storage by itself. But two shares from independent locations
// reconstruct the DEK. If a user's cloud provider is compromised AND a second
// share leaks separately, the attacker gets the DEK. The Argon2id + AES-GCM
// wrap adds a per-file passphrase gate so a leaked cloud share is not
// immediately combinable with anything.
//
// **This module does NOT talk to any cloud provider.** It produces / consumes
// a JSON envelope; the caller hands the resulting bytes to whatever file-save
// mechanism it likes (native share sheet, download link, direct filesystem
// write). Phase 3 stays out of platform plugin work — iCloud Keychain and
// Google Backup silent-sync integration is a later phase.
//
// **Gate.** Reuses the same ENABLE_PERSONAL_BACKUP_SHARDS flag as the split
// primitive. Nothing here ships in prod bundles until the flag is on.
//
// **Fail-closed contract (I4).** A wrong passphrase fails at the AES-GCM auth
// tag with a generic 'RECOVERY_SHARE_UNWRAP_FAILED' — no oracle for "wrong
// passphrase" vs. "tampered envelope". Malformed JSON / wrong-length fields
// fail early with RECOVERY_SHARE_MALFORMED so the caller can distinguish "user
// picked the wrong file" from "user typed the wrong passphrase".

import { argon2id } from 'hash-wasm';
import { KDF_PARAMS } from './vault.js';
import { SHARE_SIZE } from './shamir.js';
import {
  ENABLE_PERSONAL_BACKUP_SHARDS,
  PERSONAL_BACKUP_SHARDS_DISABLED,
} from './shardBackup.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Envelope format version. Bump when field layout or AAD changes. */
export const RECOVERY_SHARE_ENVELOPE_VERSION = 1;

/** Minimum passphrase length per spec §5.1 (16 characters). */
export const RECOVERY_PASSPHRASE_MIN_LENGTH = 16;

export const RECOVERY_SHARE_DISABLED = PERSONAL_BACKUP_SHARDS_DISABLED;
export const RECOVERY_SHARE_MALFORMED = 'RECOVERY_SHARE_MALFORMED';
export const RECOVERY_SHARE_UNWRAP_FAILED = 'RECOVERY_SHARE_UNWRAP_FAILED';
export const RECOVERY_PASSPHRASE_TOO_SHORT = 'RECOVERY_PASSPHRASE_TOO_SHORT';

const ENVELOPE_APP = 'veyrnox';
const ENVELOPE_TYPE = 'recovery-share';
// Distinct type for a whole-bundle wrap (Codex P1, 2026-08-15): PersonalBackup
// runSplit's "encrypt one share" checkbox previously wired UI state that was
// never consumed, so the export was always raw. wrapBundleWithPassphrase
// below wraps the ENTIRE bundle #2 JSON string (share + vault + hash) as one
// opaque blob. A distinct `type` keeps this un-parseable by the share-only
// unwrap and vice versa — tryParseRecoveryEnvelope callers must switch on it.
const ENVELOPE_TYPE_BUNDLE = 'recovery-bundle-v1';

/**
 * Validate a recovery passphrase against the spec §5.1 minimum. Length only;
 * strength enforcement (dictionary checks, character-class mix, etc.) is a
 * separate concern layered on top by the UI.
 * @param {string} passphrase
 * @returns {{ ok: boolean, reason?: string }}
 */
export function checkRecoveryPassphrase(passphrase) {
  if (typeof passphrase !== 'string') {
    return { ok: false, reason: 'Enter a recovery passphrase.' };
  }
  if (passphrase.length < RECOVERY_PASSPHRASE_MIN_LENGTH) {
    return {
      ok: false,
      reason: `Use at least ${RECOVERY_PASSPHRASE_MIN_LENGTH} characters.`,
    };
  }
  return { ok: true };
}

function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

function toB64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function fromB64(str) {
  // Any base64 decode failure surfaces as RECOVERY_SHARE_MALFORMED, not a raw
  // DOMException — the caller distinguishes malformed vs. wrong-passphrase.
  try {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    throw new Error(RECOVERY_SHARE_MALFORMED);
  }
}

/**
 * AAD binds the envelope's public metadata to the ciphertext. A future field
 * addition MUST bump RECOVERY_SHARE_ENVELOPE_VERSION and be included here;
 * silent header tampering (e.g. flipping shareIndex to lie about which slot
 * this file came from) is otherwise indistinguishable from the original
 * document. Matches the pattern used by vault.js v:3 AAD binding.
 */
function envelopeAad(shareIndex, type = ENVELOPE_TYPE) {
  return enc.encode(
    JSON.stringify({
      app: ENVELOPE_APP,
      type,
      version: RECOVERY_SHARE_ENVELOPE_VERSION,
      shareIndex,
    }),
  );
}

async function deriveRecoveryKey(passphrase, salt) {
  const pw = enc.encode(passphrase.normalize('NFKC'));
  try {
    const raw = /** @type {Uint8Array} */ (
      await argon2id({
        password: pw,
        salt,
        parallelism: KDF_PARAMS.parallelism,
        iterations: KDF_PARAMS.iterations,
        memorySize: KDF_PARAMS.memorySize,
        hashLength: KDF_PARAMS.hashLength,
        outputType: 'binary',
      })
    );
    // Import once; the CryptoKey holds the material inside SubtleCrypto — we
    // still zero `raw` so a leak of process memory does not surface the key.
    const key = await crypto.subtle.importKey(
      'raw',
      /** @type {BufferSource} */ (raw),
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    );
    raw.fill(0);
    return key;
  } finally {
    pw.fill(0);
  }
}

/**
 * Wrap a single shamir share (88-byte v2 envelope) under a passphrase.
 * Returns a JSON string ready for file save; the caller decides where it goes.
 *
 * @param {Uint8Array} share  88-byte shamir envelope (from splitDekForPersonalBackup).
 * @param {string} passphrase  Recovery passphrase, min 16 chars.
 * @param {number} shareIndex  1..255, the shamir x-coord this file carries. Non-secret;
 *   bound into AAD so a tamper flipping it is detected.
 * @returns {Promise<string>}  JSON envelope (spec §5.3 shape).
 */
export async function wrapShareWithPassphrase(share, passphrase, shareIndex) {
  if (!ENABLE_PERSONAL_BACKUP_SHARDS) {
    throw new Error(RECOVERY_SHARE_DISABLED);
  }
  if (!(share instanceof Uint8Array) || share.length !== SHARE_SIZE) {
    throw new Error(RECOVERY_SHARE_MALFORMED);
  }
  if (!Number.isInteger(shareIndex) || shareIndex < 1 || shareIndex > 255) {
    throw new Error(RECOVERY_SHARE_MALFORMED);
  }
  const pf = checkRecoveryPassphrase(passphrase);
  if (!pf.ok) throw new Error(RECOVERY_PASSPHRASE_TOO_SHORT);

  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const key = await deriveRecoveryKey(passphrase, salt);
  const aad = envelopeAad(shareIndex);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 },
      key,
      /** @type {BufferSource} */ (share),
    ),
  );
  return JSON.stringify({
    app: ENVELOPE_APP,
    type: ENVELOPE_TYPE,
    version: RECOVERY_SHARE_ENVELOPE_VERSION,
    shareIndex,
    kdf: {
      parallelism: KDF_PARAMS.parallelism,
      iterations: KDF_PARAMS.iterations,
      memorySize: KDF_PARAMS.memorySize,
      hashLength: KDF_PARAMS.hashLength,
    },
    salt: toB64(salt),
    iv: toB64(iv),
    ct: toB64(ct),
  });
}

/**
 * Wrap an arbitrary byte buffer — specifically, the UTF-8 encoding of a whole
 * recovery BUNDLE JSON string (share + vault + hash, see shardBackup.js
 * encodeShareBundle) — under a passphrase. Same KDF/cipher/AAD-binding shape
 * as wrapShareWithPassphrase, but under ENVELOPE_TYPE_BUNDLE so the two are
 * never cross-parseable, and unconstrained to SHARE_SIZE.
 *
 * @param {Uint8Array} bytes  Plaintext to wrap (a bundle's UTF-8 JSON bytes).
 * @param {string} passphrase  Recovery passphrase, min 16 chars.
 * @param {number} shareIndex  1..255, the shamir x-coord this file carries. Non-secret;
 *   bound into AAD so a tamper flipping it is detected.
 * @returns {Promise<string>}  JSON envelope string.
 */
export async function wrapBundleWithPassphrase(bytes, passphrase, shareIndex) {
  if (!ENABLE_PERSONAL_BACKUP_SHARDS) {
    throw new Error(RECOVERY_SHARE_DISABLED);
  }
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
    throw new Error(RECOVERY_SHARE_MALFORMED);
  }
  if (!Number.isInteger(shareIndex) || shareIndex < 1 || shareIndex > 255) {
    throw new Error(RECOVERY_SHARE_MALFORMED);
  }
  const pf = checkRecoveryPassphrase(passphrase);
  if (!pf.ok) throw new Error(RECOVERY_PASSPHRASE_TOO_SHORT);

  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const key = await deriveRecoveryKey(passphrase, salt);
  const aad = envelopeAad(shareIndex, ENVELOPE_TYPE_BUNDLE);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 },
      key,
      /** @type {BufferSource} */ (bytes),
    ),
  );
  return JSON.stringify({
    app: ENVELOPE_APP,
    type: ENVELOPE_TYPE_BUNDLE,
    version: RECOVERY_SHARE_ENVELOPE_VERSION,
    shareIndex,
    kdf: {
      parallelism: KDF_PARAMS.parallelism,
      iterations: KDF_PARAMS.iterations,
      memorySize: KDF_PARAMS.memorySize,
      hashLength: KDF_PARAMS.hashLength,
    },
    salt: toB64(salt),
    iv: toB64(iv),
    ct: toB64(ct),
  });
}

/**
 * Parse a byte buffer into a recovery envelope object. Returns null if the
 * buffer is not JSON or not shaped like a recovery envelope — used by the UI
 * to distinguish raw share files from encrypted ones on file pick.
 * @param {Uint8Array} bytes
 * @returns {object | null}
 */
export function tryParseRecoveryEnvelope(bytes) {
  if (!(bytes instanceof Uint8Array)) return null;
  // Quick guard: raw 88-byte shares are not JSON. Skip the parse attempt.
  if (bytes.length === SHARE_SIZE && bytes[0] === 0x02) return null;
  let text;
  try {
    text = dec.decode(bytes);
  } catch {
    return null;
  }
  const trimmed = text.trimStart();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(text);
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.app === ENVELOPE_APP &&
      (parsed.type === ENVELOPE_TYPE || parsed.type === ENVELOPE_TYPE_BUNDLE)
    ) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Decrypt a recovery envelope back to the 88-byte share bytes. Fail-closed
 * on wrong passphrase, tampered header, or malformed input.
 *
 * @param {object|string} envelope  Either the parsed JSON object or the JSON string.
 * @param {string} passphrase
 * @returns {Promise<Uint8Array>}  The original 88-byte shamir envelope.
 */
export async function unwrapShareWithPassphrase(envelope, passphrase) {
  if (!ENABLE_PERSONAL_BACKUP_SHARDS) {
    throw new Error(RECOVERY_SHARE_DISABLED);
  }
  const obj = typeof envelope === 'string' ? tryParseObject(envelope) : envelope;
  if (!obj || typeof obj !== 'object') throw new Error(RECOVERY_SHARE_MALFORMED);
  if (obj.app !== ENVELOPE_APP || obj.type !== ENVELOPE_TYPE) {
    throw new Error(RECOVERY_SHARE_MALFORMED);
  }
  if (obj.version !== RECOVERY_SHARE_ENVELOPE_VERSION) {
    // A future v:2 file must not silently decrypt under v:1 rules.
    throw new Error(RECOVERY_SHARE_MALFORMED);
  }
  if (!Number.isInteger(obj.shareIndex) || obj.shareIndex < 1 || obj.shareIndex > 255) {
    throw new Error(RECOVERY_SHARE_MALFORMED);
  }
  // Only accept the exact KDF params we produced. An import path that
  // trusted attacker-controlled kdf values would be a pre-authentication
  // resource-exhaustion vector (see vault.js:70-84 for the equivalent
  // reasoning on backup envelopes). No migration surface today; if params
  // ever change, bump the envelope version instead.
  if (
    !obj.kdf ||
    obj.kdf.parallelism !== KDF_PARAMS.parallelism ||
    obj.kdf.iterations !== KDF_PARAMS.iterations ||
    obj.kdf.memorySize !== KDF_PARAMS.memorySize ||
    obj.kdf.hashLength !== KDF_PARAMS.hashLength
  ) {
    throw new Error(RECOVERY_SHARE_MALFORMED);
  }

  const salt = fromB64(obj.salt);
  const iv = fromB64(obj.iv);
  const ct = fromB64(obj.ct);
  if (salt.length !== 32) throw new Error(RECOVERY_SHARE_MALFORMED);
  if (iv.length !== 12) throw new Error(RECOVERY_SHARE_MALFORMED);
  // AES-GCM ct = plaintext + 16-byte tag → 88 + 16 = 104 bytes exactly.
  if (ct.length !== SHARE_SIZE + 16) throw new Error(RECOVERY_SHARE_MALFORMED);

  const key = await deriveRecoveryKey(passphrase, salt);
  const aad = envelopeAad(obj.shareIndex);
  let pt;
  try {
    pt = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 },
        key,
        /** @type {BufferSource} */ (ct),
      ),
    );
  } catch {
    // Generic wrong-passphrase-or-tampered. Do NOT leak which — an oracle
    // between the two would let an attacker distinguish a real envelope from
    // a synthetic one during a passphrase brute-force.
    throw new Error(RECOVERY_SHARE_UNWRAP_FAILED);
  }
  if (pt.length !== SHARE_SIZE) {
    // A tampered ct that somehow decrypted with a mismatched length — defence
    // in depth. AES-GCM should have rejected first, but the caller expects
    // exactly SHARE_SIZE bytes downstream.
    pt.fill(0);
    throw new Error(RECOVERY_SHARE_UNWRAP_FAILED);
  }
  return pt;
}

/**
 * Decrypt a bundle envelope back to the original plaintext bytes (the UTF-8
 * bundle JSON string, undecoded — caller does `new TextDecoder().decode(...)`
 * then `JSON.parse`). Fail-closed on wrong passphrase, tampered header,
 * malformed input, or a SHARE-type envelope handed to the wrong unwrap.
 *
 * @param {object|string} envelope
 * @param {string} passphrase
 * @returns {Promise<Uint8Array>}
 */
export async function unwrapBundleWithPassphrase(envelope, passphrase) {
  if (!ENABLE_PERSONAL_BACKUP_SHARDS) {
    throw new Error(RECOVERY_SHARE_DISABLED);
  }
  const obj = typeof envelope === 'string' ? tryParseObject(envelope) : envelope;
  if (!obj || typeof obj !== 'object') throw new Error(RECOVERY_SHARE_MALFORMED);
  if (obj.app !== ENVELOPE_APP || obj.type !== ENVELOPE_TYPE_BUNDLE) {
    throw new Error(RECOVERY_SHARE_MALFORMED);
  }
  if (obj.version !== RECOVERY_SHARE_ENVELOPE_VERSION) {
    throw new Error(RECOVERY_SHARE_MALFORMED);
  }
  if (!Number.isInteger(obj.shareIndex) || obj.shareIndex < 1 || obj.shareIndex > 255) {
    throw new Error(RECOVERY_SHARE_MALFORMED);
  }
  if (
    !obj.kdf ||
    obj.kdf.parallelism !== KDF_PARAMS.parallelism ||
    obj.kdf.iterations !== KDF_PARAMS.iterations ||
    obj.kdf.memorySize !== KDF_PARAMS.memorySize ||
    obj.kdf.hashLength !== KDF_PARAMS.hashLength
  ) {
    throw new Error(RECOVERY_SHARE_MALFORMED);
  }

  const salt = fromB64(obj.salt);
  const iv = fromB64(obj.iv);
  const ct = fromB64(obj.ct);
  if (salt.length !== 32) throw new Error(RECOVERY_SHARE_MALFORMED);
  if (iv.length !== 12) throw new Error(RECOVERY_SHARE_MALFORMED);
  if (ct.length <= 16) throw new Error(RECOVERY_SHARE_MALFORMED);

  const key = await deriveRecoveryKey(passphrase, salt);
  const aad = envelopeAad(obj.shareIndex, ENVELOPE_TYPE_BUNDLE);
  let pt;
  try {
    pt = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 },
        key,
        /** @type {BufferSource} */ (ct),
      ),
    );
  } catch {
    // Generic wrong-passphrase-or-tampered — same no-oracle contract as the
    // share unwrap, including a flipped shareIndex (AAD mismatch surfaces
    // here, not as a distinct error).
    throw new Error(RECOVERY_SHARE_UNWRAP_FAILED);
  }
  return pt;
}

function tryParseObject(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
