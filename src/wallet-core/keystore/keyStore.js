// wallet-core/keystore/keyStore.js — the stable keyStore contract.
//
// ONE interface, per-platform implementations (see docs/M2.secure-storage.md):
//   - web    (M2a): existing IndexedDB + Argon2id+AES-GCM vault, UNCHANGED,
//                   composed behind this contract in ./web.js.
//   - native (M2b): Capacitor plugin bridging iOS Keychain/Secure Enclave +
//                   Android Keystore/StrongBox, with biometric gating
//                   (Design B — hardware-gated unlock + hardware-backed
//                   at-rest store; same vault FORMAT, no Enclave key-wrap).
//
// The wallet-core crypto (mnemonic/derivation/signing) does NOT change; it just
// receives the secret from whichever store unlocked it. This module is the
// seam: swapping the implementation by platform changes WHERE the key/vault
// lives, never the algorithms.
//
// This file is documentation-only (a JSDoc typedef) so the contract has a
// single, citable definition. It has no runtime behaviour.

/**
 * @typedef {Object} KeyStore
 *
 * @property {() => Promise<boolean>} isSecureHardwareAvailable
 *   Whether a hardware-backed keystore (Secure Enclave / StrongBox) is
 *   available to protect key material. Web: always false. Native (M2b): true
 *   when the device provides one.
 *
 * @property {() => Promise<boolean>} hasVault
 *   Whether an encrypted vault already exists for this device.
 *
 * @property {(secret: string, password: string) => Promise<void>} createVault
 *   Encrypt `secret` under `password` and persist CIPHERTEXT ONLY. The live
 *   secret is never written to storage. (Web: encryptVault + saveVault.)
 *
 * @property {(password: string) => Promise<string>} unlock
 *   Return the live secret for transient in-memory use by the caller. Web:
 *   loadVault + decryptVault (throws on wrong password or missing vault).
 *   Native (M2b): triggers biometric + hardware unwrap before decrypting.
 *
 * @property {(currentPassword: string, newPassword: string) => Promise<void>} changePassword
 *   Re-encrypt the EXISTING vault under a new password WITHOUT changing the
 *   secret it protects (non-custodial "change my vault password" — see
 *   pages/WalletAccessReset.jsx). Decrypt with `currentPassword` (throws the
 *   same generic wrong-password/tamper error as unlock on a mismatch), then
 *   re-encrypt the SAME secret with `newPassword` via the unchanged
 *   encryptVault/decryptVault crypto and persist ciphertext only. The seed is
 *   never changed and never leaves memory; this is purely a re-wrap. As a side
 *   effect it also rewrites at the CURRENT KDF params (so a legacy-params vault
 *   is upgraded on change, like the unlock-time migration). This is NOT a
 *   recovery path — a forgotten password is recovered ONLY by re-importing the
 *   seed (createVault), because we hold no key escrow.
 *
 * @property {() => void} lock
 *   Clear any key material / hardware grant held inside the store. On web the
 *   unlocked secret lives in the caller (WalletProvider), so this is a no-op;
 *   native uses it to drop a biometric grant.
 *
 * @property {() => Promise<void>} clearVault
 *   Remove the stored vault from this device.
 */

export {};
