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
 * enrollHardwareCredential() → void
 * Generates the HMAC-SHA256 key in Android Keystore.
 * No biometric prompt at generation time.
 * Caller (enrollKek) will call getHardwareFactor() separately to obtain H.
 */
export async function enrollHardwareCredential() {
  const plugin = getPlugin();
  await plugin.enroll();
  // returns void — enrollKek calls getHardwareFactor() next
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
