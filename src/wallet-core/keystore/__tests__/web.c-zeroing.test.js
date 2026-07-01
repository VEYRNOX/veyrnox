// src/wallet-core/keystore/__tests__/web.c-zeroing.test.js
//
// C-factor (PIN-derived KEK input) zeroing on EVERY path, including error paths.
//
// deriveKekC returns the PIN-derived factor C that combineKek consumes alongside
// the hardware factor H. Prior to this change C/oldC/newC were wiped only at the
// call site AFTER combineKek returned, so if combineKek itself threw, the plaintext
// C-factor lingered in the JS heap until GC (I4 violation). These tests capture the
// actual C Uint8Array returned by deriveKekC, force combineKek to throw immediately
// after, and assert the captured array is all-zeros once the call rejects.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const vaultMock = {
  encryptVault: vi.fn(),
  decryptVault: vi.fn(),
  vaultNeedsRekey: vi.fn(() => false),
  deriveKekC: vi.fn(async () => new Uint8Array(32).fill(7)),
  encryptVaultWithDek: vi.fn(async () => ({ iv: 'iv', ct: 'ct' })),
  decryptVaultWithDek: vi.fn(),
};
const storeMock = {
  saveVault: vi.fn(async () => {}),
  loadVault: vi.fn(),
  hasVault: vi.fn(),
  clearVault: vi.fn(),
};
const kekMock = {
  combineKek: vi.fn(async () => new Uint8Array(32).fill(9)),
  randomDek: vi.fn(() => new Uint8Array(32).fill(3)),
  wrapDek: vi.fn(async () => 'wrap'),
  unwrapDek: vi.fn(async () => new Uint8Array(32).fill(4)),
  KEK_ERR: { NO_HARDWARE_FACTOR: 'NO_HARDWARE_FACTOR', UNWRAP_FAILED: 'UNWRAP_FAILED' },
  // I/O-boundary helpers (real behaviour) so callers can decode a valid kekSalt / parse a blob.
  MALFORMED_VAULT: 'KEK_MALFORMED_VAULT',
  decodeKekSalt: (kekSalt) => {
    if (typeof kekSalt !== 'string' || kekSalt.length === 0) throw new Error('KEK_MALFORMED_VAULT');
    let bin; try { bin = atob(kekSalt); } catch { throw new Error('KEK_MALFORMED_VAULT'); }
    const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out;
  },
  parseVaultBlob: (raw) => {
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw !== 'string') throw new Error('KEK_MALFORMED_VAULT');
    try { return JSON.parse(raw); } catch { throw new Error('KEK_MALFORMED_VAULT'); }
  },
};

vi.mock('../../vault.js', () => vaultMock);
vi.mock('../../evm/vaultStore.js', () => storeMock);
vi.mock('../kek.js', () => kekMock);

const { webKeyStore } = await import('../web.js');

const isAllZero = (u8) => u8.every((b) => b === 0);
const kekSalt = btoa('s'.repeat(32));

beforeEach(() => {
  vi.clearAllMocks();
  vaultMock.vaultNeedsRekey.mockReturnValue(false);
  vaultMock.deriveKekC.mockResolvedValue(new Uint8Array(32).fill(7));
  kekMock.combineKek.mockResolvedValue(new Uint8Array(32).fill(9));
  kekMock.randomDek.mockReturnValue(new Uint8Array(32).fill(3));
  kekMock.unwrapDek.mockResolvedValue(new Uint8Array(32).fill(4));
  kekMock.wrapDek.mockResolvedValue('wrap');
});

describe('unlock — C-factor zeroed when combineKek throws', () => {
  it('zeroes C when combineKek throws after C is derived', async () => {
    let C;
    vaultMock.deriveKekC.mockImplementation(async () => {
      C = new Uint8Array(32).fill(7);
      return C;
    });
    storeMock.loadVault.mockResolvedValue({ iv: 'x', ct: 'y', kekWrap: 'w', kekSalt });
    kekMock.combineKek.mockRejectedValue(new Error('combine-fail'));

    await expect(
      webKeyStore.unlock('pw', { getHardwareFactor: async () => new Uint8Array(32).fill(1) }),
    ).rejects.toThrow('combine-fail');

    expect(C).toBeDefined();
    expect(isAllZero(C)).toBe(true);
  });
});

describe('changePassword — oldC zeroed when first combineKek throws', () => {
  it('zeroes oldC when combineKek(H, oldC) throws', async () => {
    let oldC;
    vaultMock.deriveKekC.mockImplementationOnce(async () => {
      oldC = new Uint8Array(32).fill(7);
      return oldC;
    });
    storeMock.loadVault.mockResolvedValue({ iv: 'x', ct: 'y', kekWrap: 'w', kekSalt });
    kekMock.combineKek.mockRejectedValue(new Error('combine-fail'));

    await expect(
      webKeyStore.changePassword('old', 'new', { getHardwareFactor: async () => new Uint8Array(32).fill(1) }),
    ).rejects.toThrow('combine-fail');

    expect(oldC).toBeDefined();
    expect(isAllZero(oldC)).toBe(true);
  });
});

describe('changePassword — newC zeroed when second combineKek throws', () => {
  it('zeroes newC when combineKek(H2, newC) throws', async () => {
    let newC;
    vaultMock.deriveKekC
      .mockImplementationOnce(async () => new Uint8Array(32).fill(7)) // oldC
      .mockImplementationOnce(async () => {
        newC = new Uint8Array(32).fill(6);
        return newC;
      });
    kekMock.combineKek
      .mockImplementationOnce(async () => new Uint8Array(32).fill(9)) // oldKek
      .mockImplementationOnce(async () => {
        throw new Error('combine2-fail');
      });
    storeMock.loadVault.mockResolvedValue({ iv: 'x', ct: 'y', kekWrap: 'w', kekSalt });

    await expect(
      webKeyStore.changePassword('old', 'new', { getHardwareFactor: async () => new Uint8Array(32).fill(1) }),
    ).rejects.toThrow('combine2-fail');

    expect(newC).toBeDefined();
    expect(isAllZero(newC)).toBe(true);
  });
});
