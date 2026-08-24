// biometricUnlock.kekSinglePrompt.test.js
//
// Issue #2037 — collapse the double biometric prompt on the KEK-enrolled
// unlock hot path. Two prompts fire on a cold unlock today, and the second is
// structurally redundant per the retrieveUnlockSecretDirect security contract
// ([src/lib/biometricUnlock.js:302-309]): on a KEK vault the cached C alone
// is useless (DEK = HKDF(H ‖ C) and H requires the StrongBox biometric prompt
// inside getHardwareFactor), so the cached password does NOT need a
// user-auth-gated Keystore alias.
//
// Prompt sources on the current code path:
//   Prompt 1 (OS) — AndroidBiometricCache.getSecret() Kotlin plugin unwraps
//     the biometric-protected Keystore key holding the cached PIN. Fires at
//     ~t=5s in the vc36 Pixel 10 trace.
//   Prompt 2 (OS) — hardware.js getHardwareFactor() StrongBox key unwrap.
//     Fires ~230ms after prompt 1 succeeds. Load-bearing (produces H); MUST
//     stay.
//
// Fix contract, JS side (this test file's scope):
//   - AndroidBiometricCache gains a NON-user-auth-gated read path,
//     surfaced in the JS shim as `getSecretUnauth()`.
//   - `retrieveUnlockSecretDirect({ kekEnrolled: true })` reads via that
//     unauth path instead of the auth-gated `getSecret()`, so the JS runtime
//     no longer asks the Kotlin plugin to trigger prompt 1.
//   - Legacy `retrieveUnlockSecret()` (non-KEK / older callers) keeps the
//     auth-gated `getSecret()` path. Downgrade would break the SOLE
//     biometric gate on non-KEK vaults.
//   - `retrieveUnlockSecretDirect` without the `kekEnrolled: true` assertion
//     still throws (unchanged runtime contract).
//
// This test file fails today because `retrieveUnlockSecretDirect` calls
// `nativeReadSecret()` (auth-gated `getSecret()`) rather than the new
// `nativeReadSecretUnauth()` variant. Land the plugin API + call-site swap
// to make it pass. The Kotlin-side pin (new alias created WITHOUT
// setUserAuthenticationRequired(true)) is a follow-up JVM test on the
// Android module, mirroring the L-3 PlayIntegrityJwsVerifier pattern.
//
// Not in scope for this test:
//   - Kotlin plugin behaviour (needs a JVM test on the Android module).
//   - Prompt 2 (StrongBox). Load-bearing.
//   - Non-KEK paths — untouched.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  calls: [],
  store: null,
  available: true,
  checkBiometryResult: { isAvailable: true, deviceIsSecure: true },
}));

vi.mock('@/api/demoClient', () => ({ DEMO: false }));
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
}));

// Plugin mock — same shape as biometricUnlock-android-plugin.test.js, plus
// a NEW `getSecretUnauth()` method the fix will add. The distinction that
// matters for this test is which call-name lands on `h.calls`.
vi.mock('@/plugins/androidBiometricCache.js', () => ({
  isAvailable: vi.fn(async () => ({ available: h.available })),
  putSecret: vi.fn(async (secret) => {
    h.calls.push('putSecret');
    h.store = String(secret);
  }),
  getSecret: vi.fn(async () => {
    // Auth-gated path — the Kotlin plugin fires an OS biometric prompt here.
    h.calls.push('getSecret');
    return h.store;
  }),
  getSecretUnauth: vi.fn(async () => {
    // Unauth path — reads a Keystore alias created without
    // setUserAuthenticationRequired(true). NO OS prompt.
    h.calls.push('getSecretUnauth');
    return h.store;
  }),
  hasSecret: vi.fn(async () => {
    h.calls.push('hasSecret');
    return h.store != null;
  }),
  clearSecret: vi.fn(async () => {
    h.calls.push('clearSecret');
    h.store = null;
  }),
}));

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  KeychainAccess: { whenPasscodeSetThisDeviceOnly: 4 },
  SecureStorage: {
    setKeyPrefix: vi.fn(async () => { throw new Error('fallback should not run'); }),
    setSynchronize: vi.fn(async () => {}),
    setDefaultKeychainAccess: vi.fn(async () => {}),
    set: vi.fn(async () => {}),
    get: vi.fn(async () => null),
    keys: vi.fn(async () => []),
    remove: vi.fn(async () => {}),
  },
}));

// BiometricAuth mock — asserts NO JS-side app-layer prompt on the direct
// path (already the case today; this pins it against regression).
vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: {
    checkBiometry: vi.fn(async () => h.checkBiometryResult),
    authenticate: vi.fn(async () => {
      h.calls.push('authenticate');
    }),
  },
}));

import {
  storeUnlockSecret,
  retrieveUnlockSecret,
  retrieveUnlockSecretDirect,
} from '@/lib/biometricUnlock';

beforeEach(() => {
  h.calls.length = 0;
  h.store = null;
  h.available = true;
  h.checkBiometryResult = { isAvailable: true, deviceIsSecure: true };
  vi.clearAllMocks();
});

describe('biometricUnlock — KEK-enrolled path collapses to a single OS prompt (#2037)', () => {
  it('retrieveUnlockSecretDirect({ kekEnrolled: true }) reads via the unauth alias, NOT the auth-gated getSecret', async () => {
    await storeUnlockSecret('pin-1234');
    const out = await retrieveUnlockSecretDirect({ kekEnrolled: true });
    expect(out).toBe('pin-1234');
    // The whole point: only the StrongBox prompt inside getHardwareFactor
    // (out-of-scope for this test) may fire. The cached-PIN read must NOT
    // trigger a second prompt.
    expect(h.calls).toContain('getSecretUnauth');
    expect(h.calls).not.toContain('getSecret');
    // And of course no JS-side app-layer prompt either.
    expect(h.calls).not.toContain('authenticate');
  });

  it('retrieveUnlockSecret() (legacy / non-KEK) still uses the auth-gated getSecret path', async () => {
    // Non-KEK vaults have no StrongBox H factor to satisfy on their own.
    // The auth-gated cache-gate is the SOLE biometric protection here and
    // must stay wired.
    await storeUnlockSecret('web-fallback-pw');
    const out = await retrieveUnlockSecret();
    expect(out).toBe('web-fallback-pw');
    expect(h.calls).toContain('authenticate'); // app-layer BiometricAuth prompt
    expect(h.calls).toContain('getSecret'); // auth-gated Keystore read
    // And, critically, do NOT sneak the unauth path in here — that would
    // downgrade the non-KEK security posture.
    expect(h.calls).not.toContain('getSecretUnauth');
  });

  it('retrieveUnlockSecretDirect without the { kekEnrolled: true } assertion still throws (contract unchanged)', async () => {
    await storeUnlockSecret('should-not-leak');
    await expect(retrieveUnlockSecretDirect()).rejects.toThrow(/kekEnrolled/);
    await expect(retrieveUnlockSecretDirect({})).rejects.toThrow(/kekEnrolled/);
    await expect(retrieveUnlockSecretDirect({ kekEnrolled: false })).rejects.toThrow(/kekEnrolled/);
    // No cache read of any shape.
    expect(h.calls).not.toContain('getSecret');
    expect(h.calls).not.toContain('getSecretUnauth');
  });
});
