// src/wallet-core/keystore/__tests__/native.kek-zeroing.test.js
//
// H-NEW-6b — the native KeyStore must wipe ALL derived key material (the combined
// KEK, the hardware factor H, the set factor C, the salt bytes, and the recovered/
// generated DEK) on EVERY path, including error paths, exactly like web.js
// (H-NEW-6, PRs #418/#420). Prior to this change native.js never .fill(0)'d these
// Uint8Arrays, so on any throw (or even success) the plaintext KEK/H/C/DEK lingered
// in the JS heap until GC (readable in a heap dump / via Frida) — the same leak the
// web path already closed (I4: fail honest, fail closed).
//
// We capture the actual Uint8Array(s) handed to / returned by the mocked crypto,
// force a later step to throw where relevant, and assert each array is all-zeros
// after the call settles. Behavioural, not implementation-coupled — we assert on
// the captured arrays, never on internal call counts.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- native plugin + helper mocks (native.js never runs its real bridges in tests) ---
const secureStoreMock = {
  setKeyPrefix: vi.fn(async () => {}),
  setSynchronize: vi.fn(async () => {}),
  setDefaultKeychainAccess: vi.fn(async () => {}),
  get: vi.fn(async () => null),
  set: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
};
vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: secureStoreMock,
  KeychainAccess: { whenPasscodeSetThisDeviceOnly: 'whenPasscodeSetThisDeviceOnly' },
}));
vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: {
    checkBiometry: vi.fn(async () => ({ isAvailable: true, deviceIsSecure: true })),
    authenticate: vi.fn(async () => {}),
  },
}));
vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn() },
}));

const vaultMock = {
  encryptVault: vi.fn(async () => ({ v: 1, kdf: 'argon2id', salt: 's', iv: 'iv', ct: 'ct' })),
  decryptVault: vi.fn(async () => 'seed'),
  deriveKekC: vi.fn(async () => new Uint8Array(32).fill(7)),
  encryptVaultWithDek: vi.fn(async () => ({ iv: 'iv', ct: 'ct' })),
  decryptVaultWithDek: vi.fn(async () => 'seed'),
};
vi.mock('../../vault.js', () => vaultMock);

const kekMock = {
  combineKek: vi.fn(async () => new Uint8Array(32).fill(9)),
  randomDek: vi.fn(() => new Uint8Array(32).fill(3)),
  wrapDek: vi.fn(async () => ({ v: 1, iv: 'iv', ct: 'ct' })),
  unwrapDek: vi.fn(async () => new Uint8Array(32).fill(4)),
  KEK_ERR: { NO_HARDWARE_FACTOR: 'NO_HARDWARE_FACTOR', UNWRAP_FAILED: 'UNWRAP_FAILED' },
};
vi.mock('../kek.js', () => kekMock);

vi.mock('../hardware.js', () => ({
  getHardwareFactor: vi.fn(async () => new Uint8Array(32).fill(1)),
  clearHardwareCredential: vi.fn(async () => {}),
}));

const { nativeKeyStore } = await import('../native.js');

const isAllZero = (u8) => u8.every((b) => b === 0);
const kekSalt = btoa('s'.repeat(32));
const newHF = () => new Uint8Array(32).fill(1);

beforeEach(() => {
  vi.clearAllMocks();
  vaultMock.deriveKekC.mockResolvedValue(new Uint8Array(32).fill(7));
  vaultMock.decryptVault.mockResolvedValue('seed');
  vaultMock.decryptVaultWithDek.mockResolvedValue('seed');
  vaultMock.encryptVault.mockResolvedValue({ v: 1, kdf: 'argon2id', salt: 's', iv: 'iv', ct: 'ct' });
  vaultMock.encryptVaultWithDek.mockResolvedValue({ iv: 'iv', ct: 'ct' });
  kekMock.combineKek.mockResolvedValue(new Uint8Array(32).fill(9));
  kekMock.randomDek.mockReturnValue(new Uint8Array(32).fill(3));
  kekMock.unwrapDek.mockResolvedValue(new Uint8Array(32).fill(4));
  kekMock.wrapDek.mockResolvedValue({ v: 1, iv: 'iv', ct: 'ct' });
  secureStoreMock.get.mockResolvedValue(null);
  secureStoreMock.set.mockResolvedValue(undefined);
});

describe('_unlockInner (KEK vault) — key material zeroed', () => {
  it('zeroes the kek when unwrapDek throws', async () => {
    let kek;
    kekMock.combineKek.mockImplementation(async () => {
      kek = new Uint8Array(32).fill(9);
      return kek;
    });
    secureStoreMock.get.mockResolvedValue(JSON.stringify({ iv: 'x', ct: 'y', kekWrap: { v: 1 }, kekSalt }));
    kekMock.unwrapDek.mockRejectedValue(new Error('unwrap-fail'));

    await expect(
      nativeKeyStore.unlock('pw', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow('unwrap-fail');

    expect(kek).toBeDefined();
    expect(isAllZero(kek)).toBe(true);
  });

  it('zeroes H, C and the dek on the success path', async () => {
    let H, C, kek, dek;
    const hf = newHF();
    H = hf;
    C = new Uint8Array(32).fill(7);
    vaultMock.deriveKekC.mockResolvedValue(C);
    kekMock.combineKek.mockImplementation(async () => {
      kek = new Uint8Array(32).fill(9);
      return kek;
    });
    kekMock.unwrapDek.mockImplementation(async () => {
      dek = new Uint8Array(32).fill(4);
      return dek;
    });
    secureStoreMock.get.mockResolvedValue(JSON.stringify({ iv: 'x', ct: 'y', kekWrap: { v: 1 }, kekSalt }));

    await nativeKeyStore.unlock('pw', { getHardwareFactor: async () => hf });

    expect(isAllZero(H)).toBe(true);
    expect(isAllZero(C)).toBe(true);
    expect(isAllZero(kek)).toBe(true);
    expect(isAllZero(dek)).toBe(true);
  });
});

describe('enrollKek — key material zeroed', () => {
  it('zeroes the kek and dek when wrapDek throws', async () => {
    let kek, dek;
    kekMock.combineKek.mockImplementation(async () => {
      kek = new Uint8Array(32).fill(9);
      return kek;
    });
    kekMock.randomDek.mockImplementation(() => {
      dek = new Uint8Array(32).fill(3);
      return dek;
    });
    secureStoreMock.get.mockResolvedValue(JSON.stringify({ iv: 'x', ct: 'y' }));
    kekMock.wrapDek.mockRejectedValue(new Error('wrap-fail'));

    await expect(
      nativeKeyStore.enrollKek('pw', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow('wrap-fail');

    expect(kek).toBeDefined();
    expect(isAllZero(kek)).toBe(true);
    expect(dek).toBeDefined();
    expect(isAllZero(dek)).toBe(true);
  });
});

describe('unenrollKek — key material zeroed', () => {
  it('zeroes the kek when unwrapDek throws', async () => {
    let kek;
    kekMock.combineKek.mockImplementation(async () => {
      kek = new Uint8Array(32).fill(9);
      return kek;
    });
    secureStoreMock.get.mockResolvedValue(JSON.stringify({ iv: 'x', ct: 'y', kekWrap: { v: 1 }, kekSalt }));
    kekMock.unwrapDek.mockRejectedValue(new Error('unwrap-fail'));

    await expect(
      nativeKeyStore.unenrollKek('pw', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow('unwrap-fail');

    expect(kek).toBeDefined();
    expect(isAllZero(kek)).toBe(true);
  });
});

describe('changePassword (KEK vault) — key material zeroed', () => {
  it('zeroes the oldKek when unwrapDek throws', async () => {
    let oldKek;
    kekMock.combineKek.mockImplementationOnce(async () => {
      oldKek = new Uint8Array(32).fill(9);
      return oldKek;
    });
    secureStoreMock.get.mockResolvedValue(JSON.stringify({ iv: 'x', ct: 'y', kekWrap: { v: 1 }, kekSalt }));
    kekMock.unwrapDek.mockRejectedValue(new Error('unwrap-fail'));

    await expect(
      nativeKeyStore.changePassword('old', 'new', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow('unwrap-fail');

    expect(oldKek).toBeDefined();
    expect(isAllZero(oldKek)).toBe(true);
  });

  it('zeroes the newKek and dek when wrapDek throws', async () => {
    let newKek, dek;
    kekMock.combineKek
      .mockImplementationOnce(async () => new Uint8Array(32).fill(9)) // oldKek
      .mockImplementationOnce(async () => {
        newKek = new Uint8Array(32).fill(8);
        return newKek;
      });
    kekMock.unwrapDek.mockImplementation(async () => {
      dek = new Uint8Array(32).fill(4);
      return dek;
    });
    secureStoreMock.get.mockResolvedValue(JSON.stringify({ iv: 'x', ct: 'y', kekWrap: { v: 1 }, kekSalt }));
    kekMock.wrapDek.mockRejectedValue(new Error('rewrap-fail'));

    await expect(
      nativeKeyStore.changePassword('old', 'new', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow('rewrap-fail');

    expect(newKek).toBeDefined();
    expect(isAllZero(newKek)).toBe(true);
    expect(dek).toBeDefined();
    expect(isAllZero(dek)).toBe(true);
  });
});
