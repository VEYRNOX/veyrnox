// src/wallet-core/keystore/__tests__/web.blob-shape-validation.test.js
//
// QA I/O-validation (MED) — the web KeyStore atob()s blob.kekSalt on the KEK paths.
// A missing/empty/non-base64 kekSalt (with kekWrap present) must FAIL CLOSED with the
// STABLE KEK_ERR.MALFORMED_VAULT, never a raw InvalidCharacterError. loadVault()
// already returns a parsed object here, so JSON.parse corruption is native-only; this
// pins the kekSalt-decode contract on web.
//
// vault + store + kek are mocked (established pattern). Uses the REAL KEK_ERR codes.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const vaultMock = {
  encryptVault: vi.fn(async () => ({ v: 1 })),
  decryptVault: vi.fn(async () => 'seed'),
  vaultNeedsRekey: vi.fn(() => false),
  deriveKekC: vi.fn(async () => new Uint8Array(32).fill(7)),
  encryptVaultWithDek: vi.fn(async () => ({ iv: 'iv', ct: 'ct' })),
  decryptVaultWithDek: vi.fn(async () => 'seed'),
};
const storeMock = {
  saveVault: vi.fn(async () => {}),
  loadVault: vi.fn(async () => null),
  hasVault: vi.fn(),
  clearVault: vi.fn(),
};
vi.mock('../../vault.js', () => vaultMock);
vi.mock('../../evm/vaultStore.js', () => storeMock);

const { KEK_ERR } = await import('../kek.js');
vi.mock('../kek.js', async () => {
  const actual = await vi.importActual('../kek.js');
  return {
    ...actual,
    combineKek: vi.fn(async () => new Uint8Array(32).fill(9)),
    randomDek: vi.fn(() => new Uint8Array(32).fill(3)),
    wrapDek: vi.fn(async () => 'wrap'),
    unwrapDek: vi.fn(async () => new Uint8Array(32).fill(4)),
  };
});

const { webKeyStore } = await import('../web.js');
const newHF = () => new Uint8Array(32).fill(1);

beforeEach(() => {
  vi.clearAllMocks();
  storeMock.loadVault.mockResolvedValue(null);
});

describe('web atob(kekSalt) guard — malformed kekSalt with kekWrap present → MALFORMED_VAULT', () => {
  it('unlock throws MALFORMED_VAULT when kekSalt is missing', async () => {
    storeMock.loadVault.mockResolvedValue({ iv: 'x', ct: 'y', kekWrap: 'w' });
    await expect(
      webKeyStore.unlock('pw', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow(KEK_ERR.MALFORMED_VAULT);
  });

  it('unlock throws MALFORMED_VAULT when kekSalt is empty string', async () => {
    storeMock.loadVault.mockResolvedValue({ iv: 'x', ct: 'y', kekWrap: 'w', kekSalt: '' });
    await expect(
      webKeyStore.unlock('pw', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow(KEK_ERR.MALFORMED_VAULT);
  });

  it('unlock throws MALFORMED_VAULT when kekSalt is not valid base64', async () => {
    storeMock.loadVault.mockResolvedValue({ iv: 'x', ct: 'y', kekWrap: 'w', kekSalt: '!!!not b64!!!' });
    await expect(
      webKeyStore.unlock('pw', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow(KEK_ERR.MALFORMED_VAULT);
  });

  it('unenrollKek throws MALFORMED_VAULT when kekSalt is not valid base64', async () => {
    storeMock.loadVault.mockResolvedValue({ iv: 'x', ct: 'y', kekWrap: 'w', kekSalt: '!!!not b64!!!' });
    await expect(
      webKeyStore.unenrollKek('pw', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow(KEK_ERR.MALFORMED_VAULT);
  });

  it('changePassword throws MALFORMED_VAULT when kekSalt is not valid base64', async () => {
    storeMock.loadVault.mockResolvedValue({ iv: 'x', ct: 'y', kekWrap: 'w', kekSalt: '!!!not b64!!!' });
    await expect(
      webKeyStore.changePassword('old', 'new', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow(KEK_ERR.MALFORMED_VAULT);
  });

  // F-08 (audit, I4): a kdf='kek-dek' blob with NO kekWrap must fail closed with the
  // stable MALFORMED_VAULT code — never fall through to bare decryptVault() and surface
  // a misleading "wrong password" error.
  it('unlock throws MALFORMED_VAULT when kdf=kek-dek but kekWrap is absent', async () => {
    storeMock.loadVault.mockResolvedValue({ iv: 'x', ct: 'y', kdf: 'kek-dek' });
    await expect(
      webKeyStore.unlock('pw', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow(KEK_ERR.MALFORMED_VAULT);
  });
});
