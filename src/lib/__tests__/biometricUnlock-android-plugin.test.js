import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  calls: [],
  store: null,
  available: true,
  checkBiometryResult: { isAvailable: true, deviceIsSecure: true },
  authImpl: null,
}));

vi.mock('@/api/demoClient', () => ({ DEMO: false }));
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
}));
vi.mock('@/plugins/androidBiometricCache.js', () => ({
  isAvailable: vi.fn(async () => ({ available: h.available })),
  putSecret: vi.fn(async (secret) => {
    h.calls.push('putSecret');
    h.store = String(secret);
  }),
  getSecret: vi.fn(async () => {
    h.calls.push('getSecret');
    return h.store;
  }),
  // Issue #2037 — dual-alias mocks so the storeUnlockSecret dual-write and
  // (if reached from a legacy-fallback path) the unauth read are exercised
  // without throwing on undefined exports. This test file pins the LEGACY
  // (non-KEK) retrieveUnlockSecret path, which must NOT touch getSecretUnauth
  // — the KEK-direct path is pinned separately in
  // biometricUnlock.kekSinglePrompt.test.js.
  putSecretUnauth: vi.fn(async (secret) => {
    h.calls.push('putSecretUnauth');
    h.store = String(secret);
  }),
  getSecretUnauth: vi.fn(async () => {
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
vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: {
    checkBiometry: vi.fn(async () => h.checkBiometryResult),
    authenticate: vi.fn(async (opts) => {
      h.calls.push('authenticate');
      if (h.authImpl) return h.authImpl(opts);
      return undefined;
    }),
  },
}));

import {
  storeUnlockSecret,
  retrieveUnlockSecret,
  hasStoredUnlockSecret,
  clearUnlockSecret,
} from '@/lib/biometricUnlock';

beforeEach(() => {
  h.calls.length = 0;
  h.store = null;
  h.available = true;
  h.checkBiometryResult = { isAvailable: true, deviceIsSecure: true };
  h.authImpl = null;
  vi.clearAllMocks();
});

describe('biometricUnlock — Android custom plugin path', () => {
  it('stores, reads, checks presence, and clears via the Android plugin', async () => {
    expect(await storeUnlockSecret('android-secret')).toBe(true);
    expect(await hasStoredUnlockSecret()).toBe(true);
    expect(await retrieveUnlockSecret()).toBe('android-secret');
    await clearUnlockSecret();
    expect(await hasStoredUnlockSecret()).toBe(false);

    expect(h.calls).toContain('putSecret');
    expect(h.calls).toContain('hasSecret');
    expect(h.calls).toContain('authenticate');
    expect(h.calls).toContain('getSecret');
    expect(h.calls).toContain('clearSecret');
  });

  it('never reads the secret before the OS biometric gate', async () => {
    await storeUnlockSecret('android-secret');
    await retrieveUnlockSecret();
    expect(h.calls.indexOf('authenticate')).toBeLessThan(h.calls.indexOf('getSecret'));
  });

  it('returns null after the plugin-wiped cache', async () => {
    expect(await retrieveUnlockSecret()).toBe(null);
    expect(h.calls).toContain('authenticate');
    expect(h.calls).toContain('getSecret');
  });
});
