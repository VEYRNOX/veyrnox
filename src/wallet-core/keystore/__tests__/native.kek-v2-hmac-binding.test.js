// src/wallet-core/keystore/__tests__/native.kek-v2-hmac-binding.test.js
//
// C-1 (CRITICAL): Android HMAC input was a global fixed constant (PRF_EVAL_SALT),
// so HMAC(androidKeyStoreKey, FIXED_SALT) produced an identical H for EVERY vault on
// the same device. The v2 protocol binds H to the per-enrollment kekSalt: native.js
// passes blob.kekSalt to getHardwareFactor({ kekSalt }) and stamps the vault blob with
// hardwareKekVersion: 2. Legacy v1 vaults (no hardwareKekVersion) keep calling
// getHardwareFactor() with NO kekSalt for backwards compatibility.
//
// Tests assert the CONTRACT: what native.js passes to getHF and what version it stamps.
// Mocking pattern mirrors native.kek-preserving-repersist.test.js.

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
};
vi.mock('../kek.js', () => kekMock);

vi.mock('../hardware.js', () => ({
  getHardwareFactor: vi.fn(async () => new Uint8Array(32).fill(1)),
  clearHardwareCredential: vi.fn(async () => {}),
}));

const { nativeKeyStore } = await import('../native.js');

const kekSalt = btoa('s'.repeat(32));
const newHF = () => new Uint8Array(32).fill(1);

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
  kekMock.wrapDek.mockResolvedValue({ v: 1, iv: 'iv', ct: 'ct' });
  kekMock.randomDek.mockReturnValue(new Uint8Array(32).fill(3));
});

// Decode the base64 kekSalt string the blob stores into the Uint8Array native.js
// is expected to hand to getHardwareFactor({ kekSalt }).
const saltBytesOf = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

describe('(1) enrollKek — v2 protocol: binds H to fresh kekSalt and stamps hardwareKekVersion:2', () => {
  it('passes the generated kekSalt to getHardwareFactor and saves hardwareKekVersion:2', async () => {
    setVault(JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' }));
    const getHF = vi.fn(async () => newHF());

    await nativeKeyStore.enrollKek('pw', { getHardwareFactor: getHF });

    const written = JSON.parse(store.get(VAULT_KEY));
    expect(written.hardwareKekVersion).toBe(2);

    // getHF must have been called with { kekSalt } matching the salt written to the blob.
    expect(getHF).toHaveBeenCalledTimes(1);
    const arg = getHF.mock.calls[0][0];
    expect(arg).toBeTruthy();
    expect(arg.kekSalt).toBeInstanceOf(Uint8Array);
    expect(Array.from(arg.kekSalt)).toEqual(Array.from(saltBytesOf(written.kekSalt)));
  });
});

describe('(2) _unlockInner — v2 blob: reads blob.kekSalt and passes it to getHardwareFactor', () => {
  it('passes { kekSalt } decoded from blob.kekSalt on a v2 vault', async () => {
    setVault(JSON.stringify({
      v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct',
      kekWrap: { v: 1 }, kekSalt, hardwareKekVersion: 2,
    }));
    const getHF = vi.fn(async () => newHF());

    await nativeKeyStore.unlock('pw', { getHardwareFactor: getHF });

    expect(getHF).toHaveBeenCalledTimes(1);
    const arg = getHF.mock.calls[0][0];
    expect(arg).toBeTruthy();
    expect(arg.kekSalt).toBeInstanceOf(Uint8Array);
    expect(Array.from(arg.kekSalt)).toEqual(Array.from(saltBytesOf(kekSalt)));
  });
});

describe('(3) _unlockInner — v1 blob (no hardwareKekVersion): calls getHardwareFactor with NO kekSalt', () => {
  it('does not pass a kekSalt for a legacy v1 vault (backwards compat)', async () => {
    setVault(JSON.stringify({
      v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct',
      kekWrap: { v: 1 }, kekSalt,
      // NO hardwareKekVersion → v1
    }));
    const getHF = vi.fn(async () => newHF());

    await nativeKeyStore.unlock('pw', { getHardwareFactor: getHF });

    expect(getHF).toHaveBeenCalledTimes(1);
    const arg = getHF.mock.calls[0][0];
    // v1 legacy path: either no argument, or an argument without kekSalt.
    if (arg !== undefined) {
      expect(arg.kekSalt).toBeUndefined();
    }
  });
});

describe('(4) changePassword — v2 vault: passes existing kekSalt on unlock, fresh kekSalt on re-enroll', () => {
  it('unlocks with the stored kekSalt and re-wraps under a NEW v2 kekSalt', async () => {
    setVault(JSON.stringify({
      v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct',
      kekWrap: { v: 1 }, kekSalt, hardwareKekVersion: 2,
    }));
    const getHF = vi.fn(async () => newHF());

    await nativeKeyStore.changePassword('old', 'new', { getHardwareFactor: getHF });

    // getHF is called for the OLD (unlock) side and the NEW (re-wrap) side.
    expect(getHF).toHaveBeenCalledTimes(2);

    // Old side: the existing stored kekSalt.
    const oldArg = getHF.mock.calls[0][0];
    expect(oldArg.kekSalt).toBeInstanceOf(Uint8Array);
    expect(Array.from(oldArg.kekSalt)).toEqual(Array.from(saltBytesOf(kekSalt)));

    const written = JSON.parse(store.get(VAULT_KEY));
    expect(written.hardwareKekVersion).toBe(2);
    // The re-wrap side used a FRESH kekSalt (rotated), matching the new blob.
    const newArg = getHF.mock.calls[1][0];
    expect(newArg.kekSalt).toBeInstanceOf(Uint8Array);
    expect(Array.from(newArg.kekSalt)).toEqual(Array.from(saltBytesOf(written.kekSalt)));
    // Salt must actually have rotated.
    expect(written.kekSalt).not.toBe(kekSalt);
  });
});
