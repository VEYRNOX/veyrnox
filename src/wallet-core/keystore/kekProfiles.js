// src/wallet-core/keystore/kekProfiles.js
//
// Audit 2026-09-21 H1. The KEK C factor (deriveKekC) was always derived at the
// live KDF_PARAMS, but a kek-dek blob recorded no C profile. Every profile change
// (2026-06-01, 06-28, 07-05, 08-24) silently changed C for every KEK vault
// enrolled before it: a correct PIN unwrapped nothing, the unlock screen counted
// it as a wrong PIN, and ten tries reached the panic wipe.
//
// Two pieces close it:
//   - kekKdfStamp(): every new or rotated KEK wrap records the profile C was
//     derived with, as `kekKdf` beside `kekSalt` (outside the GCM AAD).
//   - unwrapDekWithProfiles(): a stamped blob is tried at exactly its profile;
//     an unstamped blob is tried at every profile in KEK_C_PROFILES, newest
//     first, before the attempt is treated as a wrong PIN.
//
// Lives in its own module so the many keystore tests that mock ./kek.js and
// ../vault.js wholesale keep working: this file consumes those modules' (mocked)
// primitives and exports only what it adds.

import { combineKek, unwrapDek, KEK_ERR } from './kek.js';
import { deriveKekC } from '../vault.js';

/**
 * Every Argon2id profile the KEK C factor has EVER been derived with, newest
 * first. Must stay in sync with vault.js KDF_PARAMS at index 0 — a test asserts it.
 *
 *   [0]  96 MiB / t=6   2026-08-24 → now       (#2054)
 *   [1] 192 MiB / t=3   2026-07-05 → 08-24     (#604)   and 2026-06-01 → 06-28
 *   [2]  64 MiB / t=3   2026-06-28 → 07-05     (#465)
 *
 * Append-only: a new profile goes at the FRONT and nothing is ever removed —
 * removing one is the exact data-loss bug this table exists to close.
 */
export const KEK_C_PROFILES = Object.freeze([
  Object.freeze({ parallelism: 1, iterations: 6, memorySize: 98304, hashLength: 32 }),
  Object.freeze({ parallelism: 1, iterations: 3, memorySize: 196608, hashLength: 32 }),
  Object.freeze({ parallelism: 1, iterations: 3, memorySize: 65536, hashLength: 32 }),
]);

/** The `kekKdf` stamp written beside `kekSalt` on every new or rotated KEK wrap. */
export function kekKdfStamp() {
  return { ...KEK_C_PROFILES[0] };
}

// A stamp is plaintext in the blob. It is not authenticated (outside the AAD), so
// a tampered stamp must not be able to force a huge allocation before the tag
// check: bound it to the profiles we have ever shipped, exactly.
function stampedProfile(blob) {
  const s = blob && blob.kekKdf;
  if (!s || typeof s !== 'object') return null;
  const hit = KEK_C_PROFILES.find(
    (p) => p.parallelism === s.parallelism && p.iterations === s.iterations
      && p.memorySize === s.memorySize && p.hashLength === s.hashLength,
  );
  if (!hit) throw new Error('Vault KDF parameters out of range — refusing to derive key');
  return hit;
}

function zero(u8) {
  if (u8 && typeof u8.fill === 'function') u8.fill(0);
}

/**
 * Derive C, combine with H, and unwrap the DEK, trying every profile C may
 * have been derived with. Only a generic KEK_ERR.UNWRAP_FAILED advances to the
 * next profile; every other error (malformed blob, degenerate factor, missing
 * H) is fatal and rethrown at once.
 *
 * Cost: a wrong PIN on an UNSTAMPED blob costs one Argon2id derivation per
 * profile. Callers stamp `kekKdf` after the first successful fallback unlock
 * (see `usedFallback`), so that cost is paid once per legacy vault, not forever.
 *
 * H is copied per attempt because combineKek zeroes its inputs; the caller's H
 * is zeroed here on every exit (I4).
 *
 * @param {object} args
 * @param {Uint8Array} args.H            hardware factor (consumed; zeroed on exit)
 * @param {string} args.password
 * @param {Uint8Array} args.saltBytes    decoded kekSalt
 * @param {{kekWrap:object, kekKdf?:object}} args.blob
 * @param {(pw:string, salt:Uint8Array, params:object)=>Promise<Uint8Array>} [args.deriveC]  test seam
 * @param {(kek:Uint8Array)=>Promise<Uint8Array|null>} [args.readCache]  optional DEK cache probe
 *        (native fast path); a hit under this candidate KEK skips unwrapDek. A cache
 *        entry is bound to its KEK, so a wrong-profile KEK misses and falls through.
 * @returns {Promise<{kek:Uint8Array, dek:Uint8Array, profile:object, usedFallback:boolean}>}
 */
export async function unwrapDekWithProfiles({ H, password, saltBytes, blob, deriveC = deriveKekC, readCache = null }) {
  const stamped = stampedProfile(blob);
  const profiles = stamped ? [stamped] : KEK_C_PROFILES;
  try {
    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];
      const Hcopy = H.slice();
      let C;
      let kek;
      try {
        C = await deriveC(password, saltBytes, profile);
        kek = await combineKek(Hcopy, C); // zeroes Hcopy and C
        let dek = readCache ? await readCache(kek) : null;
        if (!dek) dek = await unwrapDek(kek, blob.kekWrap);
        return { kek, dek, profile, usedFallback: !stamped && i > 0 };
      } catch (err) {
        zero(kek);
        const generic = err && err.message === KEK_ERR.UNWRAP_FAILED && !err.code;
        if (!generic) throw err;
        // Wrong set for this profile — try the next one, if any.
      } finally {
        zero(Hcopy);
        zero(C);
      }
    }
    throw new Error(KEK_ERR.UNWRAP_FAILED);
  } finally {
    zero(H);
  }
}
