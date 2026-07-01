/**
 * hardware.js — cross-platform native hardware-KEK facade (JS side).
 *
 * STATUS: BUILT (UNAUDITED-PROVISIONAL). This module is the JS bridge to the native
 * `HardwareKek` Capacitor plugin; the actual key material and crypto live natively.
 * It replaces the WebAuthn PRF approach on native, which fails in the Capacitor WebView
 * (window.PublicKeyCredential undefined). The two shipped native implementations differ
 * (corrected per the ECC Hardware KEK audit L5):
 *   - Android (HardwareKekPlugin.kt): H = HMAC-SHA256(key, PRF_EVAL_SALT), the key held
 *     in AndroidKeyStore. StrongBox is PREFERRED but NOT enforced (may land in TEE);
 *     enroll() reports the tier and this facade's enroll gate refuses SOFTWARE/unknown.
 *   - iOS (HardwareKekPlugin.m): H is a random 32-byte value ECIES-wrapped under a
 *     NON-EXTRACTABLE Secure Enclave P-256 key (Apple ECIES: ephemeral ECDH + X9.63
 *     SHA-256 KDF + AES-GCM). Only the ECIES ciphertext of H is stored in the generic
 *     Keychain; the private key never leaves the Secure Enclave. enroll() reports
 *     keyTier 'SecureEnclave'.
 * The iOS implementation is Objective-C (HardwareKekPlugin.m/.h) — there is no Swift
 * plugin file for it.
 *
 * Security invariants:
 *   I4 — NEVER fabricates H; if biometric fails, the plugin rejects (fail closed)
 *   Android: key invalidated on new biometric (setInvalidatedByBiometricEnrollment);
 *            KeyPermanentlyInvalidatedException → clear key + explicit error (fail closed)
 *   iOS:     SE key ACL is .biometryCurrentSet (adding/removing a biometric invalidates
 *            the key); every getHardwareFactor() decryption triggers Face ID / Touch ID
 *   Per-use auth on both platforms: every getHardwareFactor() call requires biometric
 *
 * UNAUDITED-PROVISIONAL: awaiting independent third-party audit before mainnet
 * promotion to VERIFIED.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import { KEK_ERR } from './kek.js';

// PRF_EVAL_SALT — documented here for test/audit purposes.
// Android (HardwareKekPlugin.kt) computes H = HMAC-SHA256(AndroidKeyStore key, this salt)
// natively. iOS (HardwareKekPlugin.m) does NOT HMAC this salt — it ECIES-wraps a random
// 32-byte H under a Secure Enclave key — so this salt is Android-only. (iOS is
// Objective-C, .m/.h; no Swift plugin file.) "Veyrnox-prf-v1-kek-eval-salt!!!!" bytes:
export const PRF_EVAL_SALT = new Uint8Array([
  0x56,0x65,0x79,0x72,0x6e,0x6f,0x78,0x2d,
  0x70,0x72,0x66,0x2d,0x76,0x31,0x2d,0x6b,
  0x65,0x6b,0x2d,0x65,0x76,0x61,0x6c,0x2d,
  0x73,0x61,0x6c,0x74,0x21,0x21,0x21,0x21,
]);

/**
 * ENROLL_ERR — machine codes for enroll-time refusals (I4 fail-closed).
 * The message text is honesty copy; callers assert on the CODE, not the prose.
 */
export const ENROLL_ERR = Object.freeze({
  // The Keystore/Enclave landed the key in a non-hardware (or unverifiable) tier.
  // A SOFTWARE-tier key gives NO hardware binding, so enrolling it would let a
  // software-only key present as "Hardware Protection ON" — refused (M2).
  INSECURE_TIER: 'KEK_ENROLL_INSECURE_TIER',
});

// Tier names the enroll gate ACCEPTS as real secure hardware.
//   Android: STRONGBOX (2), TRUSTED_ENVIRONMENT / TEE (1), SECURE_HARDWARE_PRE31
//            (pre-API-31 secure hardware), UNKNOWN_SECURE (-1, reported secure).
//   iOS:     SecureEnclave (the iOS plugin resolves { keyTier: 'SecureEnclave' }).
// TEE is deliberately ACCEPTED — it meets the at-rest threat model; refusing it would
// needlessly exclude most Androids. StrongBox enforcement stays TARGET (not required
// here). Everything NOT in this set — SOFTWARE, UNKNOWN, NO_KEY, PROBE_ERROR:*, or a
// missing/undefined tier — is REFUSED (fail-closed on absent/insecure evidence).
const ACCEPTED_TIER_NAMES = Object.freeze(new Set([
  'STRONGBOX',
  'TRUSTED_ENVIRONMENT',
  'SECURE_HARDWARE_PRE31',
  'UNKNOWN_SECURE',
  'SecureEnclave',
]));

// Normalize the enroll() result (Android { securityLevel, securityLevelName } OR iOS
// { keyTier }) to a single { securityLevel, securityLevelName } shape for the caller.
function normalizeTier(res) {
  if (!res || typeof res !== 'object') {
    return { securityLevel: undefined, securityLevelName: undefined };
  }
  const name = res.securityLevelName ?? res.keyTier;
  return { securityLevel: res.securityLevel, securityLevelName: name };
}

/** Lazy plugin reference — only resolved on native platform */
let _plugin = null;
function getPlugin() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Hardware KEK requires the native app');
  }
  if (!_plugin) {
    _plugin = registerPlugin('HardwareKek');
  }
  return _plugin;
}

/** base64 (no-wrap) → Uint8Array */
function b64ToUint8Array(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * isHardwareEnrolled() → boolean
 * Checks whether the HMAC key exists in Android Keystore.
 */
export async function isHardwareEnrolled() {
  const plugin = getPlugin();
  const { enrolled } = await plugin.isEnrolled();
  return enrolled;
}

/**
 * enrollHardwareCredential() → { securityLevel, securityLevelName }
 * Generates the hardware-bound key (Android Keystore HMAC / iOS Secure Enclave),
 * then GATES on the real security tier the platform reports (M2, I4 fail-closed).
 *
 * A key that landed in SECURITY_LEVEL_SOFTWARE (or an unknown/unreadable tier) gives
 * NO hardware binding — enrolling it would let a software-only key present as
 * "Hardware Protection ON", defeating the offline-seizure protection this feature
 * exists for. So we REFUSE those tiers here (throw ENROLL_ERR.INSECURE_TIER) BEFORE
 * enrollKek is ever called — leaving the vault bare (no kekWrap). TEE and StrongBox
 * (and iOS Secure Enclave) are ACCEPTED.
 *
 * On acceptance we RETURN the tier so the caller (enrollKek path / settings UI) can
 * surface it. No biometric prompt at generation time; enrollKek calls
 * getHardwareFactor() next to obtain H.
 */
export async function enrollHardwareCredential() {
  const plugin = getPlugin();
  const raw = await plugin.enroll();
  const tier = normalizeTier(raw);
  if (!tier.securityLevelName || !ACCEPTED_TIER_NAMES.has(tier.securityLevelName)) {
    // Fail-closed: refuse a software/unknown/unreadable tier. The caller's cleanup
    // (clearHardwareCredential) removes the orphaned alias; no kekWrap is written.
    // Object.assign (not `err.code = …`) so the code/tier are part of the value's type.
    throw /** @type {Error & {code: string, securityLevel: number|undefined, securityLevelName: string|undefined}} */ (
      Object.assign(
        new Error(
          `${ENROLL_ERR.INSECURE_TIER}: device reported tier ` +
          `"${tier.securityLevelName ?? 'unknown'}" — no secure hardware element, ` +
          `hardware protection can't be enabled on this device`,
        ),
        {
          code: ENROLL_ERR.INSECURE_TIER,
          securityLevel: tier.securityLevel,
          securityLevelName: tier.securityLevelName,
        },
      )
    );
  }
  return tier;
}

/**
 * getHardwareFactor() → Uint8Array (32 bytes)
 * Presents BiometricPrompt, computes HMAC-SHA256(key, PRF_EVAL_SALT) natively,
 * returns the 32-byte result.
 */
export async function getHardwareFactor() {
  const plugin = getPlugin();
  const { h } = await plugin.getHardwareFactor();
  // I/O-boundary validation (fail-closed, I4): the plugin output is UNTRUSTED at the
  // JS bridge. Validate BEFORE decoding — a missing/non-string h must throw the stable
  // KEK_ERR.NO_HARDWARE_FACTOR, never reach atob() (raw InvalidCharacterError/TypeError)
  // and never fabricate/return garbage bytes.
  if (typeof h !== 'string' || h.length === 0) {
    throw new Error(KEK_ERR.NO_HARDWARE_FACTOR);
  }
  let result;
  try {
    result = b64ToUint8Array(h);
  } catch {
    throw new Error(KEK_ERR.NO_HARDWARE_FACTOR);
  }
  // The hardware factor is fixed-length by construction (spec §3: 32 bytes). A wrong
  // length is not a usable H — reject with the stable code, never pad or truncate.
  if (result.length !== 32) {
    throw new Error(KEK_ERR.NO_HARDWARE_FACTOR);
  }
  return result;
}

/**
 * clearHardwareCredential() → void
 * Deletes the HMAC key from Android Keystore.
 */
export async function clearHardwareCredential() {
  const plugin = getPlugin();
  await plugin.clearCredential();
}
