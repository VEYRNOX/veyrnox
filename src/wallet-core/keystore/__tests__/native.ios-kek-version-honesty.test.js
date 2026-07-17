// src/wallet-core/keystore/__tests__/native.ios-kek-version-honesty.test.js
//
// Issue #1103 — iOS `hardwareKekVersion:3` overclaim.
//
// The v3 protocol fix (2026-07-05) was defined as per-enrollment `kekSalt`
// binding: the plugin derives H from HMAC(SE_KEY, kekSalt), so each vault gets
// a distinct H. That is a correct description of the Android StrongBox path.
//
// The iOS Secure Enclave plugin does NOT consume `kekSalt`. It generates a
// random 32-byte H and ECIES-wraps it under an SE key. The wrap IS
// device-bound (SE key never leaves the enclave) but H is not `kekSalt`-bound
// in the v3 sense. Stamping `hardwareKekVersion:3` on iOS enrollments is
// honesty-misleading (I4).
//
// Approach (a): on iOS, stamp `hardwareKekVersion: 'ios-se-v1'` — a distinct
// tag that cannot be confused with the numeric `=== 3` salt-bound check
// (`hfOptsForBlob` returns undefined for it, which is honest because iOS
// getHardwareFactor already ignores kekSalt). Android is unaffected — v3
// stays 3.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const VAULT_KEY = 'vault_v1';
const store = new Map();
const setVault = (v) => { if (v === null || v === undefined) store.delete(VAULT_KEY); else store.set(VAULT_KEY, v); };
const secureStoreMock = {
  setKeyPrefix: vi.fn(async () => {}),
  setSynchronize: vi.fn(async () => {}),
  setDefaultKeychainAccess: vi.fn(async () => {}),
  get: vi.fn(async (key) => (store.has(key) ? store.get(key) : null)),
  set: vi.fn(async (key, data) => { store.set(key, data); }),
  remove: vi.fn(async (key) => { const e = store.has(key); store.delete(key); return e; }),
};
vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: secureStoreMock,
  KeychainAccess: { whenPasscodeSetThisDeviceOnly: 'x', whenUnlockedThisDeviceOnly: 'x' },
}));

const getPlatformMock = vi.fn(() => 'ios');
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: getPlatformMock },
}));

vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: {
    checkBiometry: vi.fn(async () => ({ isAvailable: true, deviceIsSecure: true })),
    authenticate: vi.fn(async () => {}),
  },
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));

const vaultMock = {
  encryptVault: vi.fn(async () => ({ v: 1, kdf: 'argon2id', salt: 's', iv: 'iv', ct: 'ct' })),
  decryptVault: vi.fn(async () => 'seed'),
  deriveKekC: vi.fn(async () => new Uint8Array(32).fill(7)),
  encryptVaultWithDek: vi.fn(async () => ({ iv: 'iv', ct: 'ct' })),
  decryptVaultWithDek: vi.fn(async () => 'seed'),
};
vi.mock('../../vault.js', () => vaultMock);

vi.mock('../kek.js', () => ({
  combineKek: vi.fn(async () => new Uint8Array(32).fill(9)),
  randomDek: vi.fn(() => new Uint8Array(32).fill(3)),
  wrapDek: vi.fn(async () => ({ v: 1, iv: 'iv', ct: 'ct' })),
  unwrapDek: vi.fn(async () => new Uint8Array(32).fill(4)),
  decodeKekSalt: vi.fn((s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))),
  parseVaultBlob: vi.fn((raw) => (typeof raw === 'string' ? JSON.parse(raw) : raw)),
  KEK_ERR: { NO_HARDWARE_FACTOR: 'NO_HARDWARE_FACTOR', UNWRAP_FAILED: 'UNWRAP_FAILED', MALFORMED_VAULT: 'MALFORMED_VAULT', NOT_ENROLLED: 'KEK_NOT_ENROLLED' },
}));

vi.mock('../hardware.js', () => ({
  getHardwareFactor: vi.fn(async () => new Uint8Array(32).fill(1)),
  clearHardwareCredential: vi.fn(async () => {}),
}));

const { nativeKeyStore } = await import('../native.js');

const bareVault = () => JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' });
const newHF = () => new Uint8Array(32).fill(1);

beforeEach(() => {
  store.clear();
  secureStoreMock.get.mockImplementation(async (key) => (store.has(key) ? store.get(key) : null));
  secureStoreMock.set.mockImplementation(async (key, data) => { store.set(key, data); });
  secureStoreMock.remove.mockImplementation(async (key) => { const e = store.has(key); store.delete(key); return e; });
  getPlatformMock.mockReset();
});

describe('#1103 — iOS enrollments stamp an honest hardwareKekVersion tag', () => {
  it('enrollKek on iOS stamps hardwareKekVersion:"ios-se-v1" (NOT the salt-bound "3")', async () => {
    getPlatformMock.mockReturnValue('ios');
    setVault(bareVault());

    await nativeKeyStore.enrollKek('pw', { getHardwareFactor: async () => newHF() });

    const written = JSON.parse(store.get(VAULT_KEY));
    expect(written.kekWrap).toBeDefined();
    expect(written.hardwareKekVersion).toBe('ios-se-v1');
    // Reading via the public accessor must surface the honest tag.
    expect(await nativeKeyStore.getVaultKekVersion()).toBe('ios-se-v1');
  });

  it('enrollKek on Android stamps hardwareKekVersion:3 (unchanged — salt-bound)', async () => {
    getPlatformMock.mockReturnValue('android');
    setVault(bareVault());

    await nativeKeyStore.enrollKek('pw', { getHardwareFactor: async () => newHF() });

    const written = JSON.parse(store.get(VAULT_KEY));
    expect(written.hardwareKekVersion).toBe(3);
    expect(await nativeKeyStore.getVaultKekVersion()).toBe(3);
  });

  it('upgradeKekToV3 on an iOS "ios-se-v1" blob is idempotent (no-op, no biometric prompt)', async () => {
    getPlatformMock.mockReturnValue('ios');
    // Existing iOS-enrolled blob.
    setVault(JSON.stringify({
      v: 1, kdf: 'kek-dek', salt: 's', iv: 'iv', ct: 'ct',
      kekWrap: { v: 1, iv: 'iv', ct: 'ct' },
      kekSalt: btoa('s'.repeat(32)),
      hardwareKekVersion: 'ios-se-v1',
    }));

    const getHF = vi.fn(async () => newHF());
    const res = await nativeKeyStore.upgradeKekToV3('pw', { getHardwareFactor: getHF });

    // No hardware prompt fired; treated as already-honest.
    expect(getHF).not.toHaveBeenCalled();
    expect(res.upgraded).toBe(false);
  });
});
