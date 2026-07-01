// src/wallet-core/keystore/__tests__/native.kek-preserving-repersist.test.js
//
// KEK DOWNGRADE-ON-REPERSIST bug (device-confirmed, Pixel 10 Pro XL; I4 fail-closed).
//
// ROOT CAUSE: WalletProvider re-persists the primary container on unlock and on
// seed add/remove/import via keyStore.createVault(), which writes a BARE argon2id
// vault (encryptVault) and does NOT preserve kekWrap. So immediately after a KEK
// unlock the vault is rewritten bare, clobbering the KEK wrap → the badge flips OFF.
//
// FIX: a KEK-PRESERVING content re-persist. When the stored vault is KEK-wrapped,
// re-persisting new plaintext must keep the kek-dek format (re-encrypt the new
// content under the existing DEK/KEK, preserving kekWrap/kekSalt), NEVER downgrade
// to bare. When NOT KEK-enrolled it writes bare exactly like createVault. If a
// KEK-preserving write cannot complete on an enrolled vault it THROWS (never a
// silent bare downgrade).
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
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));

const vaultMock = {
  encryptVault: vi.fn(async () => ({ v: 1, kdf: 'argon2id', salt: 's', iv: 'bareiv', ct: 'barect' })),
  decryptVault: vi.fn(async () => 'seed'),
  deriveKekC: vi.fn(async () => new Uint8Array(32).fill(7)),
  encryptVaultWithDek: vi.fn(async () => ({ iv: 'newiv', ct: 'newct' })),
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
  store.clear();
  secureStoreMock.get.mockImplementation(async (key) => (store.has(key) ? store.get(key) : null));
  secureStoreMock.set.mockImplementation(async (key, data) => { store.set(key, data); });
  secureStoreMock.remove.mockImplementation(async (key) => { const e = store.has(key); store.delete(key); return e; });
  vaultMock.deriveKekC.mockResolvedValue(new Uint8Array(32).fill(7));
  vaultMock.decryptVaultWithDek.mockResolvedValue('seed');
  vaultMock.encryptVault.mockResolvedValue({ v: 1, kdf: 'argon2id', salt: 's', iv: 'bareiv', ct: 'barect' });
  vaultMock.encryptVaultWithDek.mockResolvedValue({ iv: 'newiv', ct: 'newct' });
  kekMock.combineKek.mockResolvedValue(new Uint8Array(32).fill(9));
  kekMock.unwrapDek.mockResolvedValue(new Uint8Array(32).fill(4));
});

describe('(a) KEK-enrolled vault: re-persisting content STAYS kek-dek with kekWrap intact', () => {
  it('re-encrypts new content under the existing DEK, preserving kekWrap/kekSalt', async () => {
    const kekWrap = { v: 1, iv: 'wrapiv', ct: 'wrapct' };
    setVault(JSON.stringify({ v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct', kekWrap, kekSalt }));

    await nativeKeyStore.saveVaultContents('NEW_CONTAINER_JSON', 'pw', {
      getHardwareFactor: async () => newHF(),
    });

    const written = JSON.parse(store.get(VAULT_KEY));
    // kek-dek format preserved — NOT downgraded to bare argon2id
    expect(written.kdf).toBe('kek-dek');
    expect(written.kekWrap).toEqual(kekWrap);
    expect(written.kekSalt).toBe(kekSalt);
    // new content ciphertext came from encryptVaultWithDek (under the existing DEK)
    expect(written.iv).toBe('newiv');
    expect(written.ct).toBe('newct');
    // the new plaintext was encrypted under the DEK, not bare
    expect(vaultMock.encryptVaultWithDek).toHaveBeenCalledWith('NEW_CONTAINER_JSON', expect.any(Uint8Array));
    expect(vaultMock.encryptVault).not.toHaveBeenCalled();
  });

  it('zeroes H, C, KEK and DEK on the success path', async () => {
    let kek, dek;
    kekMock.combineKek.mockImplementation(async () => { kek = new Uint8Array(32).fill(9); return kek; });
    kekMock.unwrapDek.mockImplementation(async () => { dek = new Uint8Array(32).fill(4); return dek; });
    setVault(JSON.stringify({ v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct', kekWrap: { v: 1 }, kekSalt }));

    await nativeKeyStore.saveVaultContents('NEW', 'pw', { getHardwareFactor: async () => newHF() });

    expect(isAllZero(kek)).toBe(true);
    expect(isAllZero(dek)).toBe(true);
  });
});

describe('(b) bare / non-KEK vault: writes bare exactly like createVault (no regression)', () => {
  it('writes an argon2id bare blob and never touches the KEK path', async () => {
    setVault(JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' }));

    await nativeKeyStore.saveVaultContents('NEW', 'pw', { getHardwareFactor: async () => newHF() });

    const written = JSON.parse(store.get(VAULT_KEY));
    expect(written.kdf).toBe('argon2id');
    expect(written.kekWrap).toBeUndefined();
    expect(vaultMock.encryptVault).toHaveBeenCalledWith('NEW', 'pw');
    expect(vaultMock.encryptVaultWithDek).not.toHaveBeenCalled();
  });

  it('writes bare when there is no prior vault at all (first write)', async () => {
    setVault(null);
    await nativeKeyStore.saveVaultContents('NEW', 'pw', {});
    const written = JSON.parse(store.get(VAULT_KEY));
    expect(written.kdf).toBe('argon2id');
    expect(written.kekWrap).toBeUndefined();
  });
});

describe('(c) fail-closed: a KEK-enrolled vault throws rather than downgrading to bare', () => {
  it('throws NO_HARDWARE_FACTOR when getHardwareFactor is missing, and does NOT write bare', async () => {
    setVault(JSON.stringify({ v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct', kekWrap: { v: 1 }, kekSalt }));

    await expect(
      nativeKeyStore.saveVaultContents('NEW', 'pw', {}),
    ).rejects.toThrow(kekMock.KEK_ERR.NO_HARDWARE_FACTOR);

    // The vault must be UNTOUCHED — never silently rewritten bare (the current bug).
    const still = JSON.parse(store.get(VAULT_KEY));
    expect(still.kdf).toBe('kek-dek');
    expect(still.kekWrap).toEqual({ v: 1 });
    expect(vaultMock.encryptVault).not.toHaveBeenCalled();
  });

  it('throws (and leaves the vault bare-free) when DEK recovery fails on the enrolled vault', async () => {
    kekMock.unwrapDek.mockRejectedValue(new Error(kekMock.KEK_ERR.UNWRAP_FAILED));
    setVault(JSON.stringify({ v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct', kekWrap: { v: 1 }, kekSalt }));

    await expect(
      nativeKeyStore.saveVaultContents('NEW', 'pw', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow();

    const still = JSON.parse(store.get(VAULT_KEY));
    expect(still.kdf).toBe('kek-dek');
    expect(vaultMock.encryptVault).not.toHaveBeenCalled();
  });
});

describe('(d) no extra hardware-factor prompt: getHardwareFactor called at most once per content re-persist', () => {
  it('invokes getHardwareFactor exactly once for a KEK-preserving content write', async () => {
    const getHF = vi.fn(async () => newHF());
    setVault(JSON.stringify({ v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct', kekWrap: { v: 1 }, kekSalt }));

    await nativeKeyStore.saveVaultContents('NEW', 'pw', { getHardwareFactor: getHF });

    expect(getHF).toHaveBeenCalledTimes(1);
  });

  it('does NOT call getHardwareFactor at all on a bare vault', async () => {
    const getHF = vi.fn(async () => newHF());
    setVault(JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' }));

    await nativeKeyStore.saveVaultContents('NEW', 'pw', { getHardwareFactor: getHF });

    expect(getHF).not.toHaveBeenCalled();
  });
});
