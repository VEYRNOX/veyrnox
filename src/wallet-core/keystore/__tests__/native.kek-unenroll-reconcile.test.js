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

// Key-aware store so safeWriteVault's journaled write + read-back-verify works.
// `store` is the real backing map; `setVault(x)` seeds the initial VAULT_KEY blob.
const VAULT_KEY = 'vault_v1';
const NEXT_KEY = 'vault_v1.next';
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
  store.clear();
  // Re-install the key-aware store impls (clearAllMocks wipes them).
  secureStoreMock.get.mockImplementation(async (key) => (store.has(key) ? store.get(key) : null));
  secureStoreMock.set.mockImplementation(async (key, data) => { store.set(key, data); });
  secureStoreMock.remove.mockImplementation(async (key) => { const e = store.has(key); store.delete(key); return e; });
  vaultMock.deriveKekC.mockResolvedValue(new Uint8Array(32).fill(7));
  vaultMock.decryptVault.mockResolvedValue('seed');
  vaultMock.decryptVaultWithDek.mockResolvedValue('seed');
  vaultMock.encryptVault.mockResolvedValue({ v: 1, kdf: 'argon2id', salt: 's', iv: 'iv', ct: 'ct' });
  kekMock.combineKek.mockResolvedValue(new Uint8Array(32).fill(9));
  kekMock.unwrapDek.mockResolvedValue(new Uint8Array(32).fill(4));
});

describe('Fix A — unenrollKek clears the stale alias on an already-bare vault', () => {
  it('calls clearHardwareCredential even when blob.kekWrap is absent', async () => {
    // Vault is already bare (no kekWrap) but a stale Keystore alias may survive.
    setVault(JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' }));

    await nativeKeyStore.unenrollKek('pw', { getHardwareFactor: async () => newHF() });

    // The alias MUST be cleared so isHardwareEnrolled() stops reporting "ON".
    expect(clearHardwareCredentialMock).toHaveBeenCalledTimes(1);
    // A bare vault needs no re-wrap; the vault blob must NOT be rewritten (no set to VAULT_KEY).
    expect(secureStoreMock.set).not.toHaveBeenCalledWith(VAULT_KEY, expect.anything());
  });
});

describe('Fix A regression — unenrollKek normal path still re-wraps bare AND clears key', () => {
  it('re-encrypts bare, persists, then clears the credential, zeroing key material', async () => {
    let kek, dek;
    kekMock.combineKek.mockImplementation(async () => { kek = new Uint8Array(32).fill(9); return kek; });
    kekMock.unwrapDek.mockImplementation(async () => { dek = new Uint8Array(32).fill(4); return dek; });
    setVault(JSON.stringify({ iv: 'x', ct: 'y', kekWrap: { v: 1 }, kekSalt }));

    await nativeKeyStore.unenrollKek('pw', { getHardwareFactor: async () => newHF() });

    // bare re-write happened (durably persisted to VAULT_KEY), then credential cleared
    const bare = JSON.parse(store.get(VAULT_KEY));
    expect(bare.kekWrap).toBeUndefined();
    expect(clearHardwareCredentialMock).toHaveBeenCalledTimes(1);
    // zeroing preserved
    expect(isAllZero(kek)).toBe(true);
    expect(isAllZero(dek)).toBe(true);
  });
});

describe('Fix B — hasVaultKekWrap reconciles the enrolled signal (metadata only)', () => {
  it('returns true when the stored vault has a kekWrap', async () => {
    setVault(JSON.stringify({ iv: 'x', ct: 'y', kekWrap: { v: 1 }, kekSalt }));
    expect(await nativeKeyStore.hasVaultKekWrap()).toBe(true);
  });

  it('returns false when the vault is bare (alias-present + vault-bare divergence → OFF)', async () => {
    setVault(JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' }));
    expect(await nativeKeyStore.hasVaultKekWrap()).toBe(false);
  });

  it('returns false when there is no vault at all', async () => {
    setVault(null);
    expect(await nativeKeyStore.hasVaultKekWrap()).toBe(false);
  });
});
