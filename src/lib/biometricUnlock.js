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
// │     re-typing it. Retrieval is gated by biometric (real OS prompt on a    │
// │     native device; the simulated prompt in demo). The password itself is  │
// │     ALWAYS the fallback — Face ID failing/being unavailable just routes   │
// │     the user to the password field. No biometric, no funds: the cache is  │
// │     useless without also satisfying the vault decrypt.                    │
// │   - It introduces NO numeric PIN or other weak standalone unlock.         │
// │                                                                            │
// │ It does NOT touch vault.js / vaultStore.js / signing / derivation /       │
// │ keystore. It is a separate, additive app-layer module.                    │
// │                                                                            │
// │ DEMO honesty: in demo the cache lives in localStorage and the prompt is a │
// │ clearly-labelled SIMULATION (see BiometricPrompt.jsx) — NOT real OS       │
// │ security. On a real native device the cache lives in the hardware-backed, │
// │ ThisDeviceOnly, passcode-gated secure store (same store class as          │
// │ keystore/native.js), and the real OS biometric sheet gates the unlock.    │
// └─────────────────────────────────────────────────────────────────────────┘

import { Capacitor } from '@capacitor/core';
import { DEMO } from '@/api/demoClient';

// DEMO cache lives in localStorage (clearly not real security — gated only by
// the simulated prompt). NATIVE cache lives in the hardware-backed secure store.
const DEMO_KEY = 'veyrnox-bio-unlock-secret';
const NATIVE_KEY = 'bio_unlock_secret';
// Mirror keystore/native.js's prefix/accessibility so the cached item gets the
// same ThisDeviceOnly, passcode-gated, never-synced protection as the vault blob.
const NATIVE_PREFIX = 'veyrnox_';

function demoStore(pw) { try { localStorage.setItem(DEMO_KEY, pw); } catch { /* best-effort */ } }
function demoGet() { try { return localStorage.getItem(DEMO_KEY); } catch { return null; } }
function demoClear() { try { localStorage.removeItem(DEMO_KEY); } catch { /* best-effort */ } }

// Native secure-storage helpers. Loaded lazily so the Capacitor plugin never
// reaches the web/test bundle (exactly like keystore/index.js does for native).
async function nativeStore(pw) {
  const { SecureStorage, KeychainAccess } = await import('@aparajita/capacitor-secure-storage');
  await SecureStorage.setKeyPrefix(NATIVE_PREFIX);
  await SecureStorage.setSynchronize(false);
  await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenPasscodeSetThisDeviceOnly);
  await SecureStorage.set(NATIVE_KEY, pw);
}
async function nativeGet() {
  const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
  await SecureStorage.setKeyPrefix(NATIVE_PREFIX);
  const v = await SecureStorage.get(NATIVE_KEY, false);
  return v == null ? null : String(v);
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
 * this. No-op on plain web (returns false).
 * @returns {Promise<boolean>} true if stored.
 */
export async function storeUnlockSecret(password) {
  if (DEMO) { demoStore(password); return true; }
  if (Capacitor.isNativePlatform()) { await nativeStore(password); return true; }
  return false;
}

/**
 * Retrieve the cached vault password. The CALLER must have just satisfied the
 * biometric gate (demo simulated prompt / native OS sheet) before calling this.
 * @returns {Promise<string|null>}
 */
export async function retrieveUnlockSecret() {
  if (DEMO) return demoGet();
  if (Capacitor.isNativePlatform()) return nativeGet();
  return null;
}

/** Remove the cached password from every store (called on disable/panic/reset). */
export async function clearUnlockSecret() {
  demoClear();
  if (Capacitor.isNativePlatform()) await nativeClear();
}

/** @returns {Promise<boolean>} whether a cached password is currently present. */
export async function hasStoredUnlockSecret() {
  return (await retrieveUnlockSecret()) != null;
}
