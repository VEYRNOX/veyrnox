// wallet-core/keystore/web.js — the web KeyStore implementation.
//
// This is the EXISTING web vault path, now behind the keyStore contract. It is
// a pure structural wrapper: the crypto (../vault.js, Argon2id+AES-GCM) and the
// ciphertext persistence (../evm/vaultStore.js, IndexedDB) are UNCHANGED — this
// module only composes them into the KeyStore interface. No algorithm, storage
// format, or behaviour changes here versus the pre-M2a code.

import { encryptVault, decryptVault } from '../vault.js';
import { saveVault, loadVault, hasVault, clearVault } from '../evm/vaultStore.js';

/** @type {import('./keyStore.js').KeyStore} */
export const webKeyStore = {
  // Web has no Secure Enclave / StrongBox. Native (M2b) returns true when one
  // is present and is the stronger control documented in the threat model.
  async isSecureHardwareAvailable() {
    return false;
  },

  // Delegated straight to the unchanged IndexedDB store (ciphertext only).
  hasVault,

  // Encrypt -> persist ciphertext. Mirrors the prior WalletProvider sequence
  // (encryptVault + saveVault) exactly; saveVault still enforces its
  // plaintext-blob guard.
  async createVault(secret, password) {
    const blob = await encryptVault(secret, password);
    await saveVault(blob);
  },

  // Load ciphertext -> decrypt. Preserves the prior behaviour exactly, including
  // the "No wallet found" path and decryptVault's wrong-password/tamper throw.
  async unlock(password) {
    const blob = await loadVault();
    if (!blob) throw new Error('No wallet found on this device');
    return decryptVault(blob, password); // throws on wrong password or tamper
  },

  // The unlocked secret lives in WalletProvider's in-memory ref on web, so the
  // store holds nothing to clear here. Native (M2b) drops its hardware grant.
  lock() {},

  // Delegated straight to the unchanged IndexedDB store.
  clearVault,
};
