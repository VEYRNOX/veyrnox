// src/wallet-core/keystore/__tests__/native.aad-v3-write-sites.test.js
//
// #1111 Phase 0 — keystore-level coverage for the AAD v:3 write sites.
//
// WHY THIS FILE EXISTS. vault-aad-v3.test.js covers the vault PRIMITIVE well
// (AAD shape, canonical ordering, round-trip, field-swap, structural reject),
// and its rotation test is explicit that it *simulates* the keystore pattern
// rather than calling it. That left every line of the native/web migration and
// reseal branches with zero coverage — behind a flag that is off, so nothing
// was red. Three real defects lived in that blind spot (branch review of
// PR #1649):
//
//   1. saveVaultContents / enrollKek wrote v:2 unconditionally, silently
//      downgrading a v:3 vault and stripping the very binding #1111 adds.
//   2. The native migration hook passed `hardwareKekVersion` raw, so legacy
//      KEK blobs that legitimately lack the field could NEVER migrate.
//   3. Both failures were swallowed by a bare `catch {}`, so a permanently
//      stuck vault was indistinguishable from a migrated one.
//
// EVERY test here runs with AAD_V3_MIGRATION_ENABLED mocked TRUE — that is the
// Phase 0b world these branches exist for, and the state no other keystore test
// file exercises (the other ~20 pin the mock to false, so flipping the real
// constant changes nothing for them; see the tripwire tests in
// native.kek-v3-migration.test.js and web-kek-v-propagation.test.js).
//
// Mocking pattern mirrors native.kek-v3-migration.test.js.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

// The v3 writer mock MIRRORS the real structural reject in vault.js: any
// binding field that is `undefined` throws. Without this, a regression that
// reintroduced the raw `blob.hardwareKekVersion` would still "pass" here
// because a permissive mock accepts undefined — the test would assert nothing.
const VAULT_MALFORMED = 'VAULT_MALFORMED';
const encryptV3Impl = async (_secret, _dek, binding) => {
  if (!binding || typeof binding !== 'object') {
    throw Object.assign(new Error(VAULT_MALFORMED), { code: VAULT_MALFORMED });
  }
  const { kekWrap, kekSalt, hardwareKekVersion } = binding;
  if (kekWrap === undefined || kekSalt === undefined || hardwareKekVersion === undefined) {
    throw Object.assign(new Error(VAULT_MALFORMED), { code: VAULT_MALFORMED });
  }
  return { v: 3, kdf: 'kek-dek', iv: 'v3iv', ct: 'v3ct', kekWrap, kekSalt, hardwareKekVersion };
};

const vaultMock = {
  encryptVault: vi.fn(async () => ({ v: 1, kdf: 'argon2id', salt: 's', iv: 'bareiv', ct: 'barect' })),
  decryptVault: vi.fn(async () => 'seed'),
  deriveKekC: vi.fn(async () => new Uint8Array(32).fill(7)),
  encryptVaultWithDek: vi.fn(async () => ({ v: 2, kdf: 'kek-dek', iv: 'v2iv', ct: 'v2ct' })),
  decryptVaultWithDek: vi.fn(async () => 'seed'),
  encryptVaultWithDekV3: vi.fn(encryptV3Impl),
  VAULT_VERSION_V3: 3,
  AAD_V3_MIGRATION_ENABLED: true, // <-- the Phase 0b world
};
vi.mock('../../vault.js', () => vaultMock);

const kekMock = {
  combineKek: vi.fn(async () => new Uint8Array(32).fill(9)),
  randomDek: vi.fn(() => new Uint8Array(32).fill(3)),
  wrapDek: vi.fn(async () => ({ v: 2, iv: 'wiv', ct: 'wct' })),
  unwrapDek: vi.fn(async () => new Uint8Array(32).fill(4)),
  decodeKekSalt: vi.fn((s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))),
  parseVaultBlob: vi.fn((raw) => (typeof raw === 'string' ? JSON.parse(raw) : raw)),
  KEK_ERR: { NO_HARDWARE_FACTOR: 'NO_HARDWARE_FACTOR', UNWRAP_FAILED: 'UNWRAP_FAILED', MALFORMED_VAULT: 'MALFORMED_VAULT' },
};
vi.mock('../kek.js', () => kekMock);

vi.mock('../hardware.js', () => ({
  getHardwareFactor: vi.fn(async () => new Uint8Array(32).fill(1)),
  clearHardwareCredential: vi.fn(async () => {}),
}));

const { nativeKeyStore } = await import('../native.js');

const kekSalt = btoa('s'.repeat(32));
const newHF = () => new Uint8Array(32).fill(1);
const hfOpts = { getHardwareFactor: async () => newHF() };
const written = () => {
  const raw = store.get(VAULT_KEY);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
};

let errSpy;
beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  secureStoreMock.get.mockImplementation(async (key) => (store.has(key) ? store.get(key) : null));
  secureStoreMock.set.mockImplementation(async (key, data) => { store.set(key, data); });
  secureStoreMock.remove.mockImplementation(async (key) => { const e = store.has(key); store.delete(key); return e; });
  vaultMock.deriveKekC.mockResolvedValue(new Uint8Array(32).fill(7));
  vaultMock.decryptVaultWithDek.mockResolvedValue('seed');
  vaultMock.encryptVaultWithDek.mockResolvedValue({ v: 2, kdf: 'kek-dek', iv: 'v2iv', ct: 'v2ct' });
  vaultMock.encryptVaultWithDekV3.mockImplementation(encryptV3Impl);
  kekMock.combineKek.mockResolvedValue(new Uint8Array(32).fill(9));
  kekMock.unwrapDek.mockResolvedValue(new Uint8Array(32).fill(4));
  kekMock.wrapDek.mockResolvedValue({ v: 2, iv: 'wiv', ct: 'wct' });
  kekMock.randomDek.mockReturnValue(new Uint8Array(32).fill(3));
  kekMock.decodeKekSalt.mockImplementation((s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { errSpy.mockRestore(); });

describe('(A) unlock migration hook — v:2 → v:3', () => {
  it('reseals a v:2 kek-dek blob under the v:3 AAD with that blob\'s own binding', async () => {
    setVault({ v: 2, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct', kekWrap: { v: 2, iv: 'kiv', ct: 'kct' }, kekSalt, hardwareKekVersion: 3 });

    const seed = await nativeKeyStore.unlock('pw', hfOpts);

    expect(seed).toBe('seed'); // migration never changes what unlock returns
    expect(vaultMock.encryptVaultWithDekV3).toHaveBeenCalledTimes(1);
    const [, , binding] = vaultMock.encryptVaultWithDekV3.mock.calls[0];
    expect(binding).toEqual({ kekWrap: { v: 2, iv: 'kiv', ct: 'kct' }, kekSalt, hardwareKekVersion: 3 });
    expect(written().v).toBe(3);
    expect(written().ct).toBe('v3ct');
  });

  it('MIGRATES a legacy blob with NO hardwareKekVersion — binds explicit null, not undefined', async () => {
    // The C2 regression. `hardwareKekVersion` is legitimately absent on legacy
    // KEK wraps (hfOptsForBlob: "v1 (no hardwareKekVersion) → undefined").
    // Passing it raw makes the v:3 writer reject structurally, so exactly the
    // vaults that most need the binding could never get it — silently, forever,
    // on every unlock. Revert the `?? null` at native.js and this goes red.
    setVault({ v: 2, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct', kekWrap: { v: 1, iv: 'kiv', ct: 'kct' }, kekSalt });

    const seed = await nativeKeyStore.unlock('pw', hfOpts);

    expect(seed).toBe('seed');
    expect(vaultMock.encryptVaultWithDekV3).toHaveBeenCalledTimes(1);
    const [, , binding] = vaultMock.encryptVaultWithDekV3.mock.calls[0];
    expect(binding.hardwareKekVersion).toBeNull();
    expect(written().v).toBe(3);
  });

  it('leaves an already-v:3 blob alone (no rewrite churn)', async () => {
    setVault({ v: 3, kdf: 'kek-dek', iv: 'v3iv', ct: 'v3ct', kekWrap: { v: 2, iv: 'kiv', ct: 'kct' }, kekSalt, hardwareKekVersion: 3 });
    await nativeKeyStore.unlock('pw', hfOpts);
    expect(vaultMock.encryptVaultWithDekV3).not.toHaveBeenCalled();
  });
});

describe('(B) migration failure is REPORTED, never swallowed, never fatal', () => {
  it('a failed reseal still returns the seed AND logs an allowlisted code', async () => {
    setVault({ v: 2, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct', kekWrap: { v: 2, iv: 'kiv', ct: 'kct' }, kekSalt, hardwareKekVersion: 3 });
    vaultMock.encryptVaultWithDekV3.mockRejectedValueOnce(
      Object.assign(new Error(VAULT_MALFORMED), { code: VAULT_MALFORMED }),
    );

    const seed = await nativeKeyStore.unlock('pw', hfOpts);

    expect(seed).toBe('seed');            // I4: never fail an unlock over a migration
    expect(written().v).toBe(2);          // v:2 left intact on disk; retried next unlock
    const logged = errSpy.mock.calls.filter((c) => String(c[0]).includes('AAD v:3 migration failed'));
    expect(logged.length, 'migration failure must not be silent').toBe(1);
    // LOG-1: only the allowlisted literal crosses the boundary — no blob, no ct.
    expect(logged[0][1]).toBe(VAULT_MALFORMED);
  });

  it('a write-verify failure is reported under its own allowlisted code', async () => {
    setVault({ v: 2, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct', kekWrap: { v: 2, iv: 'kiv', ct: 'kct' }, kekSalt, hardwareKekVersion: 3 });
    // safeWriteVault throws a BARE Error with no `.code` — the reporter must
    // still recognise it, which is why it matches on message as well as code.
    secureStoreMock.get.mockImplementation(async (key) => {
      if (key === VAULT_KEY && store.has(key)) {
        const raw = store.get(key);
        const b = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (b.v === 3) return JSON.stringify({ ...b, ct: 'TAMPERED' }); // read-back mismatch
        return raw;
      }
      return store.has(key) ? store.get(key) : null;
    });

    const seed = await nativeKeyStore.unlock('pw', hfOpts);

    expect(seed).toBe('seed');
    const logged = errSpy.mock.calls.filter((c) => String(c[0]).includes('AAD v:3 migration failed'));
    expect(logged.length).toBe(1);
    expect(logged[0][1]).toBe('VAULT_WRITE_VERIFY_FAILED');
  });
});

describe('(C) saveVaultContents preserves v:3 (no silent downgrade)', () => {
  it('a v:3 vault stays v:3 across a content save, resealed under the same binding', async () => {
    // The C1 regression. saveVaultContents runs on every seed add/import/remove.
    // Before the fix it called encryptVaultWithDek (always v:2) and placed
    // `v: newV` AFTER the spread, so the vault silently dropped to v:2 and the
    // next unlock migrated it back — oscillating forever, never converging.
    setVault({ v: 3, kdf: 'kek-dek', iv: 'v3iv', ct: 'v3ct', kekWrap: { v: 2, iv: 'kiv', ct: 'kct' }, kekSalt, hardwareKekVersion: 3 });

    await nativeKeyStore.saveVaultContents('NEW_CONTAINER', 'pw', hfOpts);

    expect(vaultMock.encryptVaultWithDekV3).toHaveBeenCalledTimes(1);
    expect(vaultMock.encryptVaultWithDek, 'must NOT use the v:2 writer on a v:3 vault').not.toHaveBeenCalled();
    expect(written().v).toBe(3);
    const [, , binding] = vaultMock.encryptVaultWithDekV3.mock.calls[0];
    expect(binding).toEqual({ kekWrap: { v: 2, iv: 'kiv', ct: 'kct' }, kekSalt, hardwareKekVersion: 3 });
  });

  it('a v:2 vault is upgraded (not left behind) when the flag is on', async () => {
    setVault({ v: 2, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct', kekWrap: { v: 2, iv: 'kiv', ct: 'kct' }, kekSalt, hardwareKekVersion: 3 });
    await nativeKeyStore.saveVaultContents('NEW_CONTAINER', 'pw', hfOpts);
    expect(written().v).toBe(3);
  });
});

describe('(D) enrollKek stamps v:3 directly when the flag is on', () => {
  it('a fresh KEK enrolment writes v:3, not v:2-then-migrate', async () => {
    // The flag's own contract is "whether new/migrated vault WRITES stamp v:3".
    // Before the fix only the migrated half was true.
    setVault({ v: 2, kdf: 'argon2id', salt: 'bs', iv: 'bareiv', ct: 'barect' });

    await nativeKeyStore.enrollKek('pw', hfOpts);

    expect(vaultMock.encryptVaultWithDekV3).toHaveBeenCalledTimes(1);
    expect(written().v).toBe(3);
    expect(written().kdf).toBe('kek-dek');
    expect(written().hardwareKekVersion).toBe(3);
  });
});
