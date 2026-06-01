// wallet-core/keystore/web.js — the web KeyStore implementation.
//
// This is the EXISTING web vault path, now behind the keyStore contract. It is
// a structural wrapper over the crypto (../vault.js, Argon2id+AES-GCM) and the
// ciphertext persistence (../evm/vaultStore.js, IndexedDB). The algorithms and
// storage format are unchanged; the only behavioural addition (SAST M3) is a
// transparent KDF-parameter MIGRATION on unlock (see unlock()).

import { encryptVault, decryptVault, vaultNeedsRekey } from '../vault.js';
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
  //
  // M3 MIGRATION (lazy, upgrade-only): after a SUCCESSFUL decrypt, if the blob was
  // encrypted with weaker-than-current KDF params, transparently re-encrypt it at
  // the new params and persist. This happens at most once per vault (the next
  // unlock sees current params and skips it). Best-effort: a failed re-encrypt
  // must NEVER block the unlock — the user still gets their (old-params) secret,
  // and the rekey simply retries next time. Old vaults are NEVER locked out: the
  // decrypt above already used the blob's own params (see decryptVault).
  async unlock(password) {
    const blob = await loadVault();
    if (!blob) throw new Error('No wallet found on this device');
    const secret = await decryptVault(blob, password); // throws on wrong password or tamper
    if (vaultNeedsRekey(blob)) {
      try {
        await saveVault(await encryptVault(secret, password)); // re-encrypt at current params
      } catch {
        /* best-effort: keep the old blob; unlock still succeeds, rekey retries later */
      }
    }
    return secret;
  },

  // Re-encrypt the EXISTING vault under a new password, keeping the SAME secret
  // (non-custodial "change my vault password"). This is decrypt-then-re-encrypt
  // over the unchanged ../vault.js crypto — NO new algorithm, parameter, or
  // format. The current password is verified by actually decrypting the stored
  // blob (so a wrong current password throws the SAME generic error as unlock and
  // changes NOTHING), then the recovered secret is re-encrypted at the CURRENT
  // KDF params and persisted. Because encryptVault always records the current
  // params, a legacy-params vault is also upgraded here (same effect as the
  // unlock-time M3 migration). The secret is never written anywhere in plaintext.
  async changePassword(currentPassword, newPassword) {
    const blob = await loadVault();
    if (!blob) throw new Error('No wallet found on this device');
    const secret = await decryptVault(blob, currentPassword); // throws on wrong password or tamper
    // Re-wrap under the new password. Only persist after a successful re-encrypt,
    // so a failure here leaves the old (still-valid) blob untouched.
    await saveVault(await encryptVault(secret, newPassword));
  },

  // The unlocked secret lives in WalletProvider's in-memory ref on web, so the
  // store holds nothing to clear here. Native (M2b) drops its hardware grant.
  lock() {},

  // Delegated straight to the unchanged IndexedDB store.
  clearVault,
};
