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
// DESIGN B — implemented as PASSCODE/BIOMETRIC-GATED UNLOCK + PLATFORM-SECURE-
// STORE AT-REST STORAGE (iOS Keychain, passcode-gated; Android Keystore) — NOT a
// Secure Enclave / StrongBox key-wrap (see docs/M2.secure-storage.md; Design B
// explicitly permits the "or to gate access" interpretation). To be precise about
// what this is NOT: no bespoke Secure Enclave / StrongBox key wraps the
// vault-encryption key — that key is still the Argon2id-derived WebCrypto key
// from ../vault.js. "platform secure store" here means the plugin's at-rest store
// (iOS Keychain / Android Keystore); "gated" means the biometric/passcode prompt below.
//   - The EXISTING Argon2id+AES-GCM vault FORMAT is reused BYTE-IDENTICALLY.
//     We call the same ../vault.js encryptVault/decryptVault as the web path;
//     no algorithm, parameter, or blob layout changes here.
//   - WHAT CHANGES vs web:
//       1. The ciphertext blob is persisted in the platform secure store
//          (iOS Keychain / Android Keystore) via
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
//   with platform secure store (iOS Keychain / Android Keystore), ThisDeviceOnly, passcode-gated accessibility, but do
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
// LEGACY journal key from a now-removed journaled safe-write (commit 69ea07f). The
// journal is gone; we only ever DELETE any leftover value under this key so a stale
// blob from a prior build can never be promoted over the good vault. NEVER read for
// content, NEVER written.
const VAULT_NEXT_KEY = 'vault_v1.next';

// ── Durable verified vault write (I4 fail-closed) ────────────────────────────────
//
// ROOT CAUSE (fixed at the plugin layer): @aparajita/capacitor-secure-storage used
// SharedPreferences.apply() (async) on Android, so writes could be lost on app-kill.
// That is now patched to .commit() (synchronous, durable), device-verified.
//
// So the write is simply: set → read back → verify byte-equal → throw on mismatch.
// NO temp/journal key, NO recovery, NO promote. A genuine write failure must never
// look like success (I4): if the persisted value does not match, we throw and the
// caller fails closed.
async function safeWriteVault(blob) {
  const data = typeof blob === 'string' ? blob : JSON.stringify(blob);

  await SecureStorage.set(VAULT_KEY, data);

  // Read back the durably-persisted value and verify byte-equality (fail-closed).
  const persisted = await SecureStorage.get(VAULT_KEY, false);
  if ((typeof persisted === 'string' ? persisted : JSON.stringify(persisted)) !== data) {
    throw new Error('VAULT_WRITE_VERIFY_FAILED');
  }
}

// Best-effort removal of any leftover legacy journal key so a stale blob from an
// earlier build can never linger and mislead a load path. Never throws, never
// promotes — purely destructive cleanup. Run once on init.
async function cleanupLegacyJournal() {
  try {
    await SecureStorage.remove(VAULT_NEXT_KEY);
  } catch {
    /* best-effort — a missing key or plugin quirk must not break init. */
  }
}

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

    // One-time cleanup: drop any leftover legacy journal key (vault_v1.next) from a
    // prior build so a stale blob can never be promoted over the good vault.
    await cleanupLegacyJournal();

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
      'This device has no passcode or biometrics set; cannot unlock the secure-store vault',
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

async function _unlockInner(password, opts = {}) {
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
    let C;
    let kek;
    let dek;
    // H-NEW-6b: wrap the KEK + DEK lifetime in try/finally so H, C, the derived KEK,
    // and the recovered DEK are wiped on EVERY path, including when unwrapDek throws
    // (wrong PIN/device). None may linger in the JS heap until GC (I4), mirroring web.js.
    try {
      C = await deriveKekC(password, saltBytes);
      kek = await combineKek(H, C);
      // combineKek zeroes H/C internally; wipe again at the call site so the guarantee
      // survives any refactor of combineKek (defense in depth, I4).
      if (H && H.fill) H.fill(0);
      if (C) C.fill(0);
      dek = await unwrapDek(kek, blob.kekWrap); // throws KEK_ERR.UNWRAP_FAILED on wrong PIN/device
      return await decryptVaultWithDek(blob, dek);
    } finally {
      if (H && H.fill) H.fill(0);
      if (C) C.fill(0);
      if (kek) kek.fill(0);
      if (dek) dek.fill(0);
      saltBytes.fill(0);
    }
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
}

// Narrow-scope export: only file-picker call sites (backup save / restore open)
// use this to suppress the pause-driven lock while a native picker Activity is
// foregrounded. See keystore/index.js for the cross-platform facade.
export { withLockSuppressed };

/** @type {import('./keyStore.js').KeyStore} */
export const nativeKeyStore = {
  // True when a device credential (passcode/biometrics) is set, which is the
  // precondition for the OS to protect the stored item (passcode-gated Keychain
  // on iOS (NOT Secure-Enclave-wrapped — see header, H14); Keystore-backed
  // storage on Android). NOTE: this is a proxy — these plugins do not expose a
  // direct StrongBox/Enclave probe, so we cannot assert StrongBox specifically.
  // Treated as an audit/device-test item.
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

  // Reconciliation accessor (I4 honest enrolled-state): reports whether the
  // stored vault is actually KEK-wrapped. Reads metadata ONLY — never the secret,
  // never a biometric prompt (passcode-gated read of the vault blob). The badge
  // treats "hardware enrolled" as aliasPresent AND vaultKekWrapPresent; if the
  // AndroidKeyStore alias is present but the vault is bare, the honest state is
  // OFF (a stale alias is not real protection).
  async hasVaultKekWrap() {
    await init();
    const raw = await SecureStorage.get(VAULT_KEY, false);
    if (raw === null || raw === undefined) return false;
    const blob = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return !!blob.kekWrap;
  },

  // Encrypt with the SAME audited crypto as web, then persist CIPHERTEXT ONLY to
  // the platform secure store (iOS Keychain / Android Keystore). The live secret never touches IndexedDB/
  // localStorage and is not retained here after this call returns.
  async createVault(secret, password) {
    await init();
    const blob = await encryptVault(secret, password); // ../vault.js — unchanged
    // Store as a JSON string; convertDate=false on read avoids any date coercion
    // of base64 fields. The blob is { v, kdf, salt, iv, ct } — all ciphertext.
    // Routed through safeWriteVault for durable set + read-back-verify (I4).
    await safeWriteVault(blob);
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
    return withLockSuppressed(() => _unlockInner(password, opts));
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
      const H2 = H.slice(); // combineKek zeroes its H input; copy before the first call
      let oldC;
      let newC;
      let oldKek;
      let newKek;
      let dek;
      // H-NEW-6b: wrap the WHOLE key-material lifetime in try/finally so the H2 copy,
      // both derived KEKs, and the recovered DEK are wiped on EVERY path — including
      // when deriveKekC/combineKek/unwrapDek/wrapDek/set throws. None may linger in
      // the JS heap until GC (I4), mirroring web.js.
      try {
        oldC = await deriveKekC(currentPassword, oldSaltBytes);
        oldKek = await combineKek(H, oldC);
        if (H && H.fill) H.fill(0);
        if (oldC) oldC.fill(0);
        dek = await unwrapDek(oldKek, blob.kekWrap); // throws if wrong PIN/device
        // Re-wrap the SAME DEK under a new KEK derived from the new PIN + fresh salt.
        const newSaltBytes = crypto.getRandomValues(new Uint8Array(32));
        const newKekSalt = btoa(String.fromCharCode(...newSaltBytes));
        newC = await deriveKekC(newPassword, newSaltBytes);
        newKek = await combineKek(H2, newC);
        if (H2 && H2.fill) H2.fill(0);
        if (newC) newC.fill(0);
        const newKekWrap = await wrapDek(newKek, dek);
        newSaltBytes.fill(0);
        await safeWriteVault({ ...blob, kekWrap: newKekWrap, kekSalt: newKekSalt });
      } finally {
        if (H && H.fill) H.fill(0);
        if (H2 && H2.fill) H2.fill(0);
        if (oldC) oldC.fill(0);
        if (newC) newC.fill(0);
        if (oldKek) oldKek.fill(0);
        if (newKek) newKek.fill(0);
        if (dek) dek.fill(0);
        oldSaltBytes.fill(0);
      }
      return;
    }

    const secret = await decryptVault(blob, currentPassword); // ../vault.js — unchanged
    const rewrapped = await encryptVault(secret, newPassword); // ../vault.js — unchanged
    await safeWriteVault(rewrapped);
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
      let C;
      let kek;
      const dek = randomDek();
      // H-NEW-6b: wrap the entire KEK + DEK lifetime in try/finally so H, C, the
      // derived KEK, and the DEK are wiped even if combineKek/wrapDek/encryptVaultWithDek
      // throws — never leave plaintext key material in the JS heap until GC (I4).
      try {
        C = await deriveKekC(password, saltBytes);
        kek = await combineKek(H, C);
        if (H && H.fill) H.fill(0);
        if (C) C.fill(0);
        const kekWrap = await wrapDek(kek, dek);
        // Re-encrypt seed under the DEK so PIN rotation doesn't change the seed CT (§3).
        const { iv, ct } = await encryptVaultWithDek(secret, dek);
        await safeWriteVault({ ...blob, iv, ct, kdf: 'kek-dek', kekWrap, kekSalt });
      } finally {
        if (H && H.fill) H.fill(0);
        if (C) C.fill(0);
        if (kek) kek.fill(0);
        dek.fill(0);
        saltBytes.fill(0);
      }
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
      if (!blob.kekWrap) {
        // Already-bare vault: no key material to re-wrap, but a stale Keystore
        // alias may survive from a prior partial/interrupted unenroll. Clearing
        // it here is what makes isHardwareEnrolled() honest — otherwise the "ON"
        // badge sticks with no way to turn it off (I4 fail-honest, fail-closed).
        // Idempotent: clearCredential guards on containsAlias, so a no-op when
        // no key exists. A bare vault needs no hardware key.
        await clearHardwareCredential();
        return;
      }

      // Recover DEK: H (hardware factor, biometric) + PIN-derived C
      const H = await getHF();
      const saltBytes = Uint8Array.from(atob(blob.kekSalt), c => c.charCodeAt(0));
      let C;
      let kek;
      let dek;
      // H-NEW-6b: wrap the KEK + DEK lifetime in try/finally so H, C, the derived KEK,
      // and the recovered DEK are wiped on EVERY path — including when unwrapDek throws
      // (wrong PIN/device). None may linger in the JS heap until GC (I4).
      try {
        C = await deriveKekC(password, saltBytes);
        kek = await combineKek(H, C);
        if (H && H.fill) H.fill(0);
        if (C) C.fill(0);
        dek = await unwrapDek(kek, blob.kekWrap); // throws KEK_ERR.UNWRAP_FAILED on wrong PIN/device

        // Decrypt the seed using the recovered DEK
        const secret = await decryptVaultWithDek(blob, dek);

        // Re-encrypt in bare (PIN-only) format — no kekWrap, no kekSalt
        const bareBlob = await encryptVault(secret, password);
        await safeWriteVault(bareBlob);

        // Only delete the Keystore key AFTER the vault is safely re-written
        await clearHardwareCredential();
      } finally {
        if (H && H.fill) H.fill(0);
        if (C) C.fill(0);
        if (kek) kek.fill(0);
        if (dek) dek.fill(0);
        saltBytes.fill(0);
      }
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
  // platform secure store (iOS Keychain / Android Keystore). Both must be cleared together so a re-import starts
  // fresh and does not inherit a stale credential ID.
  async clearVault() {
    await init();
    await SecureStorage.remove(VAULT_KEY);
    // Also drop any leftover legacy journal key so a re-import starts truly fresh.
    await SecureStorage.remove(VAULT_NEXT_KEY);
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

  // NATIVE-ONLY: suppress the background-lock hook for the duration of `fn`.
  // Used by verifyBiometric2fa and other OS-dialog callers that briefly pause
  // the app without wanting to trigger lock() mid-operation.
  suppressLock: withLockSuppressed,
};
