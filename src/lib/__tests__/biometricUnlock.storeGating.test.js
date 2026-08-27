// biometricUnlock.storeGating.test.js
//
// C1 (issue #2039 follow-up) — the dual-write to the unauth Keystore alias in
// storeUnlockSecret() must be gated on `keyStore.hasVaultKekWrap() === true`.
//
// Why it matters: the unauth alias is a Keystore key built WITHOUT
// setUserAuthenticationRequired(true), so its read path does NOT prompt for a
// biometric. On a KEK vault the cached PIN is only the C-factor and DEK =
// HKDF(H ‖ C), so C alone is useless — the alias is safe there. On a NON-KEK
// vault the cached PIN IS the vault password, so writing it to the unauth
// alias sits it in a Keystore entry an attacker with device + own enrolled
// biometric + any JS reach can pull with no OS prompt.
//
// Contract this pins:
//   - storeUnlockSecret() on a NON-KEK vault MUST call putSecret (auth-gated)
//     and MUST NOT call putSecretUnauth.
//   - storeUnlockSecret() on a KEK-wrapped vault MUST call both.
//   - hasVaultKekWrap() is consulted at write time, not caller-attested.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  calls: [],
  kekWrapped: false,
}));

vi.mock('@/api/demoClient', () => ({ DEMO: false }));
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
}));

vi.mock('@/plugins/androidBiometricCache.js', () => ({
  isAvailable: vi.fn(async () => ({ available: true })),
  putSecret: vi.fn(async () => { h.calls.push('putSecret'); }),
  putSecretUnauth: vi.fn(async () => { h.calls.push('putSecretUnauth'); }),
  getSecret: vi.fn(async () => null),
  getSecretUnauth: vi.fn(async () => null),
  hasSecret: vi.fn(async () => false),
  clearSecret: vi.fn(async () => { h.calls.push('clearSecret'); }),
}));

vi.mock('@/wallet-core/keystore', () => ({
  getKeyStore: () => ({
    hasVaultKekWrap: vi.fn(async () => h.kekWrapped),
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

import { storeUnlockSecret } from '@/lib/biometricUnlock';

beforeEach(() => {
  h.calls.length = 0;
  h.kekWrapped = false;
  vi.clearAllMocks();
});

describe('C1 — storeUnlockSecret gates the unauth-alias dual-write on hasVaultKekWrap()', () => {
  it('non-KEK vault: writes ONLY the auth-gated alias (no putSecretUnauth call)', async () => {
    h.kekWrapped = false;
    await storeUnlockSecret('pin-1234');
    expect(h.calls).toContain('putSecret');
    // The whole point of C1: no unauth-alias write when the SOLE biometric
    // gate would otherwise be defeated by that alias's read path.
    expect(h.calls).not.toContain('putSecretUnauth');
  });

  it('KEK-wrapped vault: writes BOTH aliases (auth-gated + unauth) so the direct read path finds the secret', async () => {
    h.kekWrapped = true;
    await storeUnlockSecret('pin-1234');
    expect(h.calls).toContain('putSecret');
    expect(h.calls).toContain('putSecretUnauth');
  });

  it('hasVaultKekWrap() failing (thrown) is treated as NOT wrapped (fail-closed: no unauth write)', async () => {
    // Fail-closed against a keystore probe failure: mint no unauth-alias
    // material rather than assume KEK.
    const { getKeyStore } = await import('@/wallet-core/keystore');
    getKeyStore().hasVaultKekWrap = vi.fn(async () => { throw new Error('probe io'); });
    await storeUnlockSecret('pin-1234');
    expect(h.calls).toContain('putSecret');
    expect(h.calls).not.toContain('putSecretUnauth');
  });
});
