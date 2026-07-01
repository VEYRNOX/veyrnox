// src/wallet-core/keystore/__tests__/native.blob-shape-validation.test.js
//
// QA I/O-validation (MED) — the native KeyStore reads a stored vault blob and:
//   (a) JSON.parse(raw)s it — a corrupt secure-store value must not throw a RAW
//       SyntaxError; it must map to the STABLE KEK_ERR.MALFORMED_VAULT.
//   (b) atob(blob.kekSalt)s it on the KEK paths — a missing/empty/non-base64
//       kekSalt (with kekWrap present) must throw KEK_ERR.MALFORMED_VAULT, never a
//       raw InvalidCharacterError.
//   (c) hasVaultKekWrap is the BADGE source-of-truth: an unreadable blob is treated
//       as "not KEK-enrolled" (false) so the badge reads OFF safely — it must NOT
//       throw a raw SyntaxError there.
//
// Every failure path still FAILS CLOSED (throws/returns false — never fabricates H,
// never a partial success). The native plugin + vault + kek are mocked (established
// JS-orchestration-only pattern). Uses the REAL KEK_ERR codes.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const secureStoreMock = {
  setKeyPrefix: vi.fn(async () => {}),
  setSynchronize: vi.fn(async () => {}),
  setDefaultKeychainAccess: vi.fn(async () => {}),
  get: vi.fn(async () => null),
  set: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
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
  decryptVault: vi.fn(async () => 'seed'),
  deriveKekC: vi.fn(async () => new Uint8Array(32).fill(7)),
  encryptVaultWithDek: vi.fn(async () => ({ iv: 'iv', ct: 'ct' })),
  decryptVaultWithDek: vi.fn(async () => 'seed'),
};
vi.mock('../../vault.js', () => vaultMock);

// Use the REAL kek.js so MALFORMED_VAULT is the genuine exported code.
const { KEK_ERR } = await import('../kek.js');
vi.mock('../kek.js', async () => {
  const actual = await vi.importActual('../kek.js');
  return {
    ...actual,
    combineKek: vi.fn(async () => new Uint8Array(32).fill(9)),
    randomDek: vi.fn(() => new Uint8Array(32).fill(3)),
    wrapDek: vi.fn(async () => ({ v: 1, iv: 'iv', ct: 'ct' })),
    unwrapDek: vi.fn(async () => new Uint8Array(32).fill(4)),
  };
});

vi.mock('../hardware.js', () => ({
  getHardwareFactor: vi.fn(async () => new Uint8Array(32).fill(1)),
  clearHardwareCredential: vi.fn(async () => {}),
}));

const { nativeKeyStore } = await import('../native.js');
const newHF = () => new Uint8Array(32).fill(1);

beforeEach(() => {
  vi.clearAllMocks();
  secureStoreMock.get.mockResolvedValue(null);
});

describe('MALFORMED_VAULT is a stable exported code', () => {
  it('exists on KEK_ERR', () => {
    expect(typeof KEK_ERR.MALFORMED_VAULT).toBe('string');
    expect(KEK_ERR.MALFORMED_VAULT.length).toBeGreaterThan(0);
  });
});

describe('JSON.parse corruption → MALFORMED_VAULT (not raw SyntaxError)', () => {
  it('unlock throws MALFORMED_VAULT on a corrupt stored blob', async () => {
    secureStoreMock.get.mockResolvedValue('{not-json');
    await expect(
      nativeKeyStore.unlock('pw', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow(KEK_ERR.MALFORMED_VAULT);
  });

  it('changePassword throws MALFORMED_VAULT on a corrupt stored blob', async () => {
    secureStoreMock.get.mockResolvedValue('{not-json');
    await expect(
      nativeKeyStore.changePassword('old', 'new', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow(KEK_ERR.MALFORMED_VAULT);
  });
});

describe('hasVaultKekWrap (badge source-of-truth) — corrupt blob reads OFF (false), never throws', () => {
  it('returns false on a corrupt stored blob rather than throwing', async () => {
    secureStoreMock.get.mockResolvedValue('{not-json');
    await expect(nativeKeyStore.hasVaultKekWrap()).resolves.toBe(false);
  });
});

describe('atob(kekSalt) guard — malformed kekSalt with kekWrap present → MALFORMED_VAULT', () => {
  it('unlock throws MALFORMED_VAULT when kekSalt is missing', async () => {
    secureStoreMock.get.mockResolvedValue(JSON.stringify({ iv: 'x', ct: 'y', kekWrap: { v: 1 } }));
    await expect(
      nativeKeyStore.unlock('pw', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow(KEK_ERR.MALFORMED_VAULT);
  });

  it('unlock throws MALFORMED_VAULT when kekSalt is empty string', async () => {
    secureStoreMock.get.mockResolvedValue(JSON.stringify({ iv: 'x', ct: 'y', kekWrap: { v: 1 }, kekSalt: '' }));
    await expect(
      nativeKeyStore.unlock('pw', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow(KEK_ERR.MALFORMED_VAULT);
  });

  it('unlock throws MALFORMED_VAULT when kekSalt is not valid base64', async () => {
    secureStoreMock.get.mockResolvedValue(JSON.stringify({ iv: 'x', ct: 'y', kekWrap: { v: 1 }, kekSalt: '!!!not b64!!!' }));
    await expect(
      nativeKeyStore.unlock('pw', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow(KEK_ERR.MALFORMED_VAULT);
  });

  it('unenrollKek throws MALFORMED_VAULT when kekSalt is not valid base64', async () => {
    secureStoreMock.get.mockResolvedValue(JSON.stringify({ iv: 'x', ct: 'y', kekWrap: { v: 1 }, kekSalt: '!!!not b64!!!' }));
    await expect(
      nativeKeyStore.unenrollKek('pw', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow(KEK_ERR.MALFORMED_VAULT);
  });

  it('changePassword throws MALFORMED_VAULT when kekSalt is not valid base64', async () => {
    secureStoreMock.get.mockResolvedValue(JSON.stringify({ iv: 'x', ct: 'y', kekWrap: { v: 1 }, kekSalt: '!!!not b64!!!' }));
    await expect(
      nativeKeyStore.changePassword('old', 'new', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow(KEK_ERR.MALFORMED_VAULT);
  });
});
