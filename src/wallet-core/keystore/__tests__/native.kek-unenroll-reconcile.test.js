// src/wallet-core/keystore/__tests__/native.kek-unenroll-reconcile.test.js
//
// Enrollment-state divergence bug (I4 fail-honest, fail-closed).
//
// Fix A — unenrollKek must NEVER leave a stale AndroidKeyStore alias behind.
//   Old behaviour: `if (!blob.kekWrap) return;` early-returned on an already-bare
//   vault WITHOUT clearing the Keystore credential, so a stale alias survived and
//   isHardwareEnrolled() kept reporting "ON" forever (a false, un-removable badge).
//   Correct: a bare vault needs no hardware key, so unenroll must still call
//   clearHardwareCredential() (idempotent — plugin guards on containsAlias) and return.
//
// Fix B — the enrolled signal must reflect REAL protection (alias AND vault kekWrap),
//   not alias-presence alone. hasVaultKekWrap() reads vault metadata only (no secret,
//   no biometric prompt) so the badge can reconcile alias-present + vault-bare to OFF.
//
// Established native mocking pattern mirrors native.kek-zeroing.test.js.

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const clearHardwareCredentialMock = vi.fn(async () => {});
vi.mock('../hardware.js', () => ({
  getHardwareFactor: vi.fn(async () => new Uint8Array(32).fill(1)),
  clearHardwareCredential: clearHardwareCredentialMock,
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
  kekMock.combineKek.mockResolvedValue(new Uint8Array(32).fill(9));
  kekMock.unwrapDek.mockResolvedValue(new Uint8Array(32).fill(4));
  secureStoreMock.set.mockResolvedValue(undefined);
});

describe('Fix A — unenrollKek clears the stale alias on an already-bare vault', () => {
  it('calls clearHardwareCredential even when blob.kekWrap is absent', async () => {
    // Vault is already bare (no kekWrap) but a stale Keystore alias may survive.
    secureStoreMock.get.mockResolvedValue(JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' }));

    await nativeKeyStore.unenrollKek('pw', { getHardwareFactor: async () => newHF() });

    // The alias MUST be cleared so isHardwareEnrolled() stops reporting "ON".
    expect(clearHardwareCredentialMock).toHaveBeenCalledTimes(1);
    // A bare vault needs no re-wrap; the vault blob must NOT be rewritten.
    expect(secureStoreMock.set).not.toHaveBeenCalled();
  });
});

describe('Fix A regression — unenrollKek normal path still re-wraps bare AND clears key', () => {
  it('re-encrypts bare, persists, then clears the credential, zeroing key material', async () => {
    let kek, dek;
    kekMock.combineKek.mockImplementation(async () => { kek = new Uint8Array(32).fill(9); return kek; });
    kekMock.unwrapDek.mockImplementation(async () => { dek = new Uint8Array(32).fill(4); return dek; });
    secureStoreMock.get.mockResolvedValue(JSON.stringify({ iv: 'x', ct: 'y', kekWrap: { v: 1 }, kekSalt }));

    await nativeKeyStore.unenrollKek('pw', { getHardwareFactor: async () => newHF() });

    // bare re-write happened, then credential cleared
    expect(secureStoreMock.set).toHaveBeenCalledTimes(1);
    expect(clearHardwareCredentialMock).toHaveBeenCalledTimes(1);
    // zeroing preserved
    expect(isAllZero(kek)).toBe(true);
    expect(isAllZero(dek)).toBe(true);
  });
});

describe('Fix B — hasVaultKekWrap reconciles the enrolled signal (metadata only)', () => {
  it('returns true when the stored vault has a kekWrap', async () => {
    secureStoreMock.get.mockResolvedValue(JSON.stringify({ iv: 'x', ct: 'y', kekWrap: { v: 1 }, kekSalt }));
    expect(await nativeKeyStore.hasVaultKekWrap()).toBe(true);
  });

  it('returns false when the vault is bare (alias-present + vault-bare divergence → OFF)', async () => {
    secureStoreMock.get.mockResolvedValue(JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' }));
    expect(await nativeKeyStore.hasVaultKekWrap()).toBe(false);
  });

  it('returns false when there is no vault at all', async () => {
    secureStoreMock.get.mockResolvedValue(null);
    expect(await nativeKeyStore.hasVaultKekWrap()).toBe(false);
  });
});
