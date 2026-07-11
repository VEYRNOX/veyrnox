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
//       H  — device-bound factor (platform key store): on web, the WebAuthn `prf`
//            output for a FIXED salt; on native, a value the platform key store hands
//            back after a per-use biometric gate. NOTE (H14/H15, corrected per the ECC
//            Hardware KEK audit L5 to match the SHIPPED plugins):
//              - iOS (HardwareKekPlugin.m): H is a fresh 32-byte random value ECIES-
//                wrapped under a NON-EXTRACTABLE Secure Enclave P-256 key (Apple's
//                kSecKeyAlgorithmECIESEncryptionCofactorX963SHA256AESGCM). Only the
//                ECIES *ciphertext* of H sits in the generic Keychain
//                (kSecClassGenericPassword); the decrypting private key never leaves the
//                Secure Enclave and every getHardwareFactor triggers Face ID / Touch ID.
//              - Android (HardwareKekPlugin.kt): H is HMAC-SHA256 over a fixed salt with
//                an AndroidKeyStore-backed key; StrongBox is PREFERRED but NOT enforced
//                (the key may land in TEE), so the tier is observed, not guaranteed.
//            Honest claims: iOS H IS bound to a non-extractable Secure Enclave key;
//            Android H is "device-bound (AndroidKeyStore, StrongBox not enforced)". An
//            unqualified "hardware-backed" for Android is still NOT honest. This is an
//            INTERNAL developer note; user-facing copy stays qualified (kek.honesty
//            tests guard the settings UI). Identical for every credential/set on the
//            device (spec §3: "one device-bound credential, set count invisible").
//            H is produced and held by the platform key store, never persisted by this
//            module (I1); this module receives it only as the opaque bytes the platform
//            hands back. Source: src/dev/prfSpike.js (evaluatePrf) on a real device,
//            gated by the §8 spike outcome.
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

// L7 (ECC Hardware KEK audit): AAD (additional authenticated data) for the DEK wrap.
// Legacy v1 blobs were sealed with NO AAD, so the blob's own format `version` was not
// folded into the GCM tag (malleable metadata). v2 binds this fixed context — which
// carries the format-version identity — as GCM AAD, so a v2 tag verifies only when the
// version is genuinely v2. This is the only self-contained metadata available at this
// layer: callers (web.js/native.js) pass wrapDek only (kek, dek), never the kekSalt, so
// the kekSalt cannot be bound here without a caller-signature change (out of scope). The
// version is authenticated; a downgrade/cross-version reinterpretation now fails closed.
const WRAP_AAD_V2 = enc.encode('veyrnox/kek/wrap/v2/aad');

// Wrap format versions. v1 = legacy, no AAD (still unwrappable — real devices hold these).
// v2 = current, binds WRAP_AAD_V2 as GCM AAD. New wraps are always written as v2.
const WRAP_V1 = 1;
const WRAP_V2 = 2;

// Machine codes ARE the contract (copy can change; codes cannot). Used by tests and
// callers to branch without parsing prose.
export const KEK_ERR = Object.freeze({
  NO_HARDWARE_FACTOR: 'KEK_NO_HARDWARE_FACTOR',
  NO_SET_FACTOR: 'KEK_NO_SET_FACTOR',
  UNWRAP_FAILED: 'KEK_UNWRAP_FAILED',
  // The stored vault blob is unreadable/ill-shaped at the I/O boundary BEFORE any
  // crypto runs: JSON.parse of a corrupt secure-store value, or a missing/empty/
  // non-base64 kekSalt on a KEK-enrolled blob. Distinct from UNWRAP_FAILED (which is
  // a GENERIC wrong-KEK/tamper result and must stay a deniability-safe oracle). This
  // is a structural "the blob is malformed" signal — not a wrong-PIN signal — and
  // carries no per-set information (it fires the same for real/decoy). Fail-closed.
  MALFORMED_VAULT: 'KEK_MALFORMED_VAULT',
  // A degenerate hardware/set factor (e.g. all-zero H) rejected before combine (H-4).
  DEGENERATE_INPUT: 'KEK_DEGENERATE_INPUT',
  // The requested KEK operation needs an enrolled (kekWrap) vault, but the vault is bare.
  // Used by upgradeKekToV3 to fail closed BEFORE any biometric prompt when there is
  // nothing to upgrade (a non-KEK vault). Distinct from MALFORMED_VAULT (structurally
  // unreadable) — the blob is perfectly valid, it just carries no hardware KEK wrap.
  NOT_ENROLLED: 'KEK_NOT_ENROLLED',
  // The hardware key was PERMANENTLY invalidated by the OS (Android: biometric
  // enrollment changed / screen lock removed → setInvalidatedByBiometricEnrollment
  // fires KeyPermanentlyInvalidatedException). The key can NEVER produce H again; the
  // ONLY recovery is seed restore. This is NOT a wrong PIN — callers MUST NOT count it
  // toward the wrong-PIN wipe limit, and MUST route the user to seed recovery (I4).
  KEY_PERMANENTLY_INVALIDATED: 'KEK_KEY_PERMANENTLY_INVALIDATED',
});

/**
 * Decode a base64 kekSalt from a stored vault blob to bytes, FAILING CLOSED with the
 * stable KEK_ERR.MALFORMED_VAULT if it is absent/empty/non-base64 — never a raw
 * InvalidCharacterError. A KEK-enrolled blob with an unusable kekSalt is structurally
 * malformed; we reject before deriving any key material. Shared by web.js/native.js so
 * the contract is identical on both paths.
 * @param {unknown} kekSalt
 * @returns {Uint8Array}
 */
export function decodeKekSalt(kekSalt) {
  if (typeof kekSalt !== 'string' || kekSalt.length === 0) {
    throw new Error(KEK_ERR.MALFORMED_VAULT);
  }
  let bin;
  try {
    bin = atob(kekSalt);
  } catch {
    throw new Error(KEK_ERR.MALFORMED_VAULT);
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  // H-3 (#722): a KEK-enrolled salt is fixed at 32 bytes by construction (H and C are both
  // salt-bound). Any other decoded length is structural corruption/tamper, not a valid salt
  // — reject fail-closed (I4) before it can seed key derivation.
  if (out.length !== 32) {
    throw Object.assign(new Error(KEK_ERR.MALFORMED_VAULT), { code: KEK_ERR.MALFORMED_VAULT });
  }
  return out;
}

/**
 * Parse a stored vault blob string, FAILING CLOSED with the stable
 * KEK_ERR.MALFORMED_VAULT on a corrupt value — never a raw SyntaxError. Accepts an
 * already-parsed object (some stores return objects) and returns it unchanged.
 * @param {unknown} raw
 * @returns {any}
 */
export function parseVaultBlob(raw) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') throw new Error(KEK_ERR.MALFORMED_VAULT);
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(KEK_ERR.MALFORMED_VAULT);
  }
}

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
 * @param {Uint8Array} H 32-byte hardware factor (NEVER fabricated; from the platform
 *          key store — web PRF / iOS Secure-Enclave-ECIES / Android AndroidKeyStore HMAC)
 * @param {Uint8Array} C 32-byte Argon2id(PIN, salt_set) output (vault.js)
 * @returns {Promise<Uint8Array>} 32-byte KEK
 */
export async function combineKek(H, C) {
  // L-2 (#738): carry a machine-readable .code (matching the DEGENERATE_INPUT throw
  // below) so callers branching on err.code get the code, not undefined.
  if (!isExactBytes(H, H_LEN)) {
    throw Object.assign(new Error(KEK_ERR.NO_HARDWARE_FACTOR), { code: KEK_ERR.NO_HARDWARE_FACTOR });
  }
  if (!isExactBytes(C, C_LEN)) {
    throw Object.assign(new Error(KEK_ERR.NO_SET_FACTOR), { code: KEK_ERR.NO_SET_FACTOR });
  }

  // H-4 / iOS-F8 (defence in depth): reject an all-zero H or C. An all-zero factor is a
  // valid length but contributes no entropy, collapsing the KEK to the other factor
  // alone (I6 hardware binding silently void). The device layer (hardware.js) is the
  // first line; this is the combine's own fail-closed guard (I4).
  const hAllZero = H.every((b) => b === 0);
  const cAllZero = C.every((b) => b === 0);
  if (hAllZero || cAllZero) {
    throw Object.assign(new Error(KEK_ERR.DEGENERATE_INPUT), {
      code: KEK_ERR.DEGENERATE_INPUT,
    });
  }

  const ikm = new Uint8Array(H_LEN + C_LEN);
  ikm.set(H, 0);
  ikm.set(C, H_LEN);

  const baseKey = await crypto.subtle.importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveBits']);
  // F-06: zero(ikm) wipes the JS-visible copy; the CryptoKey retains an opaque internal buffer until GC.
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

  // M20: zero the highest-sensitivity intermediates in place before returning.
  // H is the hardware binding key and C is the FULL Argon2id(PIN, salt) output;
  // both are wiped so they do not linger in the JS heap until GC (I4, fail
  // closed). NOTE: this mutates the caller's arrays — every production caller
  // (keystore/web.js, keystore/native.js) derives a FRESH H (getHardwareFactor)
  // and a FRESH C (deriveKekC) per combineKek and does NOT read H/C afterwards.
  // A caller that needs the SAME H/C for a second combineKek (e.g. PIN rotation)
  // must derive/copy them per call rather than relying on these arrays surviving.
  zero(H);
  zero(C);

  // Copy the derived key material out, then wipe the raw deriveBits ArrayBuffer so
  // no KEK bytes linger in a buffer the caller never sees. `kek` owns its own
  // backing buffer; zeroing the `bits` view does not touch it.
  const kek = new Uint8Array(KEK_LEN);
  kek.set(new Uint8Array(bits));
  zero(new Uint8Array(bits));
  return kek;
}

/** Fresh random 256-bit DEK (the key that actually encrypts the seed in vault.js). */
export function randomDek() {
  return randomBytes(32);
}

async function importKekAesKey(kek, usages) {
  // L-1 (#737): a wrong-length/wrong-type combined KEK is a DEGENERATE input, not a
  // missing hardware factor. Shared by wrapDek + unwrapDek; both fail closed with
  // DEGENERATE_INPUT (carrying .code) rather than misattributing to NO_HARDWARE_FACTOR.
  if (!isExactBytes(kek, KEK_LEN)) {
    throw Object.assign(new Error(KEK_ERR.DEGENERATE_INPUT), { code: KEK_ERR.DEGENERATE_INPUT });
  }
  return crypto.subtle.importKey('raw', kek, { name: 'AES-GCM' }, false, usages);
}

/**
 * Wrap (encrypt) a DEK under the KEK with AES-256-GCM (authenticated). Fresh random
 * IV per wrap. Output is an opaque, persistable blob — never the DEK in the clear.
 * Output size is constant for a given DEK length, so it carries no per-set tell (§9.5).
 *
 * L7: new wraps are format v2 and bind WRAP_AAD_V2 as GCM AAD, authenticating the
 * format version into the tag (defence-in-depth against version malleability). Legacy
 * v1 blobs remain unwrappable (see unwrapDek).
 *
 * @param {Uint8Array} kek 32-byte KEK from combineKek
 * @param {Uint8Array} dek the DEK to protect
 * @returns {Promise<{v:number, iv:string, ct:string}>}
 */
export async function wrapDek(kek, dek) {
  const key = await importKekAesKey(kek, ['encrypt']);
  const iv = randomBytes(12);
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: WRAP_AAD_V2 },
    key,
    /** @type {BufferSource} */ (dek),
  );
  return { v: WRAP_V2, iv: b64(iv), ct: b64(new Uint8Array(ctBuf)) };
}

/**
 * Unwrap (decrypt) a DEK from its wrapped blob under the KEK. A wrong KEK (e.g. a
 * decoy PIN's KEK against the real wrap) FAILS the GCM auth and throws a GENERIC
 * KEK_ERR.UNWRAP_FAILED — never distinguishing "wrong set" from "tampered" (oracle).
 *
 * L7 backward-compat: v1 blobs (legacy, written WITHOUT AAD, already on real devices)
 * decrypt with NO additionalData — exactly as before. v2 blobs decrypt with the bound
 * WRAP_AAD_V2, so a v2 tag verifies only under the genuine v2 AAD; a downgraded or
 * cross-version blob fails the tag and falls through to the generic UNWRAP_FAILED. Any
 * other/absent version is rejected fail-closed.
 *
 * @param {Uint8Array} kek 32-byte KEK from combineKek
 * @param {{v:number, iv:string, ct:string}} wrapped
 * @returns {Promise<Uint8Array>} the recovered DEK
 */
export async function unwrapDek(kek, wrapped) {
  if (!wrapped || (wrapped.v !== WRAP_V1 && wrapped.v !== WRAP_V2)) {
    throw new Error(KEK_ERR.UNWRAP_FAILED);
  }
  const key = await importKekAesKey(kek, ['decrypt']);
  // v1 = no AAD (legacy); v2 = WRAP_AAD_V2 folded into the tag. The version drives the
  // AAD, and the version itself is authenticated for v2 (a v2 ct decrypted as v1 has no
  // AAD and fails the tag), so the version cannot be silently downgraded.
  const params = wrapped.v === WRAP_V2
    ? { name: 'AES-GCM', iv: unb64(wrapped.iv), additionalData: WRAP_AAD_V2 }
    : { name: 'AES-GCM', iv: unb64(wrapped.iv) };
  try {
    const ptBuf = await crypto.subtle.decrypt(params, key, unb64(wrapped.ct));
    // F-08 (audit, I4): copy the DEK out into ITS OWN backing buffer, then zero the
    // RAW decrypt ArrayBuffer (ptBuf) so the plaintext DEK does not linger in a
    // buffer the caller never sees until GC. NOTE: `new Uint8Array(ptBuf)` is a VIEW
    // over ptBuf, not a copy — so we allocate a fresh array and .set() into it,
    // otherwise zeroing ptBuf would also wipe the returned DEK.
    const raw = new Uint8Array(ptBuf);
    const dek = new Uint8Array(raw.length);
    dek.set(raw);
    zero(raw); // wipes ptBuf's backing store; `dek` is independent.
    return dek;
  } catch {
    // Generic: do NOT distinguish wrong-KEK from tampered blob (deniability oracle).
    throw new Error(KEK_ERR.UNWRAP_FAILED);
  }
}
