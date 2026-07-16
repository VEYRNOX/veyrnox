// @ts-nocheck
// wallet-core/keystore/native.js — the NATIVE KeyStore implementation (M2b).
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ PROVISIONAL — NOT AUDITED-SECURE.                                          │
// │ This module is the native (iOS/Android) branch of the keyStore contract.  │
// │ It changes WHERE the vault lives and HOW unlock is gated — it does NOT     │
// │ touch the audited crypto. The vault format is identical to the audited    │
// │ web path (Argon2id + AES-256-GCM).                                        │
// │                                                                           │
// │ Device verification status (INTERNAL, not independent):                  │
// │   Android — end-to-end device-verified on Pixel 10 Pro XL (PRs #497/    │
// │             #499/#568; C-1 v3 salt-binding confirmed on-device).         │
// │   iOS     — device-verified PARTIAL: KEK-gated Sepolia txids confirmed   │
// │             (PR #495); SE-unlock trace closed (iOS-F9, 2026-07-02);      │
// │             biometric re-enroll invalidation test deferred (iOS-F11).    │
// │                                                                           │
// │ What remains outstanding is the INDEPENDENT THIRD-PARTY audit. Until     │
// │ that audit is complete this module must not be presented as              │
// │ independently audited-secure. See docs/M2.secure-storage.md and         │
// │ docs/audit-2026-07-01-kek-internal.md.                                  │
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
import { combineKek, randomDek, wrapDek, unwrapDek, KEK_ERR, decodeKekSalt, parseVaultBlob } from './kek.js';
import { clearHardwareCredential, getHardwareFactor } from './hardware.js';
// ── M2c (Secure Enclave key-wrap) — F-2 closure scaffold ─────────────────────
// Lazy-loaded so that registerPlugin() in veyrnoxEnclave.js does NOT execute at
// module-load time. Tests that import native.js directly mock @capacitor/core
// without registerPlugin; a top-level import would throw there. All M2c
// call-sites are async, so a one-time lazy getter is transparent.
let _enclavePlugin = null;
async function enclavePlugin() {
  if (!_enclavePlugin) _enclavePlugin = await import('../../plugins/veyrnoxEnclave.js');
  return _enclavePlugin;
}
// PROVISIONAL — NOT AUDITED-SECURE, NOT DEVICE-VERIFIED. The hardware-wrap path
// is capability-detected AND gated behind M2C_HARDWARE_WRAP_ENABLED, which stays
// FALSE until M2c-2 verifies the Enclave path on a physical iPhone (key-gen,
// Face/Touch prompt on unwrap, biometryCurrentSet invalidation) and the product
// decision on mandatory-biometric-on-Enclave devices is signed off. While false,
// native behaviour is byte-identical to M2b (fallback path only), so the iOS
// Simulator and the test suite are unaffected. See docs/M2cd.native-acl-plan.md.
const M2C_HARDWARE_WRAP_ENABLED = false;

// Stored-record marker. An Enclave-wrapped record is { wrap:'enclave-v1', hw }.
const WRAP_VERSION_ENCLAVE = 'enclave-v1';

async function useHardwareWrap() {
  if (!M2C_HARDWARE_WRAP_ENABLED) return false;
  try {
    const { isHardwareKeyAvailable } = await enclavePlugin();
    const { backing, biometryEnrolled } = await isHardwareKeyAvailable();
    return backing === 'secureEnclave' && biometryEnrolled === true;
  } catch {
    return false;
  }
}

function base64FromUtf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function utf8FromBase64(b64) {
  return decodeURIComponent(escape(atob(b64)));
}

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
      // whenPasscodeSetThisDeviceOnly requires securityd to verify a passcode is SET —
      // fails with errSecNotAvailable (-25291) on palera1n (jailbreak patches securityd).
      // whenUnlockedThisDeviceOnly keeps the ThisDeviceOnly property (no iCloud/backup
      // migration) and unlocks only when the device is unlocked, without the passcode check.
      KeychainAccess.whenUnlockedThisDeviceOnly,
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

// Wrap a getHardwareFactor() call so that a biometric-lockout-shaped failure engages
// the app-layer authenticateOrThrow() FALLBACK (which itself falls back from biometric
// to device credential — the H16-DEVIATION path) and retries getHF once. Any other
// failure (USER_CANCELLED, KEY_PERMANENTLY_INVALIDATED, arbitrary bridge throws)
// propagates unchanged — the fallback branch is narrow (I4 fail-closed).
//
// WHY THE NARROW CODE MATCH: hardware.js:236 masks BiometricPrompt.ERROR_LOCKOUT /
// ERROR_LOCKOUT_PERMANENT, "no biometric enrolled", "HW unavailable" and unknown-cause
// hardware-side failures ALL to KEK_ERR.NO_HARDWARE_FACTOR. For each of these the OS
// path forward is "authenticate against device credential" — exactly what
// authenticateOrThrow's allowDeviceCredential:true branch does. USER_CANCELLED /
// KEY_PERMANENTLY_INVALIDATED / degenerate-H each carry their own stable code and
// MUST NOT be retried (user cancelled deliberately; key is destroyed; H is invalid).
//
// The retry runs getHF with the SAME opts (same kekSalt). authenticateOrThrow's
// device-credential auth resets the biometric lockout counter on Android, so the
// retry can succeed. If it fails again, the second error propagates without a
// second fallback (no infinite loop). The SE/StrongBox key ACL still enforces
// biometric at the OS level — the app-layer PIN fallback does NOT weaken it (H16).
async function getHardwareFactorWithLockoutFallback(getHF, hfOpts) {
  try {
    return await getHF(hfOpts);
  } catch (err) {
    if (!err || err.code !== KEK_ERR.NO_HARDWARE_FACTOR) throw err;
    await authenticateOrThrow(); // engages device-credential fallback on lockout
    return await getHF(hfOpts);   // retry once; a second failure propagates
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
      //
      // H16-DEVIATION: On biometric lockout, we fall back to device credential (PIN/passcode)
      // for the APP-LAYER gate (enrollKek, changePassword) only. The KEYSTORE KEY itself
      // does not have allowDeviceCredential — that was removed by H16. This means lockout
      // degrades the app-layer UX gate to PIN, but the Keystore HMAC/ECIES operation still
      // requires biometric at the OS level. Accepted deviation; see docs/audit-2026-06-28.
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

// C-1 (v3 protocol): build the getHardwareFactor() call options for an EXISTING vault
// blob. Only a v3 vault (blob.hardwareKekVersion === 3) has a GENUINELY salt-bound wrap,
// so only v3 passes { kekSalt } (decoded from the stored base64). Everything else calls
// getHardwareFactor() with NO kekSalt, so the native plugin falls back to the fixed
// PRF_EVAL_SALT and reproduces the H the wrap was actually made with (fail-closed to
// backwards-compat; changing this would brick the existing wrap):
//   - v3 → { kekSalt } (per-enrollment salt-bound H — the real binding).
//   - v2 → undefined. The v2 stamp was aspirational: two masking bugs (the facade dropped
//     getHardwareFactor's opts, and hardware.js sent kekSalt as raw bytes the Capacitor
//     bridge could not carry) meant v2 wraps were ACTUALLY made under the fixed v1 salt.
//     So a v2 blob MUST unlock with the fixed salt (C-1 regression 2026-07-05; treated as
//     fixed-salt). The v2→v3 salt-binding upgrade happens on changePassword (a genuine
//     re-enroll), NOT on unlock — re-deriving H under a fresh salt would need a second
//     biometric prompt per unlock (see _unlockInner). A v2 vault stays v2 until its next
//     PIN/password change.
//   - v1 (no hardwareKekVersion) → undefined (legacy fixed-salt wrap).
// Returns undefined (call getHF() with no args) or { kekSalt: Uint8Array } for v3.
export function hfOptsForBlob(blob, saltBytes) {
  if (blob && blob.hardwareKekVersion === 3) {
    return { kekSalt: saltBytes.slice() };
  }
  return undefined;
}

async function _unlockInner(password, opts = {}) {
  const raw = await SecureStorage.get(VAULT_KEY, false);
  if (raw === null || raw === undefined) {
    throw new Error('No wallet found on this device');
  }
  const blob = parseVaultBlob(raw); // corrupt store value → KEK_ERR.MALFORMED_VAULT (not raw SyntaxError)

  if (blob.kekWrap) {
    // KEK-enrolled vault: hardware factor H (via biometric) + PIN-derived C required (I4).
    // getHardwareFactor() already presents the biometric prompt via Android Keystore,
    // so authenticateOrThrow() is intentionally skipped here to avoid a double prompt.
    const getHF = opts && opts.getHardwareFactor;
    if (typeof getHF !== 'function') throw new Error(KEK_ERR.NO_HARDWARE_FACTOR);
    // Validate the blob's kekSalt BEFORE any biometric prompt / key derivation: a
    // KEK-enrolled blob with a missing/empty/non-base64 kekSalt is malformed and must
    // fail closed with the stable code (never a raw InvalidCharacterError).
    const saltBytes = decodeKekSalt(blob.kekSalt);
    // C-1 (v3): bind H to this vault's kekSalt (v3 only) or fall back to the fixed salt
    // (v2 inert-binding / v1 legacy). See hfOptsForBlob.
    const H = await getHF(hfOptsForBlob(blob, saltBytes)); // biometric prompt (Android Keystore)
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
      const plaintext = await decryptVaultWithDek(blob, dek);
      // C-1 (v2→v3): the v2→v3 salt-binding upgrade deliberately does NOT run on the
      // unlock hot path. Re-deriving H under a fresh salt requires a SECOND biometric
      // prompt, which (on top of the biometricUnlock cache-gate + this unlock's own H
      // decrypt) made a KEK-enrolled v2 unlock spawn three OS biometric sheets — and a
      // failed migration write would re-prompt on every future unlock and never converge.
      // The v2→v3 upgrade now happens on changePassword (see below), which re-enrolls under
      // a genuine v3 wrap with a fresh per-enrollment kekSalt and a fail-closed
      // safeWriteVault. Unlock is therefore a single-prompt, read-only operation w.r.t. the
      // version stamp. Tradeoff: a v2 vault whose PIN is never changed stays v2 (retains
      // the C-1 fixed-salt weakness) until the next PIN/password change.
      return plaintext;
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

// #725 (M-3): the M2c up-migration in unlock() is best-effort — it MUST NOT fail
// the unlock (the secret has already been recovered). But it also must not SWALLOW
// the failure silently: a persistent VAULT_WRITE_VERIFY_FAILED (or any repeated
// migration error) needs to be visible so it can be diagnosed. This handler logs
// ONLY the error's code (or, absent a code, its message) — NEVER the error object,
// the vault blob, the ciphertext, or any key material (LOG-1). Extracted as a pure
// helper because the M2c branch itself is dormant (M2C_HARDWARE_WRAP_ENABLED=false),
// so the handler's contract is pinned by a direct unit test.
export function logM2cMigrationFailure(e) {
  // Coerce to a primitive string first: passing the raw error object to
  // console.error could serialise attached fields (hw/kekWrap/ct) in some logger
  // configs. Only a plain string crosses the boundary.
  const detail = (e && (e.code || e.message)) || 'unknown error';
  console.error('[keystore] M2c up-migration failed:', String(detail));
}

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
    // BADGE HONESTY (I4): this is the source-of-truth for the "Hardware Protection ON"
    // badge. A blob we cannot even parse is NOT usable KEK protection, so we report
    // "not enrolled" (false) — the badge reads OFF safely — rather than throwing and
    // breaking the settings screen. This is deliberately the ONLY place a malformed
    // blob is swallowed to a benign value: it is a read-only presence check that never
    // touches key material. Genuine decrypt/unlock errors are NOT swallowed here — the
    // unlock/enroll paths still surface MALFORMED_VAULT and fail closed.
    let blob;
    try {
      blob = parseVaultBlob(raw);
    } catch {
      return false;
    }
    return !!blob.kekWrap;
  },

  // Read the persisted hardware security tier from the vault blob.
  // Returns a securityLevelName string (e.g. 'STRONGBOX', 'TRUSTED_ENVIRONMENT',
  // 'SecureEnclave') or null when not enrolled or the tier was never stored.
  // No biometric prompt, no secret read — metadata only.
  async getVaultKekTier() {
    await init();
    const raw = await SecureStorage.get(VAULT_KEY, false);
    if (raw === null || raw === undefined) return null;
    let blob;
    try {
      blob = parseVaultBlob(raw);
    } catch {
      return null;
    }
    // Only report a tier for an actually KEK-wrapped vault — a bare vault (e.g. after
    // unenroll) may carry a stale hardwareKekTier field; the badge must read null then.
    if (!blob.kekWrap) return null;
    return blob.hardwareKekTier ?? null;
  },

  // Read the persisted hardware KEK protocol version from the vault blob.
  // No biometric prompt, no secret read — metadata only (mirrors getVaultKekTier).
  // Returns:
  //   - null when there is no vault, the blob is corrupt, or the vault is NOT KEK-wrapped;
  //   - blob.hardwareKekVersion ?? 1 for a kekWrap vault (a KEK-wrapped vault with no
  //     version field is a LEGACY v1 wrap — the fixed-salt binding pre-dates the stamp).
  // The UI reads this (against getVaultKekVersion() < 3) to decide whether to OFFER the
  // explicit "Upgrade protection" action (upgradeKekToV3). A benign swallow of a corrupt
  // blob → null is the ONLY swallow here — a read-only presence check that never touches
  // key material, exactly like getVaultKekTier / hasVaultKekWrap.
  async getVaultKekVersion() {
    await init();
    const raw = await SecureStorage.get(VAULT_KEY, false);
    if (raw === null || raw === undefined) return null;
    let blob;
    try {
      blob = parseVaultBlob(raw);
    } catch {
      return null;
    }
    if (!blob.kekWrap) return null;
    return blob.hardwareKekVersion ?? 1;
  },

  // EXPLICIT, USER-CONSENTED, FAIL-CLOSED upgrade of a pre-#568 v2 (or legacy v1) KEK
  // vault to a GENUINELY salt-bound v3 wrap. This is the on-demand replacement for the
  // silent v2→v3 lazy migration that was removed from the unlock hot path (PR #662)
  // because it fired a 3rd biometric prompt per unlock and, on failure, swallowed the
  // error and looped forever.
  //
  // Contract:
  //   - IDEMPOTENT: an already-v3 vault returns { upgraded:false, version:3 } WITHOUT any
  //     biometric prompt (getHardwareFactor is never called) and WITHOUT a write.
  //   - NOT-ENROLLED: a bare (non-KEK) vault throws KEK_ERR.NOT_ENROLLED BEFORE any getHF,
  //     so it fires ZERO biometric prompts.
  //   - v1/v2 → v3: re-wrap identically to changePassword's KEK branch with
  //     currentPassword === newPassword === password. The seed ciphertext (blob.iv/ct) is
  //     UNCHANGED — only the DEK wrap and kekSalt rotate (§3 property); hardwareKekTier is
  //     preserved via the ...blob spread. This deliberately fires TWO biometric prompts
  //     (unwrap H on the old side + re-wrap H2 on the new salt) — correct and acceptable
  //     for a one-time, explicitly consented action (unlike the per-unlock prompt we removed).
  //   - FAIL-CLOSED (I4): do NOT catch/swallow. Any throw (missing/failed H, wrong-PIN
  //     unwrap, write-verify mismatch) PROPAGATES; safeWriteVault's set→read-back→verify
  //     leaves the stored blob byte-for-byte unchanged, so a failed upgrade never
  //     downgrades or half-writes the vault. The UI surfaces the error.
  //
  // @param {string} password the current PIN/password (used for BOTH unwrap and re-wrap)
  // @param {{ getHardwareFactor?: Function }} opts
  // @returns {Promise<{ upgraded: boolean, version: number }>}
  async upgradeKekToV3(password, opts) {
    await init();
    return withLockSuppressed(async () => {
      // Read the vault FIRST and short-circuit the two no-op cases (bare vault, already-v3)
      // BEFORE any authentication or hardware factor, so a no-op upgrade fires ZERO
      // biometric prompts. Both cases read only metadata already exposed auth-free via
      // getVaultKekVersion()/hasVaultKekWrap(), so this leaks nothing new.
      const raw = await SecureStorage.get(VAULT_KEY, false);
      if (raw === null || raw === undefined) {
        throw new Error('No wallet found on this device');
      }
      const blob = parseVaultBlob(raw); // corrupt store value → KEK_ERR.MALFORMED_VAULT

      // Not KEK-enrolled: nothing to upgrade. Fail closed with no prompt.
      if (!blob.kekWrap) {
        throw Object.assign(new Error(KEK_ERR.NOT_ENROLLED), { code: KEK_ERR.NOT_ENROLLED });
      }

      // IDEMPOTENT: an already-v3 vault is genuinely salt-bound — nothing to do. Return
      // WITHOUT any biometric prompt (neither the app-layer gate nor getHardwareFactor
      // runs) and WITHOUT writing.
      if (blob.hardwareKekVersion === 3) {
        return { upgraded: false, version: 3 };
      }

      // v1/v2 kekWrap → a genuine upgrade. Two getHardwareFactor calls (unwrap H on
      // the old salt + re-wrap H2 on the new salt) each present the SE/StrongBox
      // biometric sheet natively — TWO OS prompts total on the happy path (was THREE
      // before the 2026-07-16 single-prompt fix removed the standalone app-layer
      // authenticateOrThrow at the top of this branch). Two prompts here is CORRECT
      // and acceptable for a one-time, user-consented upgrade (unlike the per-unlock
      // second prompt we removed from the unlock hot path). authenticateOrThrow is
      // preserved as the lockout fallback inside getHardwareFactorWithLockoutFallback.
      const getHF = opts && opts.getHardwareFactor;
      if (typeof getHF !== 'function') throw new Error(KEK_ERR.NO_HARDWARE_FACTOR);
      const oldSaltBytes = decodeKekSalt(blob.kekSalt); // malformed kekSalt → MALFORMED_VAULT
      const newSaltBytes = crypto.getRandomValues(new Uint8Array(32));
      const newKekSalt = btoa(String.fromCharCode(...newSaltBytes));
      let H;
      let H2;
      let oldC;
      let newC;
      let oldKek;
      let newKek;
      let dek;
      // H-NEW-6b: wrap the WHOLE key-material lifetime in try/finally so H, H2, both
      // derived KEKs, and the recovered DEK are wiped on EVERY path (I4).
      try {
        // Old side: whatever the stored blob binds to (v2/v1 → fixed salt via hfOptsForBlob).
        H = await getHardwareFactorWithLockoutFallback(getHF, hfOptsForBlob(blob, oldSaltBytes));
        // New side: the re-enrolled vault is always v3 — bind the new H to the new salt.
        H2 = await getHardwareFactorWithLockoutFallback(getHF, { kekSalt: newSaltBytes.slice() });
        oldC = await deriveKekC(password, oldSaltBytes);
        oldKek = await combineKek(H, oldC);
        if (H && H.fill) H.fill(0);
        if (oldC) oldC.fill(0);
        dek = await unwrapDek(oldKek, blob.kekWrap); // throws on wrong PIN/device — fail-closed
        newC = await deriveKekC(password, newSaltBytes);
        newKek = await combineKek(H2, newC);
        if (H2 && H2.fill) H2.fill(0);
        if (newC) newC.fill(0);
        const newKekWrap = await wrapDek(newKek, dek);
        // ...blob spread preserves hardwareKekTier and the seed's iv/ct (seed CT UNCHANGED
        // — only the wrap and salt rotate; §3). safeWriteVault verifies the write (I4).
        await safeWriteVault({ ...blob, kekWrap: newKekWrap, kekSalt: newKekSalt, hardwareKekVersion: 3 });
      } finally {
        if (H && H.fill) H.fill(0);
        if (H2 && H2.fill) H2.fill(0);
        if (oldC) oldC.fill(0);
        if (newC) newC.fill(0);
        if (oldKek) oldKek.fill(0);
        if (newKek) newKek.fill(0);
        if (dek) dek.fill(0);
        oldSaltBytes.fill(0);
        newSaltBytes.fill(0);
      }
      return { upgraded: true, version: 3 };
    });
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

  // Re-persist NEW vault CONTENT (a mutated multi-seed container) while PRESERVING
  // the current at-rest format (KEK DOWNGRADE FIX, I4 fail-closed). WalletProvider
  // calls this for seed add/remove/import and unlock-time container migrations.
  //
  //   - BARE vault (no kekWrap): behaves exactly like createVault — encrypt the new
  //     secret under the password (argon2id) and durably persist. No hardware factor
  //     is read (getHardwareFactor is NEVER called on a bare vault).
  //   - KEK-enrolled vault (kekWrap present): recover the DEK with H (opts.getHardwareFactor)
  //     + PIN-derived C, then re-encrypt the NEW plaintext under that SAME DEK via
  //     encryptVaultWithDek, preserving kekWrap/kekSalt and kdf:'kek-dek'. The seed's
  //     DEK is unchanged; only iv/ct (the content ciphertext) change.
  //
  // FAIL-CLOSED: on a KEK-enrolled vault, if the hardware factor is missing or DEK
  // recovery fails we THROW and leave the vault untouched — we NEVER silently rewrite
  // it bare (that silent downgrade was the device-confirmed bug). H, C, KEK and DEK are
  // zeroed on every path (H-NEW-6b), mirroring unlock/changePassword/enrollKek.
  async saveVaultContents(secret, password, opts = {}) {
    await init();
    // L1: on a KEK-enrolled vault this opens an OS biometric sheet (getHardwareFactor),
    // whose appStateChange pause would otherwise fire the background lock hook mid-write.
    // Suppress the lock hook for the whole operation, matching unlock/enrollKek/unenrollKek.
    return withLockSuppressed(async () => {
      const raw = await SecureStorage.get(VAULT_KEY, false);
      const blob = raw === null || raw === undefined
        ? null
        : parseVaultBlob(raw); // corrupt store value → KEK_ERR.MALFORMED_VAULT

      // Bare (or first-write) vault: identical to createVault — plain argon2id, no KEK.
      if (!blob || !blob.kekWrap) {
        const bare = await encryptVault(secret, password); // ../vault.js — unchanged
        await safeWriteVault(bare);
        return;
      }

      // KEK-enrolled: re-encrypt the new content under the EXISTING DEK, preserving wrap.
      const getHF = opts && opts.getHardwareFactor;
      if (typeof getHF !== 'function') throw new Error(KEK_ERR.NO_HARDWARE_FACTOR);
      const saltBytes = decodeKekSalt(blob.kekSalt); // malformed kekSalt → MALFORMED_VAULT
      // C-1 (v3): bind H to this vault's kekSalt (v3 only) or fall back to the fixed
      // salt for v2 (inert-bound, C-1 residual) / v1 (legacy). See hfOptsForBlob and
      // upgradeKekToV3 for the v2→v3 migration path. 2026-07-14 audit LOW: stale
      // "(v2)" wording corrected — v2 is the inert-binding branch, not salt-bound.
      const H = await getHF(hfOptsForBlob(blob, saltBytes)); // one biometric prompt for this write
      let C;
      let kek;
      let dek;
      try {
        C = await deriveKekC(password, saltBytes);
        kek = await combineKek(H, C);
        if (H && H.fill) H.fill(0);
        if (C) C.fill(0);
        dek = await unwrapDek(kek, blob.kekWrap); // throws on wrong PIN/device — fail-closed
        const { iv, ct } = await encryptVaultWithDek(secret, dek);
        // Preserve kek-dek format: same kekWrap/kekSalt, only content ct/iv change.
        await safeWriteVault({ ...blob, iv, ct, kdf: 'kek-dek' });
      } finally {
        if (H && H.fill) H.fill(0);
        if (C) C.fill(0);
        if (kek) kek.fill(0);
        if (dek) dek.fill(0);
        saltBytes.fill(0);
      }
    });
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
    // M2c: intercept Enclave-wrapped records BEFORE withLockSuppressed/_unlockInner,
    // which calls parseVaultBlob() and would reject { wrap:'enclave-v1' } as malformed.
    // Peek at the record shape — metadata-only read, never the secret.
    const rawPeek = await SecureStorage.get(VAULT_KEY, false);
    if (rawPeek !== null && rawPeek !== undefined) {
      let peekRecord;
      // parseVaultBlob gives the stable MALFORMED_VAULT throw on corrupt input; keep the
      // try/catch so a non-enclave / unparseable record falls through to _unlockInner
      // (which surfaces the proper error) instead of throwing from the metadata peek.
      try { peekRecord = parseVaultBlob(rawPeek); } catch { /* fall through */ }
      if (peekRecord && peekRecord.wrap === WRAP_VERSION_ENCLAVE) {
        // OS biometric is enforced by the Enclave key ACL inside hwUnwrap — no
        // separate app-layer gate. Tag cancel/lockout so the caller fails closed.
        let blobJson;
        try {
          const { hwUnwrap } = await enclavePlugin();
          blobJson = utf8FromBase64(await hwUnwrap(peekRecord.hw));
        } catch (err) {
          if (err && typeof err === 'object') err.veyrnoxBiometricGate = true;
          throw err;
        }
        return decryptVault(parseVaultBlob(blobJson), password); // vault.js unchanged
      }
    }

    // Standard M2b / KEK path — suppress lock hook around biometric prompts.
    return withLockSuppressed(async () => {
      const secret = await _unlockInner(password, opts);
      // M2c-2 opt-in up-migration: transparently re-wrap the M2b blob under the
      // Enclave key after a successful biometric-enabled unlock. Best-effort +
      // atomic-safe (safeWriteVault). Dormant while M2C_HARDWARE_WRAP_ENABLED=false.
      if (opts.requireBiometric && (await useHardwareWrap())) {
        try {
          const raw2 = await SecureStorage.get(VAULT_KEY, false);
          if (raw2 !== null && raw2 !== undefined) {
            const { createWrappingKey, hwWrap } = await enclavePlugin();
            await createWrappingKey();
            const ct = await hwWrap(base64FromUtf8(typeof raw2 === 'string' ? raw2 : JSON.stringify(raw2)));
            await safeWriteVault({ wrap: WRAP_VERSION_ENCLAVE, hw: ct });
          }
        } catch (e) {
          // Non-fatal: the secret is already recovered, so unlock still succeeds and
          // migration is retried on a later unlock. But log the failure (code/message
          // only, never key material — #725/LOG-1) instead of swallowing it silently.
          logM2cMigrationFailure(e);
        }
      }
      return secret;
    });
  },

  // Re-encrypt the EXISTING vault under a new password, keeping the SAME secret
  // (non-custodial "change my vault password"). Mirrors web.js exactly over the
  // same unchanged ../vault.js crypto — only WHERE the blob lives differs. On a
  // BARE vault we gate behind the standalone app-layer biometric prompt (no SE key
  // to inherit from); on a KEK vault getHardwareFactor is the sole biometric gate
  // per call (single-prompt-per-getHF, matching the unlock path). Then decrypt with
  // the current password (throws generic error on mismatch, changing nothing) and
  // persist the re-encrypted blob. The secret never leaves memory.
  async changePassword(currentPassword, newPassword, opts = {}) {
    await init();
    // L1: this opens OS biometric sheets (bare branch: one authenticateOrThrow;
    // KEK branch: TWO getHardwareFactor calls, one per salt) whose appStateChange
    // pause would otherwise fire the background lock hook mid-rewrite. Suppress
    // the lock hook for the whole operation, matching unlock/enrollKek/unenrollKek.
    return withLockSuppressed(async () => {
      const raw = await SecureStorage.get(VAULT_KEY, false);
      if (raw === null || raw === undefined) {
        throw new Error('No wallet found on this device');
      }
      const blob = parseVaultBlob(raw); // corrupt store value → KEK_ERR.MALFORMED_VAULT

      if (blob.kekWrap) {
        // KEK-enrolled: rotate the PIN by re-wrapping the DEK under a new KEK.
        // The seed ciphertext (blob.ct) stays UNCHANGED — that is the §3 property.
        //
        // 2026-07-16 (single-prompt fix): the standalone app-layer authenticateOrThrow
        // was removed from the top of this method — the two getHardwareFactor calls
        // below present the SE/StrongBox biometric sheets natively (one per salt), so
        // this operation fires exactly TWO OS prompts on the happy path (was THREE).
        // The removed app-layer gate is preserved as the lockout fallback inside
        // getHardwareFactorWithLockoutFallback, which engages the device-credential
        // (H16-DEVIATION) path only when a getHF throws NO_HARDWARE_FACTOR.
        const getHF = opts && opts.getHardwareFactor;
        if (typeof getHF !== 'function') throw new Error(KEK_ERR.NO_HARDWARE_FACTOR);
        const oldSaltBytes = decodeKekSalt(blob.kekSalt); // malformed kekSalt → MALFORMED_VAULT
        const newSaltBytes = crypto.getRandomValues(new Uint8Array(32));
        const newKekSalt = btoa(String.fromCharCode(...newSaltBytes));
        let H;
        let H2;
        let oldC;
        let newC;
        let oldKek;
        let newKek;
        let dek;
        try {
          H = await getHardwareFactorWithLockoutFallback(getHF, hfOptsForBlob(blob, oldSaltBytes));
          H2 = await getHardwareFactorWithLockoutFallback(getHF, { kekSalt: newSaltBytes.slice() });
          oldC = await deriveKekC(currentPassword, oldSaltBytes);
          oldKek = await combineKek(H, oldC);
          if (H && H.fill) H.fill(0);
          if (oldC) oldC.fill(0);
          dek = await unwrapDek(oldKek, blob.kekWrap); // throws if wrong PIN/device
          newC = await deriveKekC(newPassword, newSaltBytes);
          newKek = await combineKek(H2, newC);
          if (H2 && H2.fill) H2.fill(0);
          if (newC) newC.fill(0);
          const newKekWrap = await wrapDek(newKek, dek);
          await safeWriteVault({ ...blob, kekWrap: newKekWrap, kekSalt: newKekSalt, hardwareKekVersion: 3 });
        } finally {
          if (H && H.fill) H.fill(0);
          if (H2 && H2.fill) H2.fill(0);
          if (oldC) oldC.fill(0);
          if (newC) newC.fill(0);
          if (oldKek) oldKek.fill(0);
          if (newKek) newKek.fill(0);
          if (dek) dek.fill(0);
          oldSaltBytes.fill(0);
          newSaltBytes.fill(0);
        }
        return;
      }

      // Bare (non-KEK) vault: no SE prompt to inherit from, so we retain the
      // standalone app-layer biometric gate to keep this operation authenticated
      // end-to-end. authenticateOrThrow's own device-credential fallback covers
      // biometric lockout on this branch.
      await authenticateOrThrow(); // throws on cancel/failure/lockout
      const secret = await decryptVault(blob, currentPassword); // ../vault.js — unchanged
      const rewrapped = await encryptVault(secret, newPassword); // ../vault.js — unchanged
      await safeWriteVault(rewrapped);
    });
  },

  // Enroll the Hardware KEK on an existing vault. After enrollment, unlock()
  // and changePassword() require BOTH the hardware factor H (via opts.getHardwareFactor)
  // and the correct PIN. Fail-closed (I4): missing hardware factor → explicit throw.
  // The SE/StrongBox getHF() call presents the OS biometric sheet natively (the SE ACL
  // is .biometryCurrentSet on iOS / setUserAuthenticationRequired on Android), so getHF
  // is the SOLE biometric gate on the happy path — no separate app-layer
  // authenticateOrThrow() is needed (mirrors _unlockInner's KEK branch, native.js:311-312).
  // authenticateOrThrow() is preserved as a FALLBACK inside getHardwareFactorWithLockoutFallback:
  // on biometric lockout (getHF throws NO_HARDWARE_FACTOR) it engages the device-credential
  // fallback (H16-DEVIATION) and retries getHF once.
  async enrollKek(password, opts) {
    await init();
    return withLockSuppressed(async () => {
      const getHF = opts && opts.getHardwareFactor;
      if (typeof getHF !== 'function') throw new Error(KEK_ERR.NO_HARDWARE_FACTOR);
      const raw = await SecureStorage.get(VAULT_KEY, false);
      if (raw === null || raw === undefined) throw new Error('No wallet found on this device');
      const blob = parseVaultBlob(raw); // corrupt store value → KEK_ERR.MALFORMED_VAULT
      // 2026-07-14 audit LOW: mirror web.js:538 — reject re-enrollment on an already-KEK-
      // enrolled blob with a stable KEK_ALREADY_ENROLLED code so the caller can distinguish
      // "wrong PIN" (decryptVault throws generic wrong-password) from "vault is already
      // enrolled" (no PIN attempt needed). Fail-closed / fail-honest, I4.
      if (blob.kekWrap) {
        throw Object.assign(new Error('KEK_ALREADY_ENROLLED'), { code: 'KEK_ALREADY_ENROLLED' });
      }
      // 2026-07-16 (single-prompt fix): verify the password and recover the seed BEFORE
      // any biometric prompt. A mistyped PIN must NOT flash Face ID / fingerprint (I4
      // honest failure — a "wrong password" error should look like a wrong-password
      // error), and must NOT materialise a hardware credential that then needs to be
      // rolled back. decryptVault throws generic wrong-password; no credential created.
      const secret = await decryptVault(blob, password); // verify password and recover seed

      const saltBytes = crypto.getRandomValues(new Uint8Array(32));
      const kekSalt = btoa(String.fromCharCode(...saltBytes));
      // H-1 (#720): getHF materialises the native credential. It lives INSIDE the outer
      // try so that a throw AFTER the credential exists still reaches the clear-credential
      // rollback below (fail honest, fail closed — I4). The password check above runs
      // BEFORE this so a wrong PIN never creates a credential to roll back.
      let H;
      try {
        H = await getHardwareFactorWithLockoutFallback(getHF, { kekSalt: saltBytes.slice() });
        let C;
        let kek;
        const dek = randomDek();
        try {
          C = await deriveKekC(password, saltBytes);
          kek = await combineKek(H, C);
          if (H && H.fill) H.fill(0);
          if (C) C.fill(0);
          const kekWrap = await wrapDek(kek, dek);
          const { iv, ct } = await encryptVaultWithDek(secret, dek);
          const tierEntry = opts && opts.hardwareKekTier
            ? { hardwareKekTier: opts.hardwareKekTier }
            : {};
          await safeWriteVault({ ...blob, iv, ct, kdf: 'kek-dek', kekWrap, kekSalt, hardwareKekVersion: 3, ...tierEntry });
        } finally {
          if (H && H.fill) H.fill(0);
          if (C) C.fill(0);
          if (kek) kek.fill(0);
          dek.fill(0);
          saltBytes.fill(0);
        }
      } catch (err) {
        // Zero the salt on the getHF-throw path too (the inner finally never ran).
        if (H && H.fill) H.fill(0);
        saltBytes.fill(0);
        try {
          await clearHardwareCredential();
        } catch {
          /* keep the original enroll failure as the surfaced error (I4) */
        }
        throw err;
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
      const blob = parseVaultBlob(raw); // corrupt store value → KEK_ERR.MALFORMED_VAULT
      if (!blob.kekWrap) {
        await clearHardwareCredential();
        return;
      }

      const saltBytes = decodeKekSalt(blob.kekSalt); // malformed kekSalt → MALFORMED_VAULT
      const H = await getHF(hfOptsForBlob(blob, saltBytes));
      let C;
      let kek;
      let dek;
      try {
        C = await deriveKekC(password, saltBytes);
        kek = await combineKek(H, C);
        if (H && H.fill) H.fill(0);
        if (C) C.fill(0);
        dek = await unwrapDek(kek, blob.kekWrap); // throws KEK_ERR.UNWRAP_FAILED on wrong PIN/device
        const secret = await decryptVaultWithDek(blob, dek);
        const bareBlob = await encryptVault(secret, password);
        await safeWriteVault(bareBlob);
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
    // M-4: best-effort — an absent hardware key (or plugin quirk) is not an error during
    // a wipe; the vault is already gone, so never propagate and abort the clear.
    try { await clearHardwareCredential(); } catch { /* best-effort — absent key is not an error during wipe */ }
  },

  // NATIVE-ONLY: deliver the hardware factor H for an enrolled vault. Exposed so
  // WalletProvider can pass it to unlock() without importing hardware.js directly.
  getHardwareFactor,

  // M2c-2 DOWN-migration (OPT-IN disable path): if the primary vault is currently
  // Enclave-wrapped, unwrap it (the OS biometric is enforced by the key ACL) and
  // re-store the SAME encrypted blob as a plain M2b record, so a password-only
  // unlock keeps working after the user turns biometric unlock OFF. Called from
  // WalletProvider.disableBiometricUnlock BEFORE the biometric cache is cleared.
  //   • Keys off the RECORD SHAPE, not M2C_HARDWARE_WRAP_ENABLED — never stranded.
  //   • No-op when the record is already M2b or absent.
  //   • Atomic-safe: overwrites to M2b ONLY after a successful unwrap+parse.
  async downgradeFromHardwareWrap() {
    await init();
    // L1/M-9: hwUnwrap opens an OS biometric sheet whose appStateChange pause would
    // otherwise fire the background lock hook mid-downgrade. Suppress the lock hook for
    // the whole operation, matching unlock/enrollKek/unenrollKek/changePassword.
    return withLockSuppressed(async () => {
      const raw = await SecureStorage.get(VAULT_KEY, false);
      if (raw === null || raw === undefined) return;
      const record = parseVaultBlob(raw); // corrupt store value → KEK_ERR.MALFORMED_VAULT
      if (!record || record.wrap !== WRAP_VERSION_ENCLAVE) return; // already M2b

      const { hwUnwrap, deleteWrappingKey } = await enclavePlugin();
      const blobJson = utf8FromBase64(await hwUnwrap(record.hw)); // throws on cancel
      const blob = parseVaultBlob(blobJson); // validate it parses before overwriting
      await safeWriteVault(blob);
      try { await deleteWrappingKey(); } catch { /* non-fatal */ }
    });
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

  // NATIVE-ONLY: suppress the background-lock hook for the duration of `fn`.
  // Used by verifyBiometric2fa and other OS-dialog callers that briefly pause
  // the app without wanting to trigger lock() mid-operation.
  suppressLock: withLockSuppressed,
};
