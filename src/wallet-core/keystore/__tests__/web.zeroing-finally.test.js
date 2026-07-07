// src/wallet-core/keystore/__tests__/web.zeroing-finally.test.js
//
// H-NEW-4b — the DEK must be wiped even when a later step throws.
//
// #399 added dek.fill(0) after the DEK is consumed in enrollKek/changePassword,
// but WITHOUT a try/finally. If wrapDek or encryptVaultWithDek throws after the
// DEK is created, the plaintext DEK is never zeroed and lingers in the JS heap
// until GC (readable in a heap dump / via Frida) — exactly the leak H-NEW-4 set
// out to close. unlock() already wraps the DEK lifetime in try/finally; these
// tests pin the SAME guarantee for enrollKek and changePassword behaviourally.
//
// We capture the actual DEK Uint8Array handed to the failing step, force that
// step to throw, and assert the array is all-zeros after the call rejects.

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

describe('enrollKek — DEK zeroed even on throw (H-NEW-4b)', () => {
  it('zeroes the dek when encryptVaultWithDek throws', async () => {
    let captured;
    kekMock.randomDek.mockImplementation(() => {
      captured = new Uint8Array(32).fill(3);
      return captured;
    });
    storeMock.loadVault.mockResolvedValue({ iv: 'x', ct: 'y' });
    vaultMock.decryptVault.mockResolvedValue('seed');
    vaultMock.encryptVaultWithDek.mockRejectedValue(new Error('boom'));

    await expect(
      webKeyStore.enrollKek('pw', { getHardwareFactor: async () => new Uint8Array(32).fill(1) }),
    ).rejects.toThrow('boom');

    expect(captured).toBeDefined();
    expect(isAllZero(captured)).toBe(true);
  });
});

describe('changePassword — DEK zeroed even on throw (H-NEW-4b)', () => {
  it('zeroes the recovered dek when wrapDek throws', async () => {
    let captured;
    kekMock.unwrapDek.mockImplementation(async () => {
      captured = new Uint8Array(32).fill(4);
      return captured;
    });
    storeMock.loadVault.mockResolvedValue({ iv: 'x', ct: 'y', kekWrap: 'w', kekSalt: btoa('s'.repeat(32)) });
    kekMock.wrapDek.mockRejectedValue(new Error('rewrap-fail'));

    await expect(
      webKeyStore.changePassword('oldpassword', 'newpassword', { getHardwareFactor: async () => new Uint8Array(32).fill(1) }),
    ).rejects.toThrow('rewrap-fail');

    expect(captured).toBeDefined();
    expect(isAllZero(captured)).toBe(true);
  });
});
