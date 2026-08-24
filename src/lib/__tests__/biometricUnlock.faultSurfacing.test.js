// biometricUnlock.faultSurfacing.test.js
//
// H2 (issue #2039 follow-up) — nativeReadSecretUnauth() must distinguish
// "cache not present" (a null return from the plugin) from "Keystore fault"
// (a THROW: corrupt entry, alias clash, KeyPermanentlyInvalidatedException).
// The current code catches every throw and silently falls through to the
// auth-gated legacy read, so a corrupt unauth alias stays wedged and the
// migration re-persist retries every unlock — a permanent silent fault.
//
// Contract this pins:
//   - getSecretUnauth resolving to null → fall through to legacy read.
//   - getSecretUnauth THROWING → clearSecret() (wipes BOTH aliases per the
//     Kotlin plugin) AND surface the error (not swallowed).

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  calls: [],
  store: null,
  unauthThrow: null,
  unauthReturn: null,
  kekWrapped: true,
}));

vi.mock('@/api/demoClient', () => ({ DEMO: false }));
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
}));
vi.mock('@/wallet-core/keystore', () => ({
  getKeyStore: () => ({ hasVaultKekWrap: vi.fn(async () => h.kekWrapped) }),
}));

vi.mock('@/plugins/androidBiometricCache.js', () => ({
  isAvailable: vi.fn(async () => ({ available: true })),
  putSecret: vi.fn(async () => { h.calls.push('putSecret'); }),
  putSecretUnauth: vi.fn(async () => { h.calls.push('putSecretUnauth'); }),
  getSecret: vi.fn(async () => {
    h.calls.push('getSecret');
    return h.store;
  }),
  getSecretUnauth: vi.fn(async () => {
    h.calls.push('getSecretUnauth');
    if (h.unauthThrow) throw h.unauthThrow;
    return h.unauthReturn;
  }),
  hasSecret: vi.fn(async () => h.store != null),
  clearSecret: vi.fn(async () => {
    h.calls.push('clearSecret');
    h.store = null;
  }),
}));

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  KeychainAccess: { whenPasscodeSetThisDeviceOnly: 4 },
  SecureStorage: {
    setKeyPrefix: vi.fn(async () => {}),
    setSynchronize: vi.fn(async () => {}),
    setDefaultKeychainAccess: vi.fn(async () => {}),
    set: vi.fn(async () => {}),
    get: vi.fn(async () => null),
    keys: vi.fn(async () => []),
    remove: vi.fn(async () => {}),
  },
}));

vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: {
    checkBiometry: vi.fn(async () => ({ isAvailable: true, deviceIsSecure: true })),
    authenticate: vi.fn(async () => {}),
  },
}));

import { storeUnlockSecret, retrieveUnlockSecretDirect } from '@/lib/biometricUnlock';

beforeEach(() => {
  h.calls.length = 0;
  h.store = null;
  h.unauthThrow = null;
  h.unauthReturn = null;
  h.kekWrapped = true;
  vi.clearAllMocks();
});

describe('H2 — nativeReadSecretUnauth distinguishes not-present from Keystore fault', () => {
  it('getSecretUnauth returning null: falls through to legacy read (migration path unchanged)', async () => {
    await storeUnlockSecret('pin-1234');
    // Explicitly null-return from the unauth alias.
    h.unauthReturn = null;
    const out = await retrieveUnlockSecretDirect({ kekEnrolled: true });
    expect(out).toBe('pin-1234');
    expect(h.calls).toContain('getSecretUnauth');
    expect(h.calls).toContain('getSecret'); // legacy fallback ran
    expect(h.calls).not.toContain('clearSecret'); // do NOT wipe on absence
  });

  it('getSecretUnauth throwing: wipes BOTH aliases via clearSecret() and surfaces the error', async () => {
    await storeUnlockSecret('pin-1234');
    h.unauthThrow = Object.assign(new Error('KeyPermanentlyInvalidatedException'), {
      code: 'ANDROID_BIOMETRIC_CACHE_READ_FAILED',
    });
    await expect(
      retrieveUnlockSecretDirect({ kekEnrolled: true }),
    ).rejects.toThrow();
    // clearSecret is the sweep of both aliases per Kotlin plugin's
    // clearAllState() — surface the fault, don't retry silently.
    expect(h.calls).toContain('clearSecret');
    // MUST NOT silently fall through to the legacy read on a fault.
    expect(h.calls).not.toContain('getSecret');
  });
});
