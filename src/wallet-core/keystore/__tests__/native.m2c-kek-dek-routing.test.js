// M2c Enclave-wrapped vault + KEK-DEK inner blob routing.
//
// A vault that is both KEK-enrolled AND Enclave-wrapped stores a kdf:'kek-dek'
// blob inside the Enclave cipher. After hwUnwrap the inner blob must route
// through KEK unwrap (combineKek + unwrapDek + decryptVaultWithDek), NOT
// through decryptVault (which expects an Argon2id blob with a salt field and
// would throw a structural error).

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
  encryptVault: vi.fn(async () => ({ v: 1, kdf: 'argon2id', salt: 's', iv: 'iv', ct: 'ct' })),
  decryptVault: vi.fn(async () => 'seed-via-argon2id'),
  deriveKekC: vi.fn(async () => new Uint8Array(32).fill(7)),
  encryptVaultWithDek: vi.fn(async () => ({ iv: 'newiv', ct: 'newct' })),
  decryptVaultWithDek: vi.fn(async () => 'seed-via-dek'),
  encryptVaultWithDekV3: vi.fn(async () => ({ v: 3, kdf: 'kek-dek', iv: 'v3iv', ct: 'v3ct' })),
  VAULT_VERSION_V3: 3,
  AAD_V3_MIGRATION_ENABLED: false,
};
vi.mock('../../vault.js', () => vaultMock);

const kekMock = {
  combineKek: vi.fn(async () => new Uint8Array(32).fill(9)),
  randomDek: vi.fn(() => new Uint8Array(32).fill(3)),
  wrapDek: vi.fn(async () => ({ v: 1, iv: 'iv', ct: 'ct' })),
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

const kekSalt = btoa('s'.repeat(32));

const kekDekInnerBlob = { v: 2, kdf: 'kek-dek', iv: 'inner-iv', ct: 'inner-ct', kekWrap: { v: 1, iv: 'kwiv', ct: 'kwct' }, kekSalt };

const enclaveMock = {
  isHardwareKeyAvailable: vi.fn(async () => ({ backing: 'se', biometryEnrolled: true })),
  createWrappingKey: vi.fn(async () => {}),
  hwWrap: vi.fn(async () => 'ct'),
  hwUnwrap: vi.fn(async () => btoa(JSON.stringify(kekDekInnerBlob))),
  deleteWrappingKey: vi.fn(async () => {}),
};
vi.mock('../../../plugins/veyrnoxEnclave.js', () => enclaveMock);

const { nativeKeyStore } = await import('../native.js');

const newHF = () => new Uint8Array(32).fill(1);

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
});

describe('M2c Enclave + KEK-DEK dual-enrolled vault unlock', () => {
  it('routes through KEK unwrap (combineKek + unwrapDek + decryptVaultWithDek), not decryptVault', async () => {
    setVault(JSON.stringify({ wrap: 'enclave-v1', hw: 'enclave-ciphertext' }));

    const result = await nativeKeyStore.unlock('test-password', {
      getHardwareFactor: newHF,
    });

    expect(result).toBe('seed-via-dek');
    expect(vaultMock.decryptVaultWithDek).toHaveBeenCalledTimes(1);
    expect(vaultMock.decryptVault).not.toHaveBeenCalled();
    expect(kekMock.unwrapDek).toHaveBeenCalledTimes(1);
    expect(kekMock.combineKek).toHaveBeenCalledTimes(1);
    expect(vaultMock.deriveKekC).toHaveBeenCalledTimes(1);
  });

  it('fails closed (NO_HARDWARE_FACTOR) when getHardwareFactor is absent', async () => {
    setVault(JSON.stringify({ wrap: 'enclave-v1', hw: 'enclave-ciphertext' }));

    await expect(nativeKeyStore.unlock('test-password', {}))
      .rejects.toThrow('NO_HARDWARE_FACTOR');
    expect(vaultMock.decryptVault).not.toHaveBeenCalled();
    expect(vaultMock.decryptVaultWithDek).not.toHaveBeenCalled();
  });

  it('still uses decryptVault for a non-KEK Enclave-wrapped blob (Argon2id inner)', async () => {
    const argon2idInner = { v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' };
    enclaveMock.hwUnwrap.mockResolvedValueOnce(btoa(JSON.stringify(argon2idInner)));
    setVault(JSON.stringify({ wrap: 'enclave-v1', hw: 'enclave-ciphertext' }));

    const result = await nativeKeyStore.unlock('test-password', {});

    expect(result).toBe('seed-via-argon2id');
    expect(vaultMock.decryptVault).toHaveBeenCalledTimes(1);
    expect(kekMock.unwrapDek).not.toHaveBeenCalled();
    expect(kekMock.combineKek).not.toHaveBeenCalled();
  });
});
