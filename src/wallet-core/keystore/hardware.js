/**
 * hardware.js — Native Android Keystore HMAC-SHA256 implementation
 *
 * STATUS: BUILT (UNAUDITED-PROVISIONAL) — Native Android Keystore HMAC-SHA256
 * implementation. Replaces the WebAuthn PRF approach which fails in the
 * Android Capacitor WebView (window.PublicKeyCredential undefined).
 *
 * Security invariants:
 *   I4 — NEVER fabricates H; if biometric fails, plugin rejects (fail closed)
 *   Key is invalidated if new biometric enrolled (setInvalidatedByBiometricEnrollment)
 *   Per-use auth: every getHardwareFactor() call requires biometric
 *   KeyPermanentlyInvalidatedException → clear key + explicit error (fail closed)
 *
 * UNAUDITED-PROVISIONAL: awaiting independent third-party audit before mainnet
 * promotion to VERIFIED.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

// PRF_EVAL_SALT — documented here for test/audit purposes.
// The actual HMAC computation occurs natively in HardwareKekPlugin.kt (Android)
// and HardwareKekPlugin.swift (iOS). "Veyrnox-prf-v1-kek-eval-salt!!!!" as UTF-8 bytes
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
  const result = b64ToUint8Array(h);
  if (result.length !== 32) {
    throw new Error(`Hardware factor wrong length: ${result.length}`);
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
