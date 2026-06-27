// H-NEW-5 (ANDROID half) — source-scan test pinning the HONEST status of biometric
// cache invalidation on Android.
//
// Context: @aparajita/capacitor-secure-storage's Android implementation builds its
// KeyGenParameterSpec WITHOUT setUserAuthenticationRequired(true) /
// setInvalidatedByBiometricEnrollment(true) (verified in
// node_modules/.../android/.../SecureStorage.java). The plugin exposes NO option to
// enable it. So a newly-enrolled fingerprint does NOT wipe the cached vault password
// on Android. We must NOT pretend otherwise (I4). This test pins that the source
// documents the gap by name and never silently claims the protection is active.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, '..', 'biometricUnlock.js'), 'utf8');

describe('H-NEW-5 Android — biometric cache invalidation gap is documented honestly', () => {
  it('names setInvalidatedByBiometricEnrollment or biometryCurrentSet in a comment', () => {
    expect(/setInvalidatedByBiometricEnrollment|biometryCurrentSet/.test(SRC)).toBe(true);
  });

  it('flags an explicit HONEST STATUS for the Android cache invalidation gap', () => {
    expect(/HONEST STATUS:/i.test(SRC)).toBe(true);
    // The honest status must say the gap exists: enrollment change does NOT wipe the cache.
    expect(/enrollment change does not wipe/i.test(SRC)).toBe(true);
  });

  it('marks the mitigation as TARGET (custom plugin / native shim), not shipped', () => {
    expect(/TARGET/.test(SRC)).toBe(true);
  });

  it('does NOT silently claim biometric-enrollment invalidation is active', () => {
    // Any positive mention of the invalidation flag must be negated/qualified, never a
    // bare claim that it is enabled/applied/used. Catch the dishonest phrasings.
    const dishonest =
      /(enabled|applied|active|enforced|set to true|configured)[^.\n]{0,40}setInvalidatedByBiometricEnrollment/i;
    const dishonest2 =
      /setInvalidatedByBiometricEnrollment[^.\n]{0,20}(is enabled|is active|is applied|= true|\(true\) is)/i;
    expect(dishonest.test(SRC)).toBe(false);
    expect(dishonest2.test(SRC)).toBe(false);
  });

  it('explains the Android mitigation requires a custom Capacitor / Keystore plugin', () => {
    expect(/custom Capacitor plugin|Android Keystore/i.test(SRC)).toBe(true);
  });
});
