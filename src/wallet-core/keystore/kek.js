// wallet-core/keystore/kek.js
//
// KEY-ENCRYPTION-KEY (KEK) LAYER.  TARGET (design) -> on build: UNAUDITED-PROVISIONAL.
// ⚠️ SECURITY-ADJACENT: this decides whether a user's real seed decrypts. A bug here
// can lose funds AND, under spec §5, lose plausible deniability under coercion. The
// UNAUDITED-PROVISIONAL tag CANNOT drop until an independent audit reviews the combine
// construction, the AEAD choice, and the deniability properties (spec §9, §10).
//
// WHAT THIS IS (docs/kek-architecture-spec.md §3):
//   The seed is wrapped under a DEK (data-encryption key); the DEK is wrapped under a
//   KEK; the KEK is COMBINED from two factors that are BOTH required:
//
//       H  — hardware factor: WebAuthn `prf` output for a FIXED salt, computed inside
//            the device's secure element. Identical for every credential/set on the
//            device (spec §3: "one hardware credential, set count invisible"). H NEVER
//            leaves the SE on a real device (I1); this module receives it only as the
//            opaque bytes the platform hands back. Source: src/dev/prfSpike.js
//            (evaluatePrf) on a real device, gated by the §8 spike outcome.
//       C  — set factor: Argon2id(PIN, salt_set) — the EXISTING vault.js derivation.
//            This is what FORKS: real / duress / panic PIN -> different C -> different
//            KEK -> different DEK -> different seed-set.
//
//       KEK = HKDF-SHA256( ikm = H ‖ C, salt = fixed, info = KEK_DOMAIN )
//
//   Domain separation (a fixed `info` context string + ordered concatenation H‖C) so
//   H and C cannot be transposed or confused (spec §9.1). Both required: H alone
//   (vault stolen, no device) yields nothing; C alone (PIN coerced, vault copied off
//   the device) yields nothing without THIS authenticator's H. That is the §1 gap.
//
// HONESTY (I4 — fail honest, fail closed):
//   - This module NEVER fabricates H. If the caller has no hardware factor (PRF
//     unavailable / not enrolled), combineKek THROWS an explicit, machine-coded error.
//     It NEVER silently degrades to a PIN-only or global/plaintext key (spec §10).
//     The decision about WHETHER a device has a usable PRF is the spike's (§8) and the
//     caller's; this module only enforces "no honest H -> no KEK".
//   - Wrong-KEK unwrap throws a GENERIC error (KEK_ERR.UNWRAP_FAILED) — it never says
//     "wrong set" vs "tampered blob", because that distinction is a deniability oracle.
//   - The combine sees only FIXED-LENGTH byte vectors and never branches on which set
//     a C belongs to, so real and decoy are indistinguishable in shape (I3, spec §9.5).
//
// SCOPE: unlock-layer only. No signing, no broadcast, no network (I2/I5). The seed
// itself is still encrypted by vault.js (Argon2id+AES-GCM); this layer wraps the DEK.

const enc = new TextEncoder();

// Lengths are fixed by construction. H is the prf output (spec/spike: 32 bytes); C is
// the Argon2id hashLength (KDF_PARAMS.hashLength == 32, vault.js). Enforcing exact
// lengths is part of fail-closed: a short/absent factor is rejected, never padded.
export const H_LEN = 32;
export const C_LEN = 32;
export const KEK_LEN = 32; // 256-bit, for AES-256-GCM DEK-wrap

// Fixed domain-separation context (audit line-item §9.1). Versioned so a future
// audited change to the construction is distinguishable from this provisional one.
export const KEK_DOMAIN = 'veyrnox/kek/v1/combine(H||C)';

// Fixed HKDF salt. The combine's reproducibility (same H,C -> same KEK across
// restarts) requires a CONSTANT salt; a random salt would break unlock. Determinism
// here is correct, unlike at-rest encryption where fresh salts matter — the entropy
// lives in H and C, not in this salt.
const KEK_HKDF_SALT = enc.encode('veyrnox/kek/v1/hkdf-salt');

// Machine codes ARE the contract (copy can change; codes cannot). Used by tests and
// callers to branch without parsing prose.
export const KEK_ERR = Object.freeze({
  NO_HARDWARE_FACTOR: 'KEK_NO_HARDWARE_FACTOR',
  NO_SET_FACTOR: 'KEK_NO_SET_FACTOR',
  UNWRAP_FAILED: 'KEK_UNWRAP_FAILED',
});

function isExactBytes(x, len) {
  return x instanceof Uint8Array && x.length === len;
}

function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

function zero(u8) { if (u8 && u8.fill) u8.fill(0); }

function b64(u8) { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); }
function unb64(str) { const s = atob(str); const u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; }

/**
 * Combine the hardware factor H and the set factor C into the KEK (spec §3).
 *
 *   KEK = HKDF-SHA256( ikm = H ‖ C, salt = KEK_HKDF_SALT, info = KEK_DOMAIN )
 *
 * Both factors are REQUIRED and must be exactly the expected length. A missing or
 * wrong-length factor FAILS CLOSED with an explicit machine code — never a silent
 * fallback (I4, spec §10). The ordered concatenation H‖C plus the fixed `info`
 * context domain-separates the two so they cannot be transposed (§9.1).
 *
 * The construction sees only fixed-length bytes and never branches on which set C
 * came from, so the op set is identical for real and decoy (I3, §9.5).
 *
 * @param {Uint8Array} H 32-byte hardware PRF output (NEVER fabricated; from the SE)
 * @param {Uint8Array} C 32-byte Argon2id(PIN, salt_set) output (vault.js)
 * @returns {Promise<Uint8Array>} 32-byte KEK
 */
export async function combineKek(H, C) {
  if (!isExactBytes(H, H_LEN)) throw new Error(KEK_ERR.NO_HARDWARE_FACTOR);
  if (!isExactBytes(C, C_LEN)) throw new Error(KEK_ERR.NO_SET_FACTOR);

  const ikm = new Uint8Array(H_LEN + C_LEN);
  ikm.set(H, 0);
  ikm.set(C, H_LEN);

  const baseKey = await crypto.subtle.importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveBits']);
  zero(ikm);

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: KEK_HKDF_SALT,
      info: enc.encode(KEK_DOMAIN),
    },
    baseKey,
    KEK_LEN * 8,
  );
  return new Uint8Array(bits);
}

/** Fresh random 256-bit DEK (the key that actually encrypts the seed in vault.js). */
export function randomDek() {
  return randomBytes(32);
}

async function importKekAesKey(kek, usages) {
  if (!isExactBytes(kek, KEK_LEN)) throw new Error(KEK_ERR.NO_HARDWARE_FACTOR);
  return crypto.subtle.importKey('raw', kek, { name: 'AES-GCM' }, false, usages);
}

/**
 * Wrap (encrypt) a DEK under the KEK with AES-256-GCM (authenticated). Fresh random
 * IV per wrap. Output is an opaque, persistable blob — never the DEK in the clear.
 * Output size is constant for a given DEK length, so it carries no per-set tell (§9.5).
 *
 * @param {Uint8Array} kek 32-byte KEK from combineKek
 * @param {Uint8Array} dek the DEK to protect
 * @returns {Promise<{v:number, iv:string, ct:string}>}
 */
export async function wrapDek(kek, dek) {
  const key = await importKekAesKey(kek, ['encrypt']);
  const iv = randomBytes(12);
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, /** @type {BufferSource} */ (dek));
  return { v: 1, iv: b64(iv), ct: b64(new Uint8Array(ctBuf)) };
}

/**
 * Unwrap (decrypt) a DEK from its wrapped blob under the KEK. A wrong KEK (e.g. a
 * decoy PIN's KEK against the real wrap) FAILS the GCM auth and throws a GENERIC
 * KEK_ERR.UNWRAP_FAILED — never distinguishing "wrong set" from "tampered" (oracle).
 *
 * @param {Uint8Array} kek 32-byte KEK from combineKek
 * @param {{v:number, iv:string, ct:string}} wrapped
 * @returns {Promise<Uint8Array>} the recovered DEK
 */
export async function unwrapDek(kek, wrapped) {
  if (!wrapped || wrapped.v !== 1) throw new Error(KEK_ERR.UNWRAP_FAILED);
  const key = await importKekAesKey(kek, ['decrypt']);
  try {
    const ptBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(wrapped.iv) },
      key,
      unb64(wrapped.ct),
    );
    return new Uint8Array(ptBuf);
  } catch {
    // Generic: do NOT distinguish wrong-KEK from tampered blob (deniability oracle).
    throw new Error(KEK_ERR.UNWRAP_FAILED);
  }
}
