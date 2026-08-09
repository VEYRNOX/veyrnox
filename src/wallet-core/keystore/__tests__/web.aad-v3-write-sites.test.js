// src/wallet-core/keystore/__tests__/web.aad-v3-write-sites.test.js
//
// #1111 Phase 0 — web counterpart of native.aad-v3-write-sites.test.js.
// See that file's header for why this coverage exists. Same discipline:
// AAD_V3_MIGRATION_ENABLED is mocked TRUE, because the branches under test are
// unreachable in the flag-off world every other keystore test file pins.
//
// Web-specific invariant: `hardwareKekVersion` is a native-only field (WebAuthn
// PRF is version-inline and enrollKek never stores it), so every web binding
// must carry an explicit `null` — never `undefined`, which the v:3 writer
// rejects structurally.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const VAULT_MALFORMED = 'VAULT_MALFORMED';
// Mirrors vault.js's real structural reject so a regression that passes
// `undefined` fails here instead of sailing through a permissive mock.
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
  encryptVault: vi.fn(async () => ({ v: 2, kdf: 'argon2id', salt: 's', iv: 'bareiv', ct: 'barect' })),
  decryptVault: vi.fn(async () => 'seed'),
  vaultNeedsRekey: vi.fn(() => false),
  deriveKekC: vi.fn(async () => new Uint8Array(32).fill(7)),
  encryptVaultWithDek: vi.fn(async () => ({ v: 2, kdf: 'kek-dek', iv: 'v2iv', ct: 'v2ct' })),
  decryptVaultWithDek: vi.fn(async () => 'seed'),
  encryptVaultWithDekV3: vi.fn(encryptV3Impl),
  VAULT_VERSION_V3: 3,
  AAD_V3_MIGRATION_ENABLED: true, // <-- the Phase 0b world
};
const store = new Map();
const VAULT_KEY = 'primary';
const storeMock = {
  saveVault: vi.fn(async (blob) => { store.set(VAULT_KEY, blob); }),
  loadVault: vi.fn(async () => (store.has(VAULT_KEY) ? store.get(VAULT_KEY) : null)),
  hasVault: vi.fn(async () => store.has(VAULT_KEY)),
  clearVault: vi.fn(async () => { store.delete(VAULT_KEY); }),
};
const kekMock = {
  combineKek: vi.fn(async () => new Uint8Array(32).fill(9)),
  randomDek: vi.fn(() => new Uint8Array(32).fill(3)),
  wrapDek: vi.fn(async () => ({ v: 2, iv: 'wiv', ct: 'wct' })),
  unwrapDek: vi.fn(async () => new Uint8Array(32).fill(4)),
  KEK_ERR: { NO_HARDWARE_FACTOR: 'NO_HARDWARE_FACTOR', UNWRAP_FAILED: 'UNWRAP_FAILED' },
  MALFORMED_VAULT: 'KEK_MALFORMED_VAULT',
  decodeKekSalt: (kekSalt) => {
    if (typeof kekSalt !== 'string' || kekSalt.length === 0) throw new Error('KEK_MALFORMED_VAULT');
    let bin; try { bin = atob(kekSalt); } catch { throw new Error('KEK_MALFORMED_VAULT'); }
    const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out;
  },
};

vi.mock('../../vault.js', () => vaultMock);
vi.mock('../../evm/vaultStore.js', () => storeMock);
vi.mock('../kek.js', () => kekMock);

const { webKeyStore } = await import('../web.js');

const kekSalt = btoa('s'.repeat(32));
const PW = 'correct-horse-battery-12';
const newHF = () => new Uint8Array(32).fill(1);
const hfOpts = { getHardwareFactor: async () => newHF() };
const setVault = (v) => { if (v == null) store.delete(VAULT_KEY); else store.set(VAULT_KEY, v); };
const written = () => store.get(VAULT_KEY);

let errSpy;
beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  vaultMock.deriveKekC.mockResolvedValue(new Uint8Array(32).fill(7));
  vaultMock.decryptVaultWithDek.mockResolvedValue('seed');
  vaultMock.encryptVaultWithDek.mockResolvedValue({ v: 2, kdf: 'kek-dek', iv: 'v2iv', ct: 'v2ct' });
  vaultMock.encryptVaultWithDekV3.mockImplementation(encryptV3Impl);
  kekMock.combineKek.mockResolvedValue(new Uint8Array(32).fill(9));
  kekMock.unwrapDek.mockResolvedValue(new Uint8Array(32).fill(4));
  kekMock.wrapDek.mockResolvedValue({ v: 2, iv: 'wiv', ct: 'wct' });
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { errSpy.mockRestore(); });

describe('(A) web unlock migration hook', () => {
  it('reseals a v:2 kek-dek blob at v:3, binding hardwareKekVersion as explicit null', async () => {
    setVault({ v: 2, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct', kekWrap: { v: 2, iv: 'kiv', ct: 'kct' }, kekSalt });

    const seed = await webKeyStore.unlock(PW, hfOpts);

    expect(seed).toBe('seed');
    expect(vaultMock.encryptVaultWithDekV3).toHaveBeenCalledTimes(1);
    const [, , binding] = vaultMock.encryptVaultWithDekV3.mock.calls[0];
    expect(binding.hardwareKekVersion).toBeNull();
    expect(written().v).toBe(3);
  });

  it('a failed reseal is logged (allowlisted code only) and never fails the unlock', async () => {
    setVault({ v: 2, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct', kekWrap: { v: 2, iv: 'kiv', ct: 'kct' }, kekSalt });
    vaultMock.encryptVaultWithDekV3.mockRejectedValueOnce(
      Object.assign(new Error(VAULT_MALFORMED), { code: VAULT_MALFORMED }),
    );

    const seed = await webKeyStore.unlock(PW, hfOpts);

    expect(seed).toBe('seed');
    expect(written().v).toBe(2);
    const logged = errSpy.mock.calls.filter((c) => String(c[0]).includes('AAD v:3 migration failed'));
    expect(logged.length, 'migration failure must not be silent').toBe(1);
    expect(logged[0][1]).toBe(VAULT_MALFORMED); // LOG-1: literal only
  });
});

describe('(B) web saveVaultContents preserves v:3', () => {
  it('a v:3 vault stays v:3 across a content save and does not use the v:2 writer', async () => {
    setVault({ v: 3, kdf: 'kek-dek', iv: 'v3iv', ct: 'v3ct', kekWrap: { v: 2, iv: 'kiv', ct: 'kct' }, kekSalt });

    await webKeyStore.saveVaultContents('NEW_CONTAINER', PW, hfOpts);

    expect(vaultMock.encryptVaultWithDekV3).toHaveBeenCalledTimes(1);
    expect(vaultMock.encryptVaultWithDek, 'must NOT use the v:2 writer on a v:3 vault').not.toHaveBeenCalled();
    expect(written().v).toBe(3);
  });
});

describe('(C) web enrollKek stamps v:3 when the flag is on', () => {
  it('a fresh enrolment writes v:3 with an explicit null hardwareKekVersion', async () => {
    setVault({ v: 2, kdf: 'argon2id', salt: 'bs', iv: 'bareiv', ct: 'barect' });

    await webKeyStore.enrollKek(PW, hfOpts);

    expect(vaultMock.encryptVaultWithDekV3).toHaveBeenCalledTimes(1);
    const [, , binding] = vaultMock.encryptVaultWithDekV3.mock.calls[0];
    expect(binding.hardwareKekVersion).toBeNull();
    expect(written().v).toBe(3);
    expect(written().kdf).toBe('kek-dek');
  });
});
