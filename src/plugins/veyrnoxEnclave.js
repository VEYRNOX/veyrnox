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

/**
 * @returns {Promise<{ backing: 'secureEnclave' | 'none', biometryEnrolled: boolean }>}
 */
export async function isHardwareKeyAvailable() {
  return VeyrnoxEnclave.isHardwareKeyAvailable();
}

/** Idempotent — safe to call on every createVault even if the key exists. */
export async function createWrappingKey() {
  return VeyrnoxEnclave.createWrappingKey();
}

/**
 * Wrap (public-key encrypt) a base64 blob under the Enclave key. No prompt.
 * @param {string} blobB64
 * @returns {Promise<string>} ciphertext, base64
 */
export async function hwWrap(blobB64) {
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
  const { blob } = await VeyrnoxEnclave.unwrap({ ciphertext: ciphertextB64, reason });
  return blob;
}

export async function deleteWrappingKey() {
  return VeyrnoxEnclave.deleteWrappingKey();
}
