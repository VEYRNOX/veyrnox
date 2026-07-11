// src/plugins/veyrnoxEnclave.js — JS bridge for the VeyrnoxEnclavePlugin (M2c).
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ PROVISIONAL — NOT AUDITED-SECURE, NOT DEVICE-VERIFIED.                     │
// │ Wraps the native Secure Enclave key-wrap plugin (F-2 closure). Loaded     │
// │ ONLY via native.js (itself dynamically imported behind                    │
// │ Capacitor.isNativePlatform()), so it never reaches the web bundle or the  │
// │ test suite. On web / iOS Simulator the native plugin reports              │
// │ backing:'none' and callers fall back to the M2b path.                     │
// │ See docs/M2cd.native-acl-plan.md.                                         │
// └─────────────────────────────────────────────────────────────────────────┘

import { registerPlugin } from '@capacitor/core';

// No web implementation: capability detection in native.js guarantees these are
// never invoked unless a real Secure Enclave is present. A web/Simulator call
// therefore rejects loudly instead of silently pretending to protect anything.
const VeyrnoxEnclave = registerPlugin('VeyrnoxEnclave', {
  web: () =>
    Promise.reject(new Error('VeyrnoxEnclave is not available on this platform')),
});

// #729 (M-5): the native plugin is auto-registered by Capacitor, so
// Capacitor.Plugins.VeyrnoxEnclave — and therefore these exported wrappers — are
// reachable from ANY in-page JS (e.g. an injected script), even though the M2c
// hardware-wrap path is gated OFF (M2C_HARDWARE_WRAP_ENABLED=false in native.js).
// Without a guard here, such a call could mint an orphaned Secure Enclave key or
// invoke wrap/unwrap. Fail closed at this layer too: while M2C_ENABLED is false, the
// key-minting / key-touching functions throw M2C_DISABLED and never reach native.
//
// MUST be flipped to true TOGETHER WITH native.js's M2C_HARDWARE_WRAP_ENABLED (and
// the Swift-side m2cEnabled) when the M2c Enclave path is enabled after device
// verification — keep all three in lockstep.
export const M2C_ENABLED = false;

function m2cDisabledError() {
  return Object.assign(new Error('M2c hardware wrap is disabled'), { code: 'M2C_DISABLED' });
}

/**
 * @returns {Promise<{ backing: 'secureEnclave' | 'none', biometryEnrolled: boolean }>}
 */
// Ungated: read-only capability probe. It touches no key material and callers rely
// on it to decide whether the hardware path is even available.
export async function isHardwareKeyAvailable() {
  return VeyrnoxEnclave.isHardwareKeyAvailable();
}

/** Idempotent — safe to call on every createVault even if the key exists. */
export async function createWrappingKey() {
  if (!M2C_ENABLED) throw m2cDisabledError();
  return VeyrnoxEnclave.createWrappingKey();
}

/**
 * Wrap (public-key encrypt) a base64 blob under the Enclave key. No prompt.
 * @param {string} blobB64
 * @returns {Promise<string>} ciphertext, base64
 */
export async function hwWrap(blobB64) {
  if (!M2C_ENABLED) throw m2cDisabledError();
  const { ciphertext } = await VeyrnoxEnclave.wrap({ blob: blobB64 });
  return ciphertext;
}

/**
 * Unwrap (private-key decrypt). THE OS BIOMETRIC PROMPT IS PRESENTED HERE.
 * @param {string} ciphertextB64
 * @param {string} [reason]
 * @returns {Promise<string>} plaintext blob, base64
 */
export async function hwUnwrap(ciphertextB64, reason = 'Unlock your VEYRNOX wallet') {
  if (!M2C_ENABLED) throw m2cDisabledError();
  const { blob } = await VeyrnoxEnclave.unwrap({ ciphertext: ciphertextB64, reason });
  return blob;
}

// Ungated: cleanup path. Deleting a key cannot leak key material, and clearVault
// relies on this to tear down any Enclave key regardless of the M2c gate — gating it
// would strand keys created before the flag was turned off (fail-open of cleanup).
export async function deleteWrappingKey() {
  return VeyrnoxEnclave.deleteWrappingKey();
}
