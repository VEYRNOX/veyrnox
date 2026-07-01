// wallet-core/keystore/keyStore.js — the stable keyStore contract.
//
// ONE interface, per-platform implementations (see docs/M2.secure-storage.md):
//   - web    (M2a): existing IndexedDB + Argon2id+AES-GCM vault, UNCHANGED,
//                   composed behind this contract in ./web.js.
//   - native (M2b): Capacitor plugin bridging the iOS Keychain (passcode-gated)
//                   + Android Keystore, with biometric gating
//                   (Design B — passcode/biometric-gated unlock + platform
//                   secure-store at-rest store; same vault FORMAT, no Enclave
//                   key-wrap).
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
 *   Whether the device has a passcode/biometric-gated platform keystore
 *   available. NOTE: this is a proxy check (passcode present) — it does NOT
 *   probe for an actual Secure Enclave / StrongBox-bound key. Web: always
 *   false. Native (M2b): true when the device has a credential set.
 *
 * @property {() => Promise<boolean>} [isHardwareKeystoreAvailable]
 *   Probe for hardware factor (PRF) availability for KEK enrollment. Web:
 *   returns true if WebAuthn PRF is supported (Chrome, Firefox, Edge); false
 *   on Safari and older browsers. Native: currently unused (Phase 2).
 *
 * @property {() => Promise<boolean>} hasVault
 *   Whether an encrypted vault already exists for this device.
 *
 * @property {(secret: string, password: string) => Promise<void>} createVault
 *   Encrypt `secret` under `password` and persist CIPHERTEXT ONLY. The live
 *   secret is never written to storage. (Web: encryptVault + saveVault.)
 *
 * @property {(secret: string, password: string, opts?: { getHardwareFactor?: () => Promise<Uint8Array> }) => Promise<void>} saveVaultContents
 *   Re-persist NEW vault CONTENT (a mutated container) PRESERVING the current
 *   at-rest format. Web: always a bare argon2id write (no KEK at rest), identical
 *   to createVault. Native: if the stored vault is KEK-wrapped, re-encrypts the
 *   new plaintext under the EXISTING DEK (recovered via opts.getHardwareFactor +
 *   PIN) and preserves kekWrap/kekSalt — it does NOT downgrade to bare. On an
 *   enrolled vault a missing hardware factor or failed DEK recovery THROWS (I4:
 *   never a silent bare downgrade). A bare vault writes bare and never prompts.
 *
 * @property {(password: string, opts?: { requireBiometric?: boolean, getHardwareFactor?: () => Promise<Uint8Array> }) => Promise<string>} unlock
 *   Return the live secret for transient in-memory use by the caller. Web:
 *   loadVault + decryptVault (throws on wrong password or missing vault).
 *   Native (M2b): hardware unwrap + decrypt; presents the OS biometric prompt
 *   ONLY when opts.requireBiometric is set (the caller passes
 *   isBiometricUnlockEnabled()), so a wallet without biometric unlock is
 *   PIN/password-only. When a vault is KEK-enrolled, opts.getHardwareFactor
 *   is required and must supply the 32-byte PRF output (fails closed without it).
 *
 * @property {(currentPassword: string, newPassword: string, opts?: { getHardwareFactor?: () => Promise<Uint8Array> }) => Promise<void>} changePassword
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
 *
 * @property {(cb: (() => void) | null) => void} [setLockHook]
 *   NATIVE-ONLY (optional): register a callback fired when the OS backgrounds
 *   the app, so the live secret can be cleared on a reliable native event. Web
 *   has no equivalent, so callers invoke it optionally (`?.`) and web is a no-op.
 *
 * @property {() => Promise<Uint8Array>} [getHardwareFactor]
 *   Retrieve a 32-byte hardware factor H from the platform. Web: returns PRF
 *   output via WebAuthn (Chrome/Firefox/Edge); throws on Safari. Native:
 *   TARGET/Phase 2 (Secure Enclave on iOS, StrongBox on Android). Never
 *   fabricates H (I4); throws if unavailable or user cancels.
 *
 * @property {(password: string, opts: { getHardwareFactor: () => Promise<Uint8Array> }) => Promise<void>} [enrollKek]
 *   OPTIONAL: enroll the Hardware KEK on a bare vault. After enrollment, unlock
 *   and changePassword require the hardware factor in addition to the password.
 *   Fails closed (I4): missing hardware factor → explicit error, never silent fallback.
 *
 * @property {(password: string, opts: { getHardwareFactor: () => Promise<Uint8Array> }) => Promise<void>} [unenrollKek]
 *   OPTIONAL (NATIVE-ONLY): re-wrap vault to bare format then delete the hardware
 *   key. Fail-closed: vault re-wrapped BEFORE key deletion; if re-wrap fails the
 *   key survives and vault remains accessible.
 *
 * @property {<T>(fn: () => Promise<T>) => Promise<T>} [suppressLock]
 *   NATIVE-ONLY (optional): run `fn` with the background-lock hook suppressed,
 *   so OS-level dialogs that briefly pause the app do not trigger a re-lock.
 *   Web has no equivalent; callers invoke it optionally (`?.`).
 */

export {};
