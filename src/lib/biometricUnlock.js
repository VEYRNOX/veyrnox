// lib/biometricUnlock.js — the biometric-gated VAULT-PASSWORD cache that powers
// one-tap "Face ID → dashboard" for returning users.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ WHAT THIS IS (and is NOT)                                                 │
// │ This is a CONVENIENCE cache layered OVER the existing vault — never a     │
// │ replacement for it, and never a new standalone secret:                    │
// │   - The vault password remains THE secret. It is what `keyStore.unlock()` │
// │     uses to decrypt the audited Argon2id+AES-GCM vault (untouched here).  │
// │   - This module stores a copy of that password behind the platform's      │
// │     biometric gate so a returning user can unlock with Face ID instead of │
// │     re-typing it. The password itself is ALWAYS the fallback — Face ID    │
// │     failing/being unavailable just routes the user to the password field. │
// │     No biometric, no funds: the cache is useless without also satisfying  │
// │     the vault decrypt.                                                     │
// │   - It introduces NO numeric PIN or other weak standalone unlock.         │
// │                                                                            │
// │ HOW THE BIOMETRIC GATE IS ENFORCED (read this — it is precise on purpose) │
// │   The underlying secure-storage plugin (@aparajita/capacitor-secure-      │
// │   storage) can pin an item's *accessibility* (whenPasscodeSetThisDevice-  │
// │   Only — hardware-backed, device-only, passcode-required) but it does NOT │
// │   expose the iOS access-control / SecAccessControl biometry flags         │
// │   (kSecAccessControlBiometryCurrentSet / .userPresence) nor the Android   │
// │   Keystore setUserAuthenticationRequired equivalent. So the Keychain      │
// │   alone would release the cached password to any in-app caller on a       │
// │   merely-unlocked device — accessibility is NOT a biometric gate.         │
// │                                                                            │
// │   We therefore enforce the biometric requirement at a single STRUCTURAL   │
// │   CHOKEPOINT: `retrieveUnlockSecret()` is the ONLY path that releases the │
// │   plaintext, and on native it performs a REAL OS biometric authenticate   │
// │   (@aparajita/capacitor-biometric-auth, same policy as the audited        │
// │   keystore/native.js → authenticateOrThrow) as a hard precondition BEFORE │
// │   it reads the item. A cancelled/failed match throws; the secret is never │
// │   read. The raw store read is a private function with no other caller.    │
// │   `hasStoredUnlockSecret()` is a metadata-only presence check that does   │
// │   NOT prompt (so the entry screen can show the one-tap button without     │
// │   firing Face ID).                                                         │
// │                                                                            │
// │   LIMITATION (honest): this is an OS-enforced biometric match gating the  │
// │   release in code, NOT a Keychain-bound item. It does not get             │
// │   biometryCurrentSet's auto-invalidation (wipe the item if biometrics are │
// │   added/changed) — that needs a native shim and is a documented follow-up.│
// │   Because the cache and the vault blob are separate Keychain items, each   │
// │   biometric-gated independently, the native one-tap flow presents the OS  │
// │   biometric sheet TWICE (once here for the cache, once inside the          │
// │   untouchable keyStore.unlock() for the vault). That second sheet is the   │
// │   accepted, disclosed cost of OS-enforcing the cache without touching      │
// │   wallet-core crypto.                                                      │
// │                                                                            │
// │ It does NOT touch vault.js / vaultStore.js / signing / derivation /       │
// │ keystore. It is a separate, additive app-layer module.                    │
// │                                                                            │
// │ DEMO honesty: in demo the cache lives in localStorage and the prompt is a │
// │ clearly-labelled SIMULATION (see BiometricPrompt.jsx) — NOT real OS       │
// │ security, and NOT an OS authenticate(). On a real native device the cache │
// │ lives in the hardware-backed, ThisDeviceOnly, passcode-gated secure store │
// │ (same store class as keystore/native.js), and the real OS biometric sheet │
// │ gates the release as described above.                                     │
// └─────────────────────────────────────────────────────────────────────────┘

import { Capacitor } from '@capacitor/core';
import { DEMO } from '@/api/demoClient';

// DEMO cache lives in an in-memory module variable — session-scoped, cleared on
// page unload, never written to localStorage or any persistent store. This is a
// UI simulation; the real native path uses the hardware-backed secure store.
// (VULN-2 fix: the previous localStorage path left the plaintext vault password
// readable by same-origin scripts and browser extensions for the session lifetime.)
const NATIVE_KEY = 'bio_unlock_secret';
// Mirror keystore/native.js's prefix/accessibility so the cached item gets the
// same ThisDeviceOnly, passcode-gated, never-synced protection as the vault blob.
const NATIVE_PREFIX = 'veyrnox_';

let _demoCache = null; // in-memory only; cleared when the module unloads

function demoStore(pw) { _demoCache = pw; }
function demoGet() { return _demoCache; }
function demoClear() { _demoCache = null; }

// Native secure-storage helpers. Loaded lazily so the Capacitor plugin never
// reaches the web/test bundle (exactly like keystore/index.js does for native).
async function nativeStore(pw) {
  // H-NEW-5 (ANDROID): @aparajita/capacitor-secure-storage (^8.0.0) does not expose
  // setInvalidatedByBiometricEnrollment(true) — per its published Android source
  // (aparajita/capacitor-secure-storage, SecureStorage.java, KeyGenParameterSpec builder)
  // the Android KeyGenParameterSpec is built WITHOUT
  // setUserAuthenticationRequired/setInvalidatedByBiometricEnrollment — so a new
  // fingerprint enrollment does NOT invalidate this cache on Android. Mitigation
  // requires a custom Capacitor plugin using Android Keystore with
  // setInvalidatedByBiometricEnrollment(true) (key destroyed on enrollment change).
  // iOS (separate half): requires kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly +
  // a biometryCurrentSet (SecAccessControl) ACL via a native Swift shim (needs a Mac).
  // Both are TARGET — see audit H-NEW-5. We do NOT fake it here (I4): the release-time
  // OS biometric match in nativeAuthenticateOrThrow() still gates reads, but that is a
  // live match, NOT a key bound to the current biometric enrollment set.
  // HONEST STATUS: biometric cache is device-PIN/passcode-gated only; a biometric
  // enrollment change does not wipe it. Not active; TARGET for a custom plugin.
  const { SecureStorage, KeychainAccess } = await import('@aparajita/capacitor-secure-storage');
  await SecureStorage.setKeyPrefix(NATIVE_PREFIX);
  await SecureStorage.setSynchronize(false);
  await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenPasscodeSetThisDeviceOnly);
  await SecureStorage.set(NATIVE_KEY, pw);
}

// PRIVATE raw read — releases the PLAINTEXT cached password. Never exported and
// never called except from retrieveUnlockSecret() AFTER a successful biometric
// match. This single-caller structure is what makes the biometric gate
// non-bypassable in app code; a test pins it (biometricUnlock-native.test.js).
async function nativeReadSecret() {
  const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
  await SecureStorage.setKeyPrefix(NATIVE_PREFIX);
  const v = await SecureStorage.get(NATIVE_KEY, false);
  return v == null ? null : String(v);
}

// PRIVATE presence check — metadata only (lists keys, never reads the value), so
// it neither releases the secret nor triggers a biometric prompt. Mirrors
// keystore/native.js's "hasVault is a presence check that does NOT prompt".
async function nativeHasSecret() {
  try {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    await SecureStorage.setKeyPrefix(NATIVE_PREFIX);
    const keys = await SecureStorage.keys();
    return Array.isArray(keys) && keys.includes(NATIVE_KEY);
  } catch {
    return false;
  }
}

// Hard OS biometric precondition for releasing the cached password. Same policy
// as the audited keystore/native.js → authenticateOrThrow: require a real
// biometric match (no silent passcode fallback), with a deliberate ONE-TIME
// device-credential fallback only on biometryLockout, and a passcode fallback
// when biometrics are not enrolled but the device IS secured. THROWS on
// cancel/failure/lockout so the secret is never read on a failed match.
async function nativeAuthenticateOrThrow() {
  const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
  const info = await BiometricAuth.checkBiometry();

  // No device security at all → a passcode-gated item cannot have been stored,
  // and there is nothing to authenticate against.
  if (!info.isAvailable && !info.deviceIsSecure) {
    throw new Error(
      'This device has no passcode or biometrics set; cannot release the cached unlock secret',
    );
  }

  const reason = 'Unlock your VEYRNOX wallet';
  if (info.isAvailable) {
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
      // Lockout (too many failed biometric attempts) → fall back ONCE to the
      // device credential, exactly like the keystore unlock policy.
      if (err && err.code === 'biometryLockout') {
        await BiometricAuth.authenticate({ reason, allowDeviceCredential: true });
        return;
      }
      throw err;
    }
  }

  // Biometrics not enrolled but device IS secured → deliberate passcode fallback.
  await BiometricAuth.authenticate({ reason, allowDeviceCredential: true });
}

async function nativeClear() {
  try {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    await SecureStorage.setKeyPrefix(NATIVE_PREFIX);
    await SecureStorage.remove(NATIVE_KEY);
  } catch { /* may already be gone */ }
}

/**
 * Can this platform offer biometric one-tap unlock at all? DEMO (simulated) and
 * any native platform can; plain web has no platform biometric, so the password
 * is the only path there (unchanged).
 * @returns {boolean}
 */
export function biometricUnlockSupported() {
  return DEMO || Capacitor.isNativePlatform();
}

/**
 * Cache the vault password behind the biometric gate. Only callers that legitimately
 * hold the plaintext password (first-run create/import, or a password change) use
 * this. Storing does NOT release a secret, so it does not itself prompt for
 * biometrics. No-op on plain web (returns false).
 *
 * H-NEW-5 honest limit: on Android the cached item is NOT bound to the biometric
 * enrollment set — enrolling a new fingerprint does NOT wipe this cache, because the
 * secure-storage plugin does not expose setInvalidatedByBiometricEnrollment(true).
 * A real fix is TARGET (custom Capacitor/Android Keystore plugin; iOS biometryCurrentSet
 * Swift shim). See the comment block in nativeStore() and audit H-NEW-5.
 * @returns {Promise<boolean>} true if stored.
 */
export async function storeUnlockSecret(password) {
  if (DEMO) { demoStore(password); return true; }
  if (Capacitor.isNativePlatform()) { await nativeStore(password); return true; }
  return false;
}

/**
 * Retrieve the cached vault password — THE single chokepoint that releases the
 * plaintext. On native this performs a REAL OS biometric authenticate as a hard
 * precondition (throws on cancel/failure; the item is never read on a failed
 * match), so the secret is unreleasable without a fresh biometric match enforced
 * by the OS — not just app-layer convention. In demo the caller shows the
 * clearly-labelled SIMULATED prompt (unchanged); this returns the localStorage
 * copy. Plain web caches nothing → null.
 * @returns {Promise<string|null>}
 * @throws on native biometric cancel/failure/lockout (a BiometryError).
 */
export async function retrieveUnlockSecret() {
  if (DEMO) return demoGet();
  if (Capacitor.isNativePlatform()) {
    await nativeAuthenticateOrThrow(); // hard OS biometric precondition
    return nativeReadSecret();
  }
  return null;
}

/** Remove the cached password from every store (called on disable/panic/reset). */
export async function clearUnlockSecret() {
  demoClear();
  if (Capacitor.isNativePlatform()) await nativeClear();
}

/**
 * Whether a cached password is currently present. METADATA ONLY — this never
 * reads the secret and never prompts for biometrics, so the entry screen can
 * decide whether to offer the one-tap button without firing Face ID.
 * @returns {Promise<boolean>}
 */
export async function hasStoredUnlockSecret() {
  if (DEMO) return demoGet() != null;
  if (Capacitor.isNativePlatform()) return nativeHasSecret();
  return false;
}
