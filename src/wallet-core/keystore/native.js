// wallet-core/keystore/native.js — the NATIVE KeyStore implementation (M2b).
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ PROVISIONAL — NOT AUDITED-SECURE.                                          │
// │ This module is the native (iOS/Android) branch of the keyStore contract.  │
// │ It changes WHERE the vault lives and HOW unlock is gated — it does NOT     │
// │ touch the audited crypto. The vault format is identical to the audited    │
// │ web path (Argon2id + AES-256-GCM), but the biometric gating layer         │
// │ (iOS Keychain / Android Keystore) has NOT been independently verified    │
// │ on real devices. This must be tested and audited before enabling         │
// │ biometric unlock in production mobile builds.                             │
// │ DEFERRED: pending Android build milestone (return to this after Android   │
// │ testing). See docs/M2.secure-storage.md, "Verification gates".           │
// └─────────────────────────────────────────────────────────────────────────┘
//
// DESIGN B — implemented as HARDWARE-GATED UNLOCK + HARDWARE-BACKED AT-REST
// STORAGE (see docs/M2.secure-storage.md; Design B explicitly permits the
// "or to gate access" interpretation). To be precise about what this is NOT:
// no bespoke Secure Enclave / StrongBox key wraps the vault-encryption key —
// that key is still the Argon2id-derived WebCrypto key from ../vault.js.
// "hardware-backed" here means the plugin's at-rest store (iOS Keychain /
// Android Keystore-backed); "gated" means the biometric/passcode prompt below.
//   - The EXISTING Argon2id+AES-GCM vault FORMAT is reused BYTE-IDENTICALLY.
//     We call the same ../vault.js encryptVault/decryptVault as the web path;
//     no algorithm, parameter, or blob layout changes here.
//   - WHAT CHANGES vs web:
//       1. The ciphertext blob is persisted in the platform's hardware-backed
//          secure store (iOS Keychain / Android Keystore-backed storage) via
//          @aparajita/capacitor-secure-storage, with `ThisDeviceOnly`,
//          passcode-gated accessibility — NEVER in webview IndexedDB/localStorage
//          and NEVER synced to iCloud.
//       2. unlock() is GATED behind a biometric / device-credential prompt
//          (@aparajita/capacitor-biometric-auth) before the blob is read and
//          decrypted. The factors become biometric AND password (strictly
//          stronger than web's password-only).
//   - WHAT DOES NOT CHANGE: the decrypted secret is returned transiently to the
//     caller (WalletProvider) exactly as on web. THIS STORE CACHES NO PLAINTEXT
//     KEY MATERIAL — the only state it holds is plugin config + a lock hook, so
//     "clear in-memory key material on lock/background" is, for this module, a
//     structural guarantee rather than an operation.
//
// IMPORTANT HONESTY ABOUT THE GUARANTEE (audit item):
//   The biometric prompt here is an APP-LAYER gate (authenticate → then read),
//   NOT an OS-enforced biometric ACL bound to the Keychain/Keystore item
//   (kSecAttrAccessControl(biometryCurrentSet) on iOS / setUserAuthentication-
//   Required on a Keystore key on Android). The chosen plugins protect the item
//   with hardware-backed, ThisDeviceOnly, passcode-gated accessibility, but do
//   NOT expose per-item biometric ACL binding. A stronger variant (OS-bound
//   biometric ACL) needs either a plugin that exposes it or a thin custom native
//   plugin — that EXPANDS the audit scope and is deferred (see M2c/M2d + the PR).
//
// This file is loaded ONLY on a real native platform, via dynamic import from
// ./index.js behind Capacitor.isNativePlatform(). It is never imported on web or
// in tests, so the web vault path and the 58-test suite are untouched.

import {
  SecureStorage,
  KeychainAccess,
} from '@aparajita/capacitor-secure-storage';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { App } from '@capacitor/app';
import { encryptVault, decryptVault, deriveKekC, encryptVaultWithDek, decryptVaultWithDek } from '../vault.js';
import { combineKek, randomDek, wrapDek, unwrapDek, KEK_ERR } from './kek.js';
import { clearHardwareCredential, getHardwareFactor } from './hardware.js';

// Single-vault slice, mirroring evm/vaultStore.js's web layout (KEY='primary').
const KEY_PREFIX = 'veyrnox_';
const VAULT_KEY = 'vault_v1';

// Native-only seam: WalletProvider registers its lock() here so that an OS
// background event can drop the LIVE secret (which lives in WalletProvider, not
// in this module). NOT a secret; NOT part of the cross-platform KeyStore type.
let _lockHook = null;

// One-time secure-store configuration + background wiring, awaited by every
// method via init().
let _initPromise = null;
function init() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    await SecureStorage.setKeyPrefix(KEY_PREFIX);
    // iOS: never mirror secrets to iCloud Keychain.
    await SecureStorage.setSynchronize(false);
    // iOS default accessibility for items we write: require a device passcode,
    // never leave this device, never migrate via backup. (Android ignores this;
    // its store is Keystore-backed regardless.)
    await SecureStorage.setDefaultKeychainAccess(
      KeychainAccess.whenPasscodeSetThisDeviceOnly,
    );

    // Background hardening (requirement: clear key material on background):
    // when the OS backgrounds the app, invoke the registered lock hook so the
    // live secret is cleared promptly via a reliable native signal — belt and
    // suspenders alongside WalletProvider's existing `visibilitychange` lock.
    // Best-effort: @capacitor/app may be unavailable in some shells.
    try {
      App.addListener('pause', fireLockHook);
      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) fireLockHook();
      });
    } catch {
      /* non-fatal — WalletProvider's visibilitychange auto-lock still applies. */
    }
  })();
  return _initPromise;
}

// Set to > 0 during biometric-gated operations (enrollKek, changePassword) so that
// the OS biometric sheet — which can trigger an appStateChange pause event — does
// not fire the lock hook mid-operation and navigate the user away. Automatically
// returns to 0 when the operation completes (success or error).
let _lockSuppressDepth = 0;

function fireLockHook() {
  // Calls WalletProvider.lock(), which clears the live secret AND calls back
  // into nativeKeyStore.lock(). Guard against a missing hook (not yet wired).
  // Suppressed during biometric-gated non-unlock operations (see _lockSuppressDepth).
  if (_lockSuppressDepth > 0) return;
  if (typeof _lockHook === 'function') _lockHook();
}

// Wrap a biometric-gated non-unlock operation so the lock hook is suppressed
// while it is in flight. Safe: the operation itself requires biometric auth,
// so the user already proved presence at the start of the call.
async function withLockSuppressed(fn) {
  _lockSuppressDepth++;
  try {
    return await fn();
  } finally {
    _lockSuppressDepth--;
  }
}

// Prompt for biometric auth (with a deliberate device-credential fallback).
// Throws BiometryError on user cancel / failure / lockout — propagated so the
// unlock UI can surface it, exactly like a wrong-password throw on web.
async function authenticateOrThrow() {
  const info = await BiometricAuth.checkBiometry();

  // No device security at all → a hardware-gated vault cannot have been created
  // (we require a passcode), and there is nothing to authenticate against.
  if (!info.isAvailable && !info.deviceIsSecure) {
    throw new Error(
      'This device has no passcode or biometrics set; cannot unlock the hardware-backed vault',
    );
  }

  const reason = 'Unlock your VEYRNOX wallet';
  if (info.isAvailable) {
    // Primary: strong biometrics, no silent passcode fallback — require an
    // explicit biometric match (per-use auth is the strongest policy).
    try {
      await BiometricAuth.authenticate({
        reason,
        cancelTitle: 'Cancel',
        androidTitle: 'VEYRNOX',
        androidSubtitle: 'Unlock your wallet',
        allowDeviceCredential: false,
      });
      return;
    } catch (err) {
      // On lockout (too many failed biometric attempts) fall back ONCE to the
      // device credential (PIN/passcode/pattern) — the deliberate passcode
      // fallback policy called out in the spec.
      if (err && err.code === 'biometryLockout') {
        await BiometricAuth.authenticate({ reason, allowDeviceCredential: true });
        return;
      }
      throw err;
    }
  }

  // Biometrics not enrolled but the device IS secured → deliberate fallback to
  // the device credential (passcode), so the vault is still reachable.
  await BiometricAuth.authenticate({ reason, allowDeviceCredential: true });
}

/** @type {import('./keyStore.js').KeyStore} */
export const nativeKeyStore = {
  // True when a device credential (passcode/biometrics) is set, which is the
  // precondition for the OS to hardware-protect the stored item (Secure Enclave-
  // wrapped Keychain on iOS; Keystore-backed storage on Android). NOTE: this is a
  // proxy — these plugins do not expose a direct StrongBox/Enclave probe, so we
  // cannot assert StrongBox specifically. Treated as an audit/device-test item.
  async isSecureHardwareAvailable() {
    try {
      const info = await BiometricAuth.checkBiometry();
      return !!info.deviceIsSecure;
    } catch {
      return false;
    }
  },

  // Presence check only — reads metadata, never the secret, and does NOT prompt
  // for biometrics (passcode-gated accessibility needs only an unlocked device).
  async hasVault() {
    await init();
    const raw = await SecureStorage.get(VAULT_KEY, false);
    return raw !== null && raw !== undefined;
  },

  // Encrypt with the SAME audited crypto as web, then persist CIPHERTEXT ONLY to
  // the hardware-backed secure store. The live secret never touches IndexedDB/
  // localStorage and is not retained here after this call returns.
  async createVault(secret, password) {
    await init();
    const blob = await encryptVault(secret, password); // ../vault.js — unchanged
    // Store as a JSON string; convertDate=false on read avoids any date coercion
    // of base64 fields. The blob is { v, kdf, salt, iv, ct } — all ciphertext.
    await SecureStorage.set(VAULT_KEY, JSON.stringify(blob));
  },

  // Unlock: read + decrypt. The password/PIN is THE secret; the vault is hardware-
  // protected AT REST (passcode-gated Keychain). Biometric is a CONVENIENCE gate the
  // user OPTS INTO — so it is only required when the caller (WalletProvider) asks for
  // it via opts.requireBiometric, set from isBiometricUnlockEnabled(). This keeps the
  // native path consistent with the documented model ("the password always works as
  // the fallback") instead of forcing a biometric on EVERY unlock, and prevents a
  // biometric cancel/failure (e.g. an unenrolled simulator falling back to the device
  // passcode, then cancel) from being misread by the caller's deniability path as a
  // wrong password and silently opening the empty decoy. The secret is returned
  // transiently to the caller; nothing secret is cached here.
  async unlock(password, opts = {}) {
    await init();
    // Always suppress the lock hook for the duration of unlock — the OS
    // appStateChange pause event fires when a biometric sheet opens (both the
    // standard requireBiometric gate and the KEK getHardwareFactor prompt),
    // which would otherwise navigate the user back to the PIN pad before unlock
    // completes. Safe: the user initiated unlock; lock is restored immediately
    // when this call exits (success or error).
    return withLockSuppressed(() => this._unlockInner(password, opts));
  },

  async _unlockInner(password, opts = {}) {
    const raw = await SecureStorage.get(VAULT_KEY, false);
    if (raw === null || raw === undefined) {
      throw new Error('No wallet found on this device');
    }
    const blob = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (blob.kekWrap) {
      // KEK-enrolled vault: hardware factor H (via biometric) + PIN-derived C required (I4).
      // getHardwareFactor() already presents the biometric prompt via Android Keystore,
      // so authenticateOrThrow() is intentionally skipped here to avoid a double prompt.
      const getHF = opts && opts.getHardwareFactor;
      if (typeof getHF !== 'function') throw new Error(KEK_ERR.NO_HARDWARE_FACTOR);
      const H = await getHF(); // biometric prompt from HardwareKekPlugin (Android Keystore)
      const saltBytes = Uint8Array.from(atob(blob.kekSalt), c => c.charCodeAt(0));
      const C = await deriveKekC(password, saltBytes);
      const kek = await combineKek(H, C);
      const dek = await unwrapDek(kek, blob.kekWrap); // throws KEK_ERR.UNWRAP_FAILED on wrong PIN/device
      return decryptVaultWithDek(blob, dek);
    }

    // Non-KEK vault: apply biometric gate if requested (e.g. Biometric Unlock setting).
    if (opts.requireBiometric) {
      try {
        await authenticateOrThrow(); // throws on cancel/failure/lockout
      } catch (err) {
        // TAG the biometric failure so the caller FAILS CLOSED (clear biometric
        // error + password escape hatch) rather than treating it like a wrong
        // password and consulting the deniability path.
        if (err && typeof err === 'object') err.veyrnoxBiometricGate = true;
        throw err;
      }
    }

    return decryptVault(blob, password);
  },

  // Re-encrypt the EXISTING vault under a new password, keeping the SAME secret
  // (non-custodial "change my vault password"). Mirrors web.js exactly over the
  // same unchanged ../vault.js crypto — only WHERE the blob lives differs. We
  // GATE this behind the biometric/device-credential prompt (same as unlock),
  // since it both reads and rewrites the at-rest secret; then decrypt with the
  // current password (throws the generic error on a mismatch, changing nothing)
  // and persist the re-encrypted blob. The secret never leaves memory.
  async changePassword(currentPassword, newPassword, opts = {}) {
    await init();
    await authenticateOrThrow(); // throws on cancel/failure/lockout

    const raw = await SecureStorage.get(VAULT_KEY, false);
    if (raw === null || raw === undefined) {
      throw new Error('No wallet found on this device');
    }
    const blob = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (blob.kekWrap) {
      // KEK-enrolled: rotate the PIN by re-wrapping the DEK under a new KEK.
      // The seed ciphertext (blob.ct) stays UNCHANGED — that is the §3 property.
      const getHF = opts && opts.getHardwareFactor;
      if (typeof getHF !== 'function') throw new Error(KEK_ERR.NO_HARDWARE_FACTOR);
      const oldSaltBytes = Uint8Array.from(atob(blob.kekSalt), c => c.charCodeAt(0));
      const H = await getHF();
      const oldC = await deriveKekC(currentPassword, oldSaltBytes);
      const oldKek = await combineKek(H, oldC);
      const dek = await unwrapDek(oldKek, blob.kekWrap); // throws if wrong PIN/device
      // Re-wrap the SAME DEK under a new KEK derived from the new PIN + fresh salt.
      const newSaltBytes = crypto.getRandomValues(new Uint8Array(32));
      const newKekSalt = btoa(String.fromCharCode(...newSaltBytes));
      const newC = await deriveKekC(newPassword, newSaltBytes);
      const newKek = await combineKek(H, newC);
      const newKekWrap = await wrapDek(newKek, dek);
      await SecureStorage.set(VAULT_KEY, JSON.stringify({ ...blob, kekWrap: newKekWrap, kekSalt: newKekSalt }));
      return;
    }

    const secret = await decryptVault(blob, currentPassword); // ../vault.js — unchanged
    const rewrapped = await encryptVault(secret, newPassword); // ../vault.js — unchanged
    await SecureStorage.set(VAULT_KEY, JSON.stringify(rewrapped));
  },

  // Enroll the Hardware KEK on an existing vault. After enrollment, unlock()
  // and changePassword() require BOTH the hardware factor H (via opts.getHardwareFactor)
  // and the correct PIN. Fail-closed (I4): missing hardware factor → explicit throw.
  // Gates behind the biometric prompt so the operation itself is authenticated.
  async enrollKek(password, opts) {
    await init();
    return withLockSuppressed(async () => {
      await authenticateOrThrow();
      const getHF = opts && opts.getHardwareFactor;
      if (typeof getHF !== 'function') throw new Error(KEK_ERR.NO_HARDWARE_FACTOR);
      const raw = await SecureStorage.get(VAULT_KEY, false);
      if (raw === null || raw === undefined) throw new Error('No wallet found on this device');
      const blob = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const secret = await decryptVault(blob, password); // verify password and recover seed

      const H = await getHF();
      const saltBytes = crypto.getRandomValues(new Uint8Array(32));
      const kekSalt = btoa(String.fromCharCode(...saltBytes));
      const C = await deriveKekC(password, saltBytes);
      const kek = await combineKek(H, C);
      const dek = randomDek();
      const kekWrap = await wrapDek(kek, dek);
      // Re-encrypt seed under the DEK so PIN rotation doesn't change the seed CT (§3).
      const { iv, ct } = await encryptVaultWithDek(secret, dek);
      await SecureStorage.set(VAULT_KEY, JSON.stringify({ ...blob, iv, ct, kdf: 'kek-dek', kekWrap, kekSalt }));
    });
  },

  // Remove the Hardware KEK from an existing vault, converting it back to bare
  // (PIN-only) format. Requires biometric (via getHardwareFactor) + correct PIN.
  // Fail-closed (I4): key material is re-wrapped BEFORE the Keystore key is deleted;
  // if re-wrap fails, the original vault is untouched and the Keystore key is kept.
  async unenrollKek(password, opts) {
    await init();
    return withLockSuppressed(async () => {
      const getHF = opts && opts.getHardwareFactor;
      if (typeof getHF !== 'function') throw new Error(KEK_ERR.NO_HARDWARE_FACTOR);
      const raw = await SecureStorage.get(VAULT_KEY, false);
      if (!raw) throw new Error('No wallet found on this device');
      const blob = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!blob.kekWrap) return; // already bare — nothing to do

      // Recover DEK: H (hardware factor, biometric) + PIN-derived C
      const H = await getHF();
      const saltBytes = Uint8Array.from(atob(blob.kekSalt), c => c.charCodeAt(0));
      const C = await deriveKekC(password, saltBytes);
      const kek = await combineKek(H, C);
      const dek = await unwrapDek(kek, blob.kekWrap); // throws KEK_ERR.UNWRAP_FAILED on wrong PIN/device

      // Decrypt the seed using the recovered DEK
      const secret = await decryptVaultWithDek(blob, dek);

      // Re-encrypt in bare (PIN-only) format — no kekWrap, no kekSalt
      const bareBlob = await encryptVault(secret, password);
      await SecureStorage.set(VAULT_KEY, JSON.stringify(bareBlob));

      // Only delete the Keystore key AFTER the vault is safely re-written
      await clearHardwareCredential();
    });
  },

  // Drop any in-memory grant. This store caches NO plaintext key material (the
  // live secret lives in, and is cleared by, WalletProvider), so today this is a
  // structural no-op — it is the defined seam where a future OS biometric-grant
  // handle would be dropped. Synchronous to match the interface and
  // WalletProvider's unawaited call site.
  lock() {
    /* no cached secret/grant to clear in this module — see header */
  },

  // Remove the stored vault and the hardware KEK credential (if any) from the
  // hardware-backed store. Both must be cleared together so a re-import starts
  // fresh and does not inherit a stale credential ID.
  async clearVault() {
    await init();
    await SecureStorage.remove(VAULT_KEY);
    await clearHardwareCredential();
  },

  // NATIVE-ONLY: deliver the hardware factor H for an enrolled vault. Exposed so
  // WalletProvider can pass it to unlock() without importing hardware.js directly.
  getHardwareFactor,

  // NATIVE-ONLY extension (not on the cross-platform KeyStore type): let the app
  // register the function to run when the OS backgrounds the app, so the live
  // secret can be cleared via a reliable native event. Web's keyStore has no
  // such method, so WalletProvider calls it optionally (`?.`) and web is a no-op.
  setLockHook(cb) {
    _lockHook = typeof cb === 'function' ? cb : null;
    // Registering the hook (WalletProvider mount) means the app is live and
    // wants background protection — ensure the App pause listeners are wired
    // even before the first storage call. Fire-and-forget; safe to call repeatedly.
    if (_lockHook) init();
  },
};
