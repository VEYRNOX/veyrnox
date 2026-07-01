// src/wallet-core/keystore/__tests__/web.kek-zeroing.test.js
//
// KEK / H2 zeroing — the derived key-encryption key (and the H2 hardware-factor
// copy in changePassword) must be wiped on EVERY path, including error paths.
//
// combineKek returns the symmetric KEK that wraps/unwraps the DEK. Prior to this
// change it was zeroed only on the happy path (or not at all), so if a later step
// threw, the plaintext KEK lingered in the JS heap until GC. These tests capture
// the actual KEK Uint8Array(s) returned by combineKek, force a later step to
// throw, and assert each is all-zeros after the call rejects. The same is pinned
// for the H2 copy of the hardware factor in changePassword.

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
  vaultMock.encryptVaultWithDek.mockResolvedValue({ iv: 'iv', ct: 'ct' });
  kekMock.wrapDek.mockResolvedValue('wrap');
});

describe('unlock — KEK zeroed even on throw', () => {
  it('zeroes the kek when unwrapDek throws', async () => {
    let kek;
    kekMock.combineKek.mockImplementation(async () => {
      kek = new Uint8Array(32).fill(9);
      return kek;
    });
    storeMock.loadVault.mockResolvedValue({ iv: 'x', ct: 'y', kekWrap: 'w', kekSalt });
    kekMock.unwrapDek.mockRejectedValue(new Error('unwrap-fail'));

    await expect(
      webKeyStore.unlock('pw', { getHardwareFactor: async () => new Uint8Array(32).fill(1) }),
    ).rejects.toThrow('unwrap-fail');

    expect(kek).toBeDefined();
    expect(isAllZero(kek)).toBe(true);
  });
});

describe('enrollKek — KEK zeroed even on throw', () => {
  it('zeroes the kek when wrapDek throws', async () => {
    let kek;
    kekMock.combineKek.mockImplementation(async () => {
      kek = new Uint8Array(32).fill(9);
      return kek;
    });
    storeMock.loadVault.mockResolvedValue({ iv: 'x', ct: 'y' });
    vaultMock.decryptVault.mockResolvedValue('seed');
    kekMock.wrapDek.mockRejectedValue(new Error('wrap-fail'));

    await expect(
      webKeyStore.enrollKek('pw', { getHardwareFactor: async () => new Uint8Array(32).fill(1) }),
    ).rejects.toThrow('wrap-fail');

    expect(kek).toBeDefined();
    expect(isAllZero(kek)).toBe(true);
  });
});

describe('changePassword — oldKek/newKek zeroed even on throw', () => {
  it('zeroes the oldKek when unwrapDek throws', async () => {
    let oldKek;
    kekMock.combineKek.mockImplementationOnce(async () => {
      oldKek = new Uint8Array(32).fill(9);
      return oldKek;
    });
    storeMock.loadVault.mockResolvedValue({ iv: 'x', ct: 'y', kekWrap: 'w', kekSalt });
    kekMock.unwrapDek.mockRejectedValue(new Error('unwrap-fail'));

    await expect(
      webKeyStore.changePassword('old', 'new', { getHardwareFactor: async () => new Uint8Array(32).fill(1) }),
    ).rejects.toThrow('unwrap-fail');

    expect(oldKek).toBeDefined();
    expect(isAllZero(oldKek)).toBe(true);
  });

  it('zeroes the newKek when wrapDek throws', async () => {
    let newKek;
    kekMock.combineKek
      .mockImplementationOnce(async () => new Uint8Array(32).fill(9)) // oldKek
      .mockImplementationOnce(async () => {
        newKek = new Uint8Array(32).fill(8);
        return newKek;
      });
    storeMock.loadVault.mockResolvedValue({ iv: 'x', ct: 'y', kekWrap: 'w', kekSalt });
    kekMock.wrapDek.mockRejectedValue(new Error('rewrap-fail'));

    await expect(
      webKeyStore.changePassword('old', 'new', { getHardwareFactor: async () => new Uint8Array(32).fill(1) }),
    ).rejects.toThrow('rewrap-fail');

    expect(newKek).toBeDefined();
    expect(isAllZero(newKek)).toBe(true);
  });
});

describe('changePassword — H2 hardware-factor copy zeroed on early throw', () => {
  it('zeroes H2 when deriveKekC (newC) throws before the second combineKek', async () => {
    let H2;
    // capture H2: it is H.slice() of the hardware factor. The factor is fill(1),
    // so H2 starts as fill(1). We intercept it via the hardware factor identity:
    // H.slice() produces a distinct array; capture by spying on Uint8Array.slice
    // for the specific hardware-factor instance.
    const hf = new Uint8Array(32).fill(1);
    const origSlice = hf.slice.bind(hf);
    hf.slice = (...args) => {
      H2 = origSlice(...args);
      return H2;
    };

    storeMock.loadVault.mockResolvedValue({ iv: 'x', ct: 'y', kekWrap: 'w', kekSalt });
    // oldKek combine succeeds, unwrap succeeds, then newC derivation throws.
    vaultMock.deriveKekC
      .mockResolvedValueOnce(new Uint8Array(32).fill(7)) // oldC
      .mockRejectedValueOnce(new Error('newC-fail')); // newC throws -> early path

    await expect(
      webKeyStore.changePassword('old', 'new', { getHardwareFactor: async () => hf }),
    ).rejects.toThrow('newC-fail');

    expect(H2).toBeDefined();
    expect(isAllZero(H2)).toBe(true);
  });
});
