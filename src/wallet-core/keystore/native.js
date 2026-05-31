// wallet-core/keystore/native.js — the NATIVE KeyStore implementation (M2b).
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ PROVISIONAL — NOT AUDITED-SECURE.                                          │
// │ This module is the native (iOS/Android) branch of the keyStore contract.  │
// │ It changes WHERE the vault lives and HOW unlock is gated — it does NOT     │
// │ touch the audited crypto. It is pending independent security audit and    │
// │ on-device verification (see docs/M2.secure-storage.md, "Verification      │
// │ gates"). Do not treat as secure on the strength of this code alone.        │
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
import { encryptVault, decryptVault } from '../vault.js';

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

function fireLockHook() {
  // Calls WalletProvider.lock(), which clears the live secret AND calls back
  // into nativeKeyStore.lock(). Guard against a missing hook (not yet wired).
  if (typeof _lockHook === 'function') _lockHook();
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

  const reason = 'Unlock your Veyrnox wallet';
  if (info.isAvailable) {
    // Primary: strong biometrics, no silent passcode fallback — require an
    // explicit biometric match (per-use auth is the strongest policy).
    try {
      await BiometricAuth.authenticate({
        reason,
        cancelTitle: 'Cancel',
        androidTitle: 'Veyrnox',
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

  // Biometric-gated unlock: authenticate FIRST, then read + decrypt. The secret
  // is returned transiently to the caller; nothing secret is cached here.
  async unlock(password) {
    await init();
    await authenticateOrThrow(); // throws on cancel/failure/lockout

    const raw = await SecureStorage.get(VAULT_KEY, false);
    if (raw === null || raw === undefined) {
      // Match the web path's message for parity.
      throw new Error('No wallet found on this device');
    }
    const blob = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // ../vault.js — unchanged; throws on wrong password or tampered blob.
    return decryptVault(blob, password);
  },

  // Drop any in-memory grant. This store caches NO plaintext key material (the
  // live secret lives in, and is cleared by, WalletProvider), so today this is a
  // structural no-op — it is the defined seam where a future OS biometric-grant
  // handle would be dropped. Synchronous to match the interface and
  // WalletProvider's unawaited call site.
  lock() {
    /* no cached secret/grant to clear in this module — see header */
  },

  // Remove the stored vault from the hardware-backed store.
  async clearVault() {
    await init();
    await SecureStorage.remove(VAULT_KEY);
  },

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
