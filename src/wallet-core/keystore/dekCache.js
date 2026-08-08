/**
 * DEK fast-path cache — pure wrap/unwrap primitive (Phase 1a).
 *
 * Personal Backup, spec §4.1 — `docs/cloud-recovery-shard-spec.md`. This module
 * is the primitive that will let the unlock hot path skip Shamir reconstruction
 * on steady-state opens once Shamir splitting lands (Phase 2+). It contains
 * NO Shamir logic, NO cloud transport, NO storage-layer wiring; a follow-up
 * PR wires it into `native.js`.
 *
 * ## What it is
 *
 * A second KEK-wrap of the same 32-byte DEK the vault already protects,
 * intended to be stored under a distinct Keystore key so it can be:
 *  - unwrapped on steady-state unlock without touching the vault blob, and
 *  - later swapped for a Shamir Share A wrap without the caller noticing.
 *
 * ## Why a separate module rather than reusing `kek.js` wrapDek/unwrapDek
 *
 * The primary vault wrap and the fast-path cache wrap are cryptographically
 * homogeneous (same primitive, same KEK), but they live in different Keystore
 * slots and serve different purposes. If a future refactor accidentally read
 * one and unwrapped it as the other, the shared AAD would silently accept
 * the swap. This module folds a distinct AAD constant into the tag
 * (`veyrnox/kek/dek-cache/v1/aad`), so a cache blob does NOT authenticate
 * as a vault blob and vice versa — defence in depth against a slot mixup
 * that this codebase's own audit history says is exactly the class of
 * bug that ships (see kekMutationWiring, saveVaultContents downgrade,
 * changePassword forget-getHardwareFactor — all in `CLAUDE.md`).
 *
 * ## Status (honesty tag)
 *
 * TARGET / pre-audit. This module is part of the Personal Backup work
 * authorized by owner override on 2026-08-08. Independent audit remains a
 * stated release gate; landing this file does NOT change the status of any
 * user-facing feature.
 *
 * ## What this module does NOT do
 *
 * - Talk to the platform Keystore (no `SecureStorage` calls).
 * - Derive or hold the KEK — the caller passes it, this module never sees
 *   H or C directly.
 * - Take part in unlock decisioning — no callers under `src/` outside tests.
 * - Introduce any Shamir dependency — imports only `./kek.js`.
 */

import { KEK_ERR } from './kek.js';

const enc = new TextEncoder();

// Distinct AAD from the primary vault-DEK wrap. `kek.js` uses
// `veyrnox/kek/wrap/v2/aad` — using anything else here means a cache blob
// tag does not verify against the primary wrap key material, and vice
// versa. Version pinned so a v2 cache format (e.g. with more bound
// metadata) is a hard-visible upgrade, not an accidental one.
const DEK_CACHE_AAD_V1 = enc.encode('veyrnox/kek/dek-cache/v1/aad');

/** Wire format version. Increment when the AAD or blob shape changes. */
export const DEK_CACHE_V1 = 1;

/**
 * Keystore key name for the fast-path cache blob, per spec §4.1.
 * Deliberately parallel to the existing `vault_v1` primary key so the two
 * slots read as siblings in `SecureStorage`. NOT written or read by this
 * module — the wiring PR (Phase 1b) uses it.
 */
export const DEK_CACHE_STORAGE_KEY = 'vault_dek_v1';

/**
 * Distinct error code for cache-unwrap failures. Callers can distinguish a
 * cache miss from a primary vault unwrap failure (which uses
 * `KEK_ERR.UNWRAP_FAILED`) without any information leak — both remain
 * generic wrong-KEK-or-tampered results, but the code carries which slot
 * missed so the caller can decide "fall back to primary" vs "vault is
 * genuinely broken".
 */
export const DEK_CACHE_UNWRAP_FAILED = 'DEK_CACHE_UNWRAP_FAILED';

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
  // Never let the KEK leave WebCrypto as an extractable — mirrors the discipline
  // in kek.js. A wrong-shape KEK is a caller bug; surface it as MALFORMED_VAULT
  // (the closest existing structural code) rather than inventing a new one.
  if (!(rawKek instanceof Uint8Array) || rawKek.length !== 32) {
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
 * Wrap a DEK for the fast-path cache slot. Same AES-256-GCM primitive as
 * the primary vault wrap, distinct AAD.
 *
 * @param {Uint8Array} kek 32-byte KEK from `combineKek`
 * @param {Uint8Array} dek 32-byte DEK to cache
 * @returns {Promise<{v:number, iv:string, ct:string}>} cache-blob shape
 */
export async function wrapDekForCache(kek, dek) {
  if (!(dek instanceof Uint8Array) || dek.length !== 32) {
    // A wrong-shape DEK is a caller bug: fail closed with a structural code
    // rather than silently wrapping garbage.
    throw new Error(KEK_ERR.MALFORMED_VAULT);
  }
  const key = await importAesKey(kek, ['encrypt']);
  const iv = randomBytes(12);
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: DEK_CACHE_AAD_V1 },
    key,
    /** @type {BufferSource} */ (dek),
  );
  return { v: DEK_CACHE_V1, iv: b64(iv), ct: b64(new Uint8Array(ctBuf)) };
}

/**
 * Unwrap a cache blob. A wrong KEK, a tampered blob, or a blob written by
 * `wrapDek` in `kek.js` (different AAD) all fail with the SAME generic
 * `DEK_CACHE_UNWRAP_FAILED` code — never distinguishing "cross-slot" from
 * "tampered" (deniability-safe oracle, same discipline as `unwrapDek`).
 *
 * @param {Uint8Array} kek
 * @param {{v:number, iv:string, ct:string}} blob
 * @returns {Promise<Uint8Array>} the recovered 32-byte DEK
 */
export async function unwrapDekFromCache(kek, blob) {
  if (!blob || blob.v !== DEK_CACHE_V1
      || typeof blob.iv !== 'string' || typeof blob.ct !== 'string') {
    // Structural rejection at the boundary, before any crypto runs.
    throw new Error(DEK_CACHE_UNWRAP_FAILED);
  }
  const key = await importAesKey(kek, ['decrypt']);
  try {
    const ptBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(blob.iv), additionalData: DEK_CACHE_AAD_V1 },
      key,
      unb64(blob.ct),
    );
    // Same F-08 discipline as unwrapDek: copy the plaintext into its own
    // backing buffer so zeroing the raw decrypt output doesn't wipe the
    // returned DEK.
    const raw = new Uint8Array(ptBuf);
    if (raw.length !== 32) {
      // Wrong-shape plaintext is a MALFORMED cache blob (someone wrapped
      // something that wasn't a DEK). Zero it and reject.
      const dupe = new Uint8Array(raw.length);
      dupe.set(raw);
      zero(raw);
      zero(dupe);
      throw new Error(DEK_CACHE_UNWRAP_FAILED);
    }
    const dek = new Uint8Array(32);
    dek.set(raw);
    zero(raw);
    return dek;
  } catch {
    // Generic — do NOT distinguish wrong-KEK from tampered from cross-AAD.
    throw new Error(DEK_CACHE_UNWRAP_FAILED);
  }
}
