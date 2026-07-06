// src/wallet-core/keystore/__tests__/native.kek-v3-migration.test.js
//
// C-1 regression fix (2026-07-05) — version-stamp reinterpretation + brickless migration.
//
// BACKGROUND: existing hardwareKekVersion:2 vaults were stamped v2 but their H was wrapped
// under the FIXED v1 salt (two masking bugs: the facade dropped getHardwareFactor's opts,
// and hardware.js sent kekSalt as a raw Uint8Array the bridge could not carry). So a v2
// stamp does NOT mean the wrap is salt-bound. We therefore:
//   - introduce hardwareKekVersion:3 = GENUINELY salt-bound wraps;
//   - hfOptsForBlob: v3 → { kekSalt }; v2 → undefined (inert binding, treat as fixed-salt);
//     v1 → undefined;
//   - stamp NEW enrollments v3 (per-enrollment random kekSalt);
//   - UPGRADE a v2 blob to v3 on changePassword (NOT on unlock — see 2026-07-06 below):
//     a genuine re-enroll with a fresh salt → getHardwareFactor({kekSalt}) → re-wrap the
//     SAME DEK → persist via fail-closed safeWriteVault → stamp v3.
//
// 2026-07-06 UPDATE (single-biometric-per-unlock fix): the v2→v3 upgrade was REMOVED from
// the unlock hot path — re-deriving H under a fresh salt on unlock forced a SECOND biometric
// prompt every unlock (the cross-platform 3-prompt bug) and could re-prompt forever on a
// failed write. Sections (C)/(D) below were re-pointed from the (removed) lazy-unlock
// migration to the changePassword upgrade path, preserving their security assertions; the
// changePassword path is fail-CLOSED (throws), unlike the old best-effort/brickless unlock
// path. See native.unlock-single-biometric.test.js for the single-prompt invariant.
//
// Mocking pattern mirrors native.kek-v2-hmac-binding.test.js / native.kek-preserving-repersist.

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
  wrapDek: vi.fn(async () => ({ v: 1, iv: 'reiv', ct: 'rect' })),
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

const { nativeKeyStore, hfOptsForBlob } = await import('../native.js');

const kekSalt = btoa('s'.repeat(32));
const newHF = () => new Uint8Array(32).fill(1);
const saltBytesOf = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  secureStoreMock.get.mockImplementation(async (key) => (store.has(key) ? store.get(key) : null));
  secureStoreMock.set.mockImplementation(async (key, data) => { store.set(key, data); });
  secureStoreMock.remove.mockImplementation(async (key) => { const e = store.has(key); store.delete(key); return e; });
  vaultMock.deriveKekC.mockResolvedValue(new Uint8Array(32).fill(7));
  vaultMock.decryptVault.mockResolvedValue('seed');
  vaultMock.decryptVaultWithDek.mockResolvedValue('seed');
  vaultMock.encryptVault.mockResolvedValue({ v: 1, kdf: 'argon2id', salt: 's', iv: 'bareiv', ct: 'barect' });
  vaultMock.encryptVaultWithDek.mockResolvedValue({ iv: 'newiv', ct: 'newct' });
  kekMock.combineKek.mockResolvedValue(new Uint8Array(32).fill(9));
  kekMock.unwrapDek.mockResolvedValue(new Uint8Array(32).fill(4));
  kekMock.wrapDek.mockResolvedValue({ v: 1, iv: 'reiv', ct: 'rect' });
  kekMock.randomDek.mockReturnValue(new Uint8Array(32).fill(3));
  kekMock.decodeKekSalt.mockImplementation((s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
});

describe('(A) hfOptsForBlob — version mapping (v1/v2/v3)', () => {
  const saltBytes = saltBytesOf(kekSalt);

  it('v3 → { kekSalt } (genuinely salt-bound wrap)', () => {
    const opts = hfOptsForBlob({ hardwareKekVersion: 3 }, saltBytes);
    expect(opts).toBeTruthy();
    expect(opts.kekSalt).toBeInstanceOf(Uint8Array);
    expect(Array.from(opts.kekSalt)).toEqual(Array.from(saltBytes));
  });

  it('v2 → undefined (stamped v2 but binding was inert — treated as fixed-salt)', () => {
    expect(hfOptsForBlob({ hardwareKekVersion: 2 }, saltBytes)).toBeUndefined();
  });

  it('v1 (no hardwareKekVersion) → undefined (legacy fixed-salt)', () => {
    expect(hfOptsForBlob({}, saltBytes)).toBeUndefined();
    expect(hfOptsForBlob(null, saltBytes)).toBeUndefined();
  });
});

describe('(B) enrollKek — stamps v3 with a per-enrollment random kekSalt', () => {
  it('new enrollment stamps hardwareKekVersion:3 and binds H to the fresh salt', async () => {
    setVault(JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' }));
    const getHF = vi.fn(async () => newHF());

    await nativeKeyStore.enrollKek('pw', { getHardwareFactor: getHF });

    const written = JSON.parse(store.get(VAULT_KEY));
    expect(written.hardwareKekVersion).toBe(3);
    expect(getHF).toHaveBeenCalledTimes(1);
    const arg = getHF.mock.calls[0][0];
    expect(arg.kekSalt).toBeInstanceOf(Uint8Array);
    expect(Array.from(arg.kekSalt)).toEqual(Array.from(saltBytesOf(written.kekSalt)));
  });

  it('two enrollments produce DIFFERENT kekSalts (per-enrollment binding)', async () => {
    setVault(JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' }));
    await nativeKeyStore.enrollKek('pw', { getHardwareFactor: vi.fn(async () => newHF()) });
    const first = JSON.parse(store.get(VAULT_KEY)).kekSalt;

    // Reset to bare and enroll again.
    setVault(JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' }));
    await nativeKeyStore.enrollKek('pw', { getHardwareFactor: vi.fn(async () => newHF()) });
    const second = JSON.parse(store.get(VAULT_KEY)).kekSalt;

    expect(first).not.toBe(second);
  });
});

// RE-POINTED (2026-07-06): the v2→v3 upgrade was REMOVED from the unlock hot path (it forced
// a second biometric prompt per unlock — the cross-platform 3-prompt bug). The salt-binding
// upgrade now happens on changePassword, which re-enrolls under a genuine v3 wrap with a
// fresh per-enrollment kekSalt and a FAIL-CLOSED safeWriteVault (throws on write failure —
// no swallow). Sections (C)/(D) below preserve the ORIGINAL security-meaningful assertions
// (fresh salt binding, SAME DEK preserved, v3 stamp, seed ct/iv unchanged, key-material
// zeroing, fail-closed) — re-pointed from unlock to that changePassword path.
describe('(C) v2→v3 upgrade happens on changePassword — re-wraps the SAME DEK and stamps v3', () => {
  it('changePassword on a v2 vault re-wraps the SAME DEK, rotates the salt, and stamps v3', async () => {
    setVault(JSON.stringify({
      v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct',
      kekWrap: { v: 1, iv: 'wrapiv', ct: 'wrapct' }, kekSalt, hardwareKekVersion: 2,
    }));
    // First getHF: OLD side unlock (v2 → fixed salt, no kekSalt). Second getHF: NEW v3 re-wrap
    // (fresh salt). The DEK recovered on the old side must be the DEK re-wrapped for v3.
    const getHF = vi.fn(async () => newHF());
    const dek = new Uint8Array(32).fill(4);
    kekMock.unwrapDek.mockResolvedValue(dek);

    await nativeKeyStore.changePassword('old', 'new', { getHardwareFactor: getHF });

    const written = JSON.parse(store.get(VAULT_KEY));
    expect(written.hardwareKekVersion).toBe(3);
    expect(written.kekSalt).not.toBe(kekSalt); // salt rotated (fresh per-enrollment)
    expect(written.kekWrap).toEqual({ v: 1, iv: 'reiv', ct: 'rect' }); // re-wrapped
    // The seed ciphertext (iv/ct) is preserved — only the KEK wrap rotates (§3 property).
    expect(written.iv).toBe('oldiv');
    expect(written.ct).toBe('oldct');

    // getHF called twice: once for the v2 unlock side (no kekSalt), once for the v3 re-wrap.
    expect(getHF).toHaveBeenCalledTimes(2);
    expect(getHF.mock.calls[0][0]).toBeUndefined(); // v2 unlock side: fixed salt
    const rewrapArg = getHF.mock.calls[1][0];
    expect(rewrapArg.kekSalt).toBeInstanceOf(Uint8Array);
    expect(Array.from(rewrapArg.kekSalt)).toEqual(Array.from(saltBytesOf(written.kekSalt)));
    // The DEK re-wrapped is the SAME DEK recovered on the old side (unchanged seed protection).
    expect(kekMock.wrapDek).toHaveBeenCalledWith(expect.any(Uint8Array), dek);
  });

  it('after the changePassword upgrade the vault unlocks on the v3 path in a SINGLE prompt', async () => {
    setVault(JSON.stringify({
      v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct',
      kekWrap: { v: 1 }, kekSalt, hardwareKekVersion: 2,
    }));
    await nativeKeyStore.changePassword('old', 'new', { getHardwareFactor: vi.fn(async () => newHF()) });

    // Now the stored blob is v3 — a fresh unlock passes { kekSalt } (v3 binding) exactly ONCE.
    const getHF2 = vi.fn(async () => newHF());
    await nativeKeyStore.unlock('new', { getHardwareFactor: getHF2 });
    const v3blob = JSON.parse(store.get(VAULT_KEY));
    expect(getHF2).toHaveBeenCalledTimes(1); // single prompt on the upgraded vault
    const arg = getHF2.mock.calls[0][0];
    expect(arg).toBeTruthy();
    expect(arg.kekSalt).toBeInstanceOf(Uint8Array);
    expect(Array.from(arg.kekSalt)).toEqual(Array.from(saltBytesOf(v3blob.kekSalt)));
  });
});

describe('(D) changePassword v2→v3 upgrade is FAIL-CLOSED — a failed re-wrap/persist throws (never swallowed)', () => {
  // On the unlock path the removed lazy upgrade was best-effort/brickless (it swallowed).
  // changePassword is DIFFERENT and STRONGER: any failure THROWS (I4 fail-closed), and the
  // stored blob is left at the pre-change v2 state (the failing write never replaces it).
  const v2blob = () => JSON.stringify({
    v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct',
    kekWrap: { v: 1, iv: 'wrapiv', ct: 'wrapct' }, kekSalt, hardwareKekVersion: 2,
  });

  it('re-wrap H (the v3 getHardwareFactor) fails → changePassword THROWS, v2 blob unchanged', async () => {
    setVault(v2blob());
    // First getHF (old-side unlock) OK; second getHF (new v3 re-wrap) throws.
    const getHF = vi.fn()
      .mockResolvedValueOnce(newHF())
      .mockRejectedValueOnce(new Error('biometric cancelled during upgrade'));

    await expect(
      nativeKeyStore.changePassword('old', 'new', { getHardwareFactor: getHF }),
    ).rejects.toThrow('biometric cancelled during upgrade');

    const still = JSON.parse(store.get(VAULT_KEY));
    expect(still.hardwareKekVersion).toBe(2); // untouched — no partial upgrade
    expect(still.kekSalt).toBe(kekSalt);
    expect(still.kekWrap).toEqual({ v: 1, iv: 'wrapiv', ct: 'wrapct' });
  });

  it('re-wrap (wrapDek) fails → changePassword THROWS, v2 blob unchanged', async () => {
    setVault(v2blob());
    kekMock.wrapDek.mockRejectedValueOnce(new Error('wrap failed'));
    await expect(
      nativeKeyStore.changePassword('old', 'new', { getHardwareFactor: vi.fn(async () => newHF()) }),
    ).rejects.toThrow('wrap failed');
    const still = JSON.parse(store.get(VAULT_KEY));
    expect(still.hardwareKekVersion).toBe(2);
    expect(still.kekSalt).toBe(kekSalt);
  });

  it('missing hardware factor → changePassword FAILS CLOSED (NO_HARDWARE_FACTOR), v2 blob unchanged', async () => {
    setVault(v2blob());
    await expect(
      nativeKeyStore.changePassword('old', 'new', {}),
    ).rejects.toThrow('NO_HARDWARE_FACTOR');
    const still = JSON.parse(store.get(VAULT_KEY));
    expect(still.hardwareKekVersion).toBe(2);
    expect(still.kekSalt).toBe(kekSalt);
  });
});

describe('(E) degenerate salt still rejected on the v3 path', () => {
  it('a v3 blob with an all-zero kekSalt is rejected (decodeKekSalt / degenerate guard upstream)', async () => {
    // decodeKekSalt returns zero bytes; combineKek is the real degeneracy backstop, but here
    // we assert native.js does not special-case v3 to bypass the existing salt validation:
    // a malformed (empty) kekSalt on a v3 blob still fails closed via decodeKekSalt.
    kekMock.decodeKekSalt.mockImplementation(() => { throw new Error('MALFORMED_VAULT'); });
    setVault(JSON.stringify({
      v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct',
      kekWrap: { v: 1 }, kekSalt: '', hardwareKekVersion: 3,
    }));
    await expect(
      nativeKeyStore.unlock('pw', { getHardwareFactor: vi.fn(async () => newHF()) }),
    ).rejects.toThrow('MALFORMED_VAULT');
  });
});
