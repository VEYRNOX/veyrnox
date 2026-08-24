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
