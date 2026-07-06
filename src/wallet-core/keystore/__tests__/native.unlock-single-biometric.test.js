// src/wallet-core/keystore/__tests__/native.unlock-single-biometric.test.js
//
// SINGLE-BIOMETRIC-PER-UNLOCK invariant (2026-07-06).
//
// BUG (cross-platform, iPhone Face ID + Android fingerprint): unlocking a KEK-enrolled
// vault fired the OS biometric sheet THREE times before the app opened. Two of those are
// LOAD-BEARING and unavoidable (biometric cache-gate in biometricUnlock.js, then the KEK
// H-factor decrypt inside _unlockInner). The THIRD was the C-1 v2→v3 lazy migration that
// re-derived H under a FRESH salt on the unlock hot path — it fired ONLY for a
// hardwareKekVersion:2 vault, so v2 vaults unlocked with an extra prompt and could
// re-prompt forever if the migration write kept failing.
//
// FIX: remove the lazy v2→v3 migration from the unlock path so unlock calls
// getHardwareFactor EXACTLY ONCE regardless of vault version. The v2→v3 upgrade still
// happens on changePassword (which re-enrolls under a genuine v3 wrap with a fresh
// per-enrollment salt and fail-closed safeWriteVault). See native.js changePassword.
//
// Mocking pattern mirrors native.kek-v3-migration.test.js.

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

const { nativeKeyStore } = await import('../native.js');

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

const v2blob = () => JSON.stringify({
  v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct',
  kekWrap: { v: 1, iv: 'wrapiv', ct: 'wrapct' }, kekSalt, hardwareKekVersion: 2,
});
const v3blob = () => JSON.stringify({
  v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct',
  kekWrap: { v: 1, iv: 'wrapiv', ct: 'wrapct' }, kekSalt, hardwareKekVersion: 3,
});

describe('unlock triggers getHardwareFactor exactly ONCE (single biometric prompt)', () => {
  // RED before the fix: a v2 vault called getHF TWICE (once to unlock, once for the lazy
  // v2→v3 re-wrap). This is the extra biometric prompt (the "3rd prompt" on device once the
  // biometricUnlock cache-gate is counted). The fix removes the lazy migration from unlock.
  it('v2 KEK vault → getHardwareFactor called exactly once', async () => {
    setVault(v2blob());
    const getHF = vi.fn(async () => newHF());

    const secret = await nativeKeyStore.unlock('pw', { getHardwareFactor: getHF });

    expect(secret).toBe('seed');
    expect(getHF).toHaveBeenCalledTimes(1);
    // The single call uses the fixed salt (v2 → undefined per hfOptsForBlob).
    expect(getHF.mock.calls[0][0]).toBeUndefined();
  });

  // Regression guard: a v3 vault was already single-prompt; it must stay single-prompt.
  it('v3 KEK vault → getHardwareFactor called exactly once (bound to kekSalt)', async () => {
    setVault(v3blob());
    const getHF = vi.fn(async () => newHF());

    const secret = await nativeKeyStore.unlock('pw', { getHardwareFactor: getHF });

    expect(secret).toBe('seed');
    expect(getHF).toHaveBeenCalledTimes(1);
    const arg = getHF.mock.calls[0][0];
    expect(arg).toBeTruthy();
    expect(arg.kekSalt).toBeInstanceOf(Uint8Array);
    expect(Array.from(arg.kekSalt)).toEqual(Array.from(saltBytesOf(kekSalt)));
  });

  // No functional regression: both versions still return the correct decrypted seed.
  it('v2 and v3 both decrypt to the correct seed', async () => {
    setVault(v2blob());
    expect(await nativeKeyStore.unlock('pw', { getHardwareFactor: vi.fn(async () => newHF()) })).toBe('seed');
    setVault(v3blob());
    expect(await nativeKeyStore.unlock('pw', { getHardwareFactor: vi.fn(async () => newHF()) })).toBe('seed');
  });

  // Unlock no longer mutates the stored vault: a v2 blob STAYS v2 on unlock (the upgrade
  // moved to changePassword). This pins that unlock is a pure read w.r.t. the version stamp.
  it('unlocking a v2 vault does NOT migrate it (blob stays v2, byte-for-byte)', async () => {
    setVault(v2blob());
    const before = store.get(VAULT_KEY);
    await nativeKeyStore.unlock('pw', { getHardwareFactor: vi.fn(async () => newHF()) });
    expect(store.get(VAULT_KEY)).toBe(before);
    const parsed = JSON.parse(store.get(VAULT_KEY));
    expect(parsed.hardwareKekVersion).toBe(2);
    expect(parsed.kekSalt).toBe(kekSalt);
  });
});
