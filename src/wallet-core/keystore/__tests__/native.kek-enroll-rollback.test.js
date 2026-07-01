// src/wallet-core/keystore/__tests__/native.kek-enroll-rollback.test.js
//
// Audit finding L2 (LOW) — enrollKek must clean up its own hardware credential
// on failure (I4 fail-honest, fail-closed).
//
//   enrollKek() writes the vault's kekWrap via safeWriteVault. The hardware
//   credential (AndroidKeyStore / iOS Keychain) is materialised earlier, when
//   getHardwareFactor() runs. Previously, the rollback that clears that orphaned
//   credential on a mid-enroll failure lived ONLY in the UI catch
//   (HardwareKekSettings.jsx). A NON-UI caller of keyStore.enrollKek that failed
//   after the credential was created got no rollback — a stale credential was left
//   behind (self-heals via the settings reconcile, but the contract should
//   guarantee the cleanup itself).
//
//   Fix: enrollKek clears the hardware credential on ANY failure of its enroll
//   body (getHardwareFactor, combineKek, wrapDek, encrypt, safeWriteVault) before
//   rethrowing — and NEVER on the success path.
//
// Established native mocking pattern mirrors native.kek-unenroll-reconcile.test.js.

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
  // I/O-boundary helpers (real behaviour) so callers can decode a valid kekSalt / parse a blob.
  MALFORMED_VAULT: 'KEK_MALFORMED_VAULT',
  decodeKekSalt: (kekSalt) => {
    if (typeof kekSalt !== 'string' || kekSalt.length === 0) throw new Error('KEK_MALFORMED_VAULT');
    let bin; try { bin = atob(kekSalt); } catch { throw new Error('KEK_MALFORMED_VAULT'); }
    const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out;
  },
  parseVaultBlob: (raw) => {
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw !== 'string') throw new Error('KEK_MALFORMED_VAULT');
    try { return JSON.parse(raw); } catch { throw new Error('KEK_MALFORMED_VAULT'); }
  },
};
vi.mock('../kek.js', () => kekMock);

const clearHardwareCredentialMock = vi.fn(async () => {});
const getHardwareFactorMock = vi.fn(async () => new Uint8Array(32).fill(1));
vi.mock('../hardware.js', () => ({
  getHardwareFactor: getHardwareFactorMock,
  clearHardwareCredential: clearHardwareCredentialMock,
}));

const { nativeKeyStore } = await import('../native.js');

const newHF = () => new Uint8Array(32).fill(1);
const bareVault = () => JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' });

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  // Re-install the key-aware store impls (clearAllMocks wipes them).
  secureStoreMock.get.mockImplementation(async (key) => (store.has(key) ? store.get(key) : null));
  secureStoreMock.set.mockImplementation(async (key, data) => { store.set(key, data); });
  secureStoreMock.remove.mockImplementation(async (key) => { const e = store.has(key); store.delete(key); return e; });
  vaultMock.deriveKekC.mockResolvedValue(new Uint8Array(32).fill(7));
  vaultMock.decryptVault.mockResolvedValue('seed');
  vaultMock.encryptVaultWithDek.mockResolvedValue({ iv: 'iv', ct: 'ct' });
  kekMock.combineKek.mockResolvedValue(new Uint8Array(32).fill(9));
  kekMock.randomDek.mockReturnValue(new Uint8Array(32).fill(3));
  kekMock.wrapDek.mockResolvedValue({ v: 1, iv: 'iv', ct: 'ct' });
});

describe('L2 — enrollKek clears the orphaned hardware credential on failure', () => {
  it('clears the credential when combineKek throws mid-enroll, then rethrows', async () => {
    setVault(bareVault());
    kekMock.combineKek.mockRejectedValueOnce(new Error('combine boom'));

    await expect(
      nativeKeyStore.enrollKek('pw', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow('combine boom');

    // The orphaned AndroidKeyStore/Keychain credential MUST be cleared on failure.
    expect(clearHardwareCredentialMock).toHaveBeenCalledTimes(1);
  });

  it('clears the credential when wrapDek throws mid-enroll, then rethrows', async () => {
    setVault(bareVault());
    kekMock.wrapDek.mockRejectedValueOnce(new Error('wrap boom'));

    await expect(
      nativeKeyStore.enrollKek('pw', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow('wrap boom');

    expect(clearHardwareCredentialMock).toHaveBeenCalledTimes(1);
  });

  it('clears the credential when the durable vault write (safeWriteVault) throws', async () => {
    setVault(bareVault());
    // Make the durable write fail (safeWriteVault ultimately calls SecureStorage.set).
    secureStoreMock.set.mockRejectedValue(new Error('write boom'));

    await expect(
      nativeKeyStore.enrollKek('pw', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow();

    expect(clearHardwareCredentialMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT clear the credential on a successful enroll', async () => {
    setVault(bareVault());

    await nativeKeyStore.enrollKek('pw', { getHardwareFactor: async () => newHF() });

    // Success path must never delete the credential we just enrolled.
    expect(clearHardwareCredentialMock).not.toHaveBeenCalled();
    // And the vault is now KEK-wrapped.
    const written = JSON.parse(store.get(VAULT_KEY));
    expect(written.kekWrap).toBeDefined();
  });

  it('does NOT clear the credential when it fails BEFORE the credential exists (no getHardwareFactor)', async () => {
    setVault(bareVault());

    // No hardware factor supplied → fail-closed throw before any credential is created.
    await expect(nativeKeyStore.enrollKek('pw', {})).rejects.toThrow();

    // Nothing was enrolled, so nothing to roll back.
    expect(clearHardwareCredentialMock).not.toHaveBeenCalled();
  });
});
