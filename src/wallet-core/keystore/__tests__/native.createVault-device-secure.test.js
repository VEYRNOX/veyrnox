// src/wallet-core/keystore/__tests__/native.createVault-device-secure.test.js
//
// Issue #1100 — createVault must fail-closed (I4) when the device has no
// passcode / screen lock (`deviceIsSecure === false`).
//
// The iOS `whenUnlockedThisDeviceOnly` ACL (and Android StrongBox) assumes a
// device credential exists to provide the attacker friction. If the user has
// no device passcode, we must refuse vault creation with a stable error code
// (DEVICE_NOT_SECURE) that the UI can surface as "please set a device
// passcode" — never silently create a vault that has no OS-level friction.
//
// Established native mocking pattern.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const VAULT_KEY = 'vault_v1';
const store = new Map();
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
  KeychainAccess: { whenPasscodeSetThisDeviceOnly: 'whenPasscodeSetThisDeviceOnly', whenUnlockedThisDeviceOnly: 'whenUnlockedThisDeviceOnly' },
}));

const checkBiometryMock = vi.fn(async () => ({ isAvailable: true, deviceIsSecure: true }));
vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: {
    checkBiometry: checkBiometryMock,
    authenticate: vi.fn(async () => {}),
  },
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));

vi.mock('../../vault.js', () => ({
  encryptVault: vi.fn(async () => ({ v: 1, kdf: 'argon2id', salt: 's', iv: 'iv', ct: 'ct' })),
  decryptVault: vi.fn(async () => 'seed'),
  deriveKekC: vi.fn(async () => new Uint8Array(32)),
  encryptVaultWithDek: vi.fn(async () => ({ iv: 'iv', ct: 'ct' })),
  decryptVaultWithDek: vi.fn(async () => 'seed'),
}));
vi.mock('../kek.js', () => ({
  combineKek: vi.fn(async () => new Uint8Array(32)),
  randomDek: vi.fn(() => new Uint8Array(32)),
  wrapDek: vi.fn(async () => ({})),
  unwrapDek: vi.fn(async () => new Uint8Array(32)),
  decodeKekSalt: vi.fn((s) => new Uint8Array(32)),
  parseVaultBlob: vi.fn((raw) => (typeof raw === 'string' ? JSON.parse(raw) : raw)),
  KEK_ERR: { NO_HARDWARE_FACTOR: 'NO_HARDWARE_FACTOR', UNWRAP_FAILED: 'UNWRAP_FAILED', MALFORMED_VAULT: 'MALFORMED_VAULT' },
}));
vi.mock('../hardware.js', () => ({
  getHardwareFactor: vi.fn(),
  clearHardwareCredential: vi.fn(async () => {}),
}));

const { nativeKeyStore } = await import('../native.js');

beforeEach(() => {
  store.clear();
  checkBiometryMock.mockReset();
  secureStoreMock.set.mockClear();
});

describe('#1100 — createVault refuses when the device has no passcode (deviceIsSecure=false)', () => {
  it('throws DEVICE_NOT_SECURE when the device has no passcode/biometric set', async () => {
    checkBiometryMock.mockResolvedValue({ isAvailable: false, deviceIsSecure: false });

    await expect(nativeKeyStore.createVault('seed', 'password12345')).rejects.toMatchObject({
      code: 'DEVICE_NOT_SECURE',
    });
    // Nothing must have been persisted (fail-closed).
    expect(store.has(VAULT_KEY)).toBe(false);
  });

  it('proceeds when the device has a passcode/biometric (deviceIsSecure=true)', async () => {
    checkBiometryMock.mockResolvedValue({ isAvailable: true, deviceIsSecure: true });

    await nativeKeyStore.createVault('seed', 'password12345');
    expect(store.has(VAULT_KEY)).toBe(true);
  });

  it('throws DEVICE_NOT_SECURE even when biometric is available but deviceIsSecure=false (Android edge case)', async () => {
    // Rare but possible: sensor present, no lockscreen set.
    checkBiometryMock.mockResolvedValue({ isAvailable: true, deviceIsSecure: false });

    await expect(nativeKeyStore.createVault('seed', 'password12345')).rejects.toMatchObject({
      code: 'DEVICE_NOT_SECURE',
    });
    expect(store.has(VAULT_KEY)).toBe(false);
  });
});
