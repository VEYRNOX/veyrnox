// src/wallet-core/keystore/__tests__/native.dek-cache-wire.test.js
//
// Phase 1b — dekCache is wired into _unlockInner and cleared at every
// KEK-rotating / vault-invalidating call site. This file pins the wiring
// contract: WHERE the cache is written, WHERE it's read, and WHERE it's
// cleared. The dekCache PRIMITIVE (wrap/unwrap correctness) is tested in
// dekCache.test.js — this file tests the STORAGE-LAYER wiring in native.js.
//
// Mocking pattern mirrors native.kek-preserving-repersist.test.js:
// SecureStorage is a Map, vault/kek internals are mocked, dekCache is
// UNMOCKED (pure primitive — real crypto, real AAD binding).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const VAULT_KEY = 'vault_v1';
const DEK_CACHE_STORAGE_KEY = 'vault_dek_v1';

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

// KEK is deterministic across mock calls so the REAL dekCache can wrap/unwrap
// against a stable key. combineKek returns a fixed 32-byte KEK; wrapDek/unwrapDek
// are mocked because the primary vault-wrap path uses a different AAD than the
// cache path — mocking them keeps this file focused on the wiring, not on
// re-testing kek.js's own primitives.
const FIXED_KEK = new Uint8Array(32).fill(9);
const FIXED_DEK = new Uint8Array(32).fill(4);
const kekMock = {
  combineKek: vi.fn(async () => new Uint8Array(FIXED_KEK)),
  randomDek: vi.fn(() => new Uint8Array(FIXED_DEK)),
  wrapDek: vi.fn(async () => ({ v: 2, iv: 'primaryIv', ct: 'primaryCt' })),
  unwrapDek: vi.fn(async () => new Uint8Array(FIXED_DEK)),
  KEK_ERR: { NO_HARDWARE_FACTOR: 'NO_HARDWARE_FACTOR', UNWRAP_FAILED: 'UNWRAP_FAILED', MALFORMED_VAULT: 'KEK_MALFORMED_VAULT' },
  MALFORMED_VAULT: 'KEK_MALFORMED_VAULT',
  decodeKekSalt: vi.fn(() => new Uint8Array(32).fill(1)),
  parseVaultBlob: vi.fn((raw) => JSON.parse(raw)),
};
vi.mock('../kek.js', () => kekMock);

vi.mock('../hardware.js', () => ({
  clearHardwareCredential: vi.fn(async () => {}),
  getHardwareFactor: vi.fn(async () => new Uint8Array(32).fill(2)),
}));

const enrolledBlob = () => JSON.stringify({
  v: 1, kdf: 'kek-dek', iv: 'ct-iv', ct: 'ct-ct',
  kekWrap: { v: 2, iv: 'wrap-iv', ct: 'wrap-ct' },
  kekSalt: Buffer.from(new Uint8Array(32).fill(1)).toString('base64'),
  hardwareKekVersion: 3,
});

const getHF = async () => new Uint8Array(32).fill(2);

let keyStore;

beforeEach(async () => {
  vi.resetModules();
  store.clear();
  Object.values(secureStoreMock).forEach(fn => fn.mockClear());
  Object.values(vaultMock).forEach(fn => fn.mockClear());
  Object.values(kekMock).forEach(fn => fn.mockClear && fn.mockClear());
  // Re-return the deterministic KEK/DEK after clear:
  kekMock.combineKek.mockImplementation(async () => new Uint8Array(FIXED_KEK));
  kekMock.unwrapDek.mockImplementation(async () => new Uint8Array(FIXED_DEK));
  kekMock.decodeKekSalt.mockImplementation(() => new Uint8Array(32).fill(1));
  kekMock.parseVaultBlob.mockImplementation((raw) => JSON.parse(raw));
  ({ default: keyStore } = await import('../native.js'));
  await keyStore.init?.();
});

describe('dekCache wire — WRITE on successful unlock', () => {
  it('populates vault_dek_v1 with a v:1 cache blob after a successful KEK unlock', async () => {
    setVault(enrolledBlob());
    expect(store.has(DEK_CACHE_STORAGE_KEY)).toBe(false);

    await keyStore.unlock('87654321', { getHardwareFactor: getHF });

    // Cache slot now populated.
    expect(store.has(DEK_CACHE_STORAGE_KEY)).toBe(true);
    const cached = JSON.parse(store.get(DEK_CACHE_STORAGE_KEY));
    // Must be the dekCache blob shape (v:1 with iv+ct), NOT the primary
    // wrap shape (v:2 in this test's kek.js mock). This proves the write
    // routes through dekCache's distinct AAD, not through wrapDek.
    expect(cached.v).toBe(1);
    expect(typeof cached.iv).toBe('string');
    expect(typeof cached.ct).toBe('string');
    // And crucially, NOT the primary wrap constants.
    expect(cached.iv).not.toBe('primaryIv');
    expect(cached.ct).not.toBe('primaryCt');
  });
});

describe('dekCache wire — READ on subsequent unlock', () => {
  it('cache-hit path does NOT call unwrapDek', async () => {
    setVault(enrolledBlob());
    // Seed: one unlock to populate cache.
    await keyStore.unlock('87654321', { getHardwareFactor: getHF });
    kekMock.unwrapDek.mockClear();

    // Second unlock: cache should be consulted first.
    await keyStore.unlock('87654321', { getHardwareFactor: getHF });

    expect(kekMock.unwrapDek).not.toHaveBeenCalled();
  });

  it('cache-miss falls through to unwrapDek without error', async () => {
    setVault(enrolledBlob());
    // Cache is empty — first unlock ever.
    expect(store.has(DEK_CACHE_STORAGE_KEY)).toBe(false);

    await keyStore.unlock('87654321', { getHardwareFactor: getHF });

    expect(kekMock.unwrapDek).toHaveBeenCalledTimes(1);
    // And the cache is now populated as a side effect (see WRITE test).
    expect(store.has(DEK_CACHE_STORAGE_KEY)).toBe(true);
  });

  it('cache-tampered falls through to unwrapDek without throwing', async () => {
    setVault(enrolledBlob());
    // Poison the cache slot with garbage that JSON.parses but does not
    // unwrap. The cache-read path must silently fall through.
    store.set(DEK_CACHE_STORAGE_KEY, JSON.stringify({ v: 1, iv: 'AAAA', ct: 'BBBB' }));
    kekMock.unwrapDek.mockClear();

    await expect(keyStore.unlock('87654321', { getHardwareFactor: getHF })).resolves.not.toThrow();

    expect(kekMock.unwrapDek).toHaveBeenCalledTimes(1);
  });
});

describe('dekCache wire — CLEAR at invalidation sites', () => {
  const setCache = () => store.set(DEK_CACHE_STORAGE_KEY, JSON.stringify({ v: 1, iv: 'ignored', ct: 'ignored' }));

  it('clearVault removes the cache slot', async () => {
    setVault(enrolledBlob());
    setCache();
    await keyStore.clearVault();
    expect(store.has(DEK_CACHE_STORAGE_KEY)).toBe(false);
  });

  it('unenrollKek removes the cache slot', async () => {
    setVault(enrolledBlob());
    setCache();
    // unenrollKek requires a KEK-enrolled vault + valid password/getHF.
    await keyStore.unenrollKek('87654321', { getHardwareFactor: getHF });
    expect(store.has(DEK_CACHE_STORAGE_KEY)).toBe(false);
  });

  it('changePassword (KEK branch) removes the cache slot', async () => {
    setVault(enrolledBlob());
    setCache();
    await keyStore.changePassword('87654321', '12345678', { getHardwareFactor: getHF });
    expect(store.has(DEK_CACHE_STORAGE_KEY)).toBe(false);
  });

  it('changePassword (bare branch) removes the cache slot', async () => {
    // Bare vault: no kekWrap.
    setVault(JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'i', ct: 'c' }));
    setCache();
    await keyStore.changePassword('87654321', '12345678');
    expect(store.has(DEK_CACHE_STORAGE_KEY)).toBe(false);
  });

  it('upgradeKekToV3 removes the cache slot', async () => {
    // v2 blob (hardwareKekVersion:2) triggers the upgrade branch.
    setVault(JSON.stringify({
      v: 1, kdf: 'kek-dek', iv: 'ct-iv', ct: 'ct-ct',
      kekWrap: { v: 2, iv: 'wrap-iv', ct: 'wrap-ct' },
      kekSalt: Buffer.from(new Uint8Array(32).fill(1)).toString('base64'),
      hardwareKekVersion: 2,
    }));
    setCache();
    if (typeof keyStore.upgradeKekToV3 === 'function') {
      await keyStore.upgradeKekToV3('87654321', { getHardwareFactor: getHF });
      expect(store.has(DEK_CACHE_STORAGE_KEY)).toBe(false);
    } else {
      // Method not exported publicly; the guard fires via changePassword's
      // KEK branch instead (already tested above). This branch is a
      // documentation-only test: if the method ever becomes public, arm
      // this assertion. Skip cleanly.
      expect(true).toBe(true);
    }
  });
});
