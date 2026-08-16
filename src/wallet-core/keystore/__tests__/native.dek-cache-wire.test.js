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
import { readFileSync } from 'node:fs';

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
  encryptVaultWithDekV3: vi.fn(async () => ({ v: 3, kdf: 'kek-dek', iv: 'v3iv', ct: 'v3ct' })),
  VAULT_VERSION_V3: 3,
  AAD_V3_MIGRATION_ENABLED: false,
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
  // Guarded — vaultMock now carries non-function values (VAULT_VERSION_V3,
  // AAD_V3_MIGRATION_ENABLED) that have no `.mockClear`.
  Object.values(secureStoreMock).forEach(fn => fn.mockClear && fn.mockClear());
  Object.values(vaultMock).forEach(fn => fn.mockClear && fn.mockClear());
  Object.values(kekMock).forEach(fn => fn.mockClear && fn.mockClear());
  // Re-return the deterministic KEK/DEK after clear:
  kekMock.combineKek.mockImplementation(async () => new Uint8Array(FIXED_KEK));
  kekMock.unwrapDek.mockImplementation(async () => new Uint8Array(FIXED_DEK));
  kekMock.decodeKekSalt.mockImplementation(() => new Uint8Array(32).fill(1));
  kekMock.parseVaultBlob.mockImplementation((raw) => JSON.parse(raw));
  ({ nativeKeyStore: keyStore } = await import('../native.js'));
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

  it('upgradeKekToV3 removes the cache slot', async (ctx) => {
    // TODO: activate this assertion when keyStore.upgradeKekToV3 becomes
    // publicly exported. Until then the KEK v2→v3 upgrade path is exercised
    // via changePassword's KEK branch above; skipping keeps this suite honest
    // instead of an unconditional expect(true). The check is INSIDE the
    // callback because keyStore is loaded by beforeEach, not at file scope.
    if (typeof keyStore.upgradeKekToV3 !== 'function') {
      ctx.skip();
      return;
    }
    // v2 blob (hardwareKekVersion:2) triggers the upgrade branch.
    setVault(JSON.stringify({
      v: 1, kdf: 'kek-dek', iv: 'ct-iv', ct: 'ct-ct',
      kekWrap: { v: 2, iv: 'wrap-iv', ct: 'wrap-ct' },
      kekSalt: Buffer.from(new Uint8Array(32).fill(1)).toString('base64'),
      hardwareKekVersion: 2,
    }));
    setCache();
    await keyStore.upgradeKekToV3('87654321', { getHardwareFactor: getHF });
    expect(store.has(DEK_CACHE_STORAGE_KEY)).toBe(false);
  });

  it('enrollKek removes the cache slot', async () => {
    // The site this block was missing (audit 2026-08-09). enrollKek mints a
    // brand-new DEK, so a leftover cache blob is stale the moment it returns.
    //
    // A bare (non-KEK) vault is the precondition — enrollKek throws
    // KEK_ALREADY_ENROLLED on a blob that already has a kekWrap.
    setVault(JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'i', ct: 'c' }));
    setCache();
    await keyStore.enrollKek('87654321', { getHardwareFactor: getHF });
    expect(store.has(DEK_CACHE_STORAGE_KEY)).toBe(false);
  });

  it('only ONE site mints a DEK — a second one needs its own cache-clear', () => {
    // The bug here was a MISSING clear, and a per-site suite cannot fail for a
    // site nobody wrote a case for. So pin the assumption the fix rests on
    // instead: exactly one place in native.js calls randomDek(), and it is the
    // one the test above covers.
    //
    // If this goes red, a new DEK-minting path was added. Do not just bump the
    // number — give the new site a clearDekCache() and its own case above,
    // because a fresh DEK with a stale cache blob is the permanent-lockout
    // scenario described at the enrollKek call site.
    // Resolved from the vitest root, not import.meta.url — the aliased test
    // environment does not give this module a file: URL.
    const src = readFileSync('src/wallet-core/keystore/native.js', 'utf8');
    const mintSites = src.match(/randomDek\s*\(/g) ?? [];
    expect(mintSites).toHaveLength(1);
    // ...and it is inside enrollKek, whose clear is asserted above.
    const enrollStart = src.indexOf('async enrollKek(');
    const enrollEnd = src.indexOf('async unenrollKek(');
    expect(enrollStart).toBeGreaterThan(-1);
    expect(enrollEnd).toBeGreaterThan(enrollStart);
    const enrollBody = src.slice(enrollStart, enrollEnd);
    expect(enrollBody).toMatch(/randomDek\s*\(/);
    expect(enrollBody).toMatch(/clearDekCache\s*\(/);
  });
});
