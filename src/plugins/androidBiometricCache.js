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
