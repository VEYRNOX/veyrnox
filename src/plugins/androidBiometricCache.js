// JS bridge for the Android biometric unlock cache plugin.
//
// Android-only, loaded lazily from biometricUnlock.js so it never reaches the
// web bundle or iOS runtime.

import { registerPlugin } from '@capacitor/core';

const AndroidBiometricCache = registerPlugin('AndroidBiometricCache', {
  web: () =>
    Promise.reject(new Error('AndroidBiometricCache is not available on this platform')),
});

export async function putSecret(secret) {
  return AndroidBiometricCache.putSecret({ secret });
}

export async function getSecret() {
  const { secret } = await AndroidBiometricCache.getSecret();
  return secret == null ? null : String(secret);
}

// Issue #2037 — unauth-alias variants. Writes/reads a SEPARATE Keystore alias
// (`com.veyrnox.app.biometricCacheStorageUnauth.v1`) built WITHOUT
// setUserAuthenticationRequired(true), so getSecretUnauth does NOT trigger an
// OS biometric prompt. Only safe to CONSUME on the KEK-enrolled unlock path,
// where the StrongBox H factor inside getHardwareFactor is the sole
// hardware-enforced biometric gate — see the security contract in
// biometricUnlock.js retrieveUnlockSecretDirect(). Storage is dual-written so
// a KEK-direct read finds the secret without a migration prompt.
export async function putSecretUnauth(secret) {
  return AndroidBiometricCache.putSecretUnauth({ secret });
}

export async function getSecretUnauth() {
  const { secret } = await AndroidBiometricCache.getSecretUnauth();
  return secret == null ? null : String(secret);
}

export async function hasSecret() {
  const { present } = await AndroidBiometricCache.hasSecret();
  return present === true;
}

export async function clearSecret() {
  return AndroidBiometricCache.clearSecret();
}

export async function isAvailable() {
  return AndroidBiometricCache.isAvailable();
}

// ── Issue #2019 fast-path DEK cache shims ──────────────────────────────
//
// Read/write a THIRD Keystore alias built with setUserAuthenticationRequired(
// true) + setInvalidatedByBiometricEnrollment(true) — the STRONG form. See
// AndroidBiometricCachePlugin.kt for the alias-level security contract and
// AndroidBiometricCacheConfig.kt for the JVM-tripwire-pinned ACL constants.
//
// The wrapped DEK is passed as a base64 string; the actual AES-GCM wrap is
// done in JS via wallet-core/keystore/fastpathDekCache.js with distinct AAD
// (`fastpath/v1`). Kotlin adds a SECOND layer of biometric-gated encryption
// under the fastpath alias.

export async function putFastpathDek(wrappedDek) {
  return AndroidBiometricCache.putFastpathDek({ wrappedDek });
}

export async function getFastpathDek() {
  const { wrappedDek } = await AndroidBiometricCache.getFastpathDek();
  return wrappedDek == null ? null : String(wrappedDek);
}

export async function clearFastpathDek() {
  return AndroidBiometricCache.clearFastpathDek();
}
