// src/wallet-core/keystore/__tests__/native.zeroize.test.js
//
// L-2 (2026-07-28 audit) — saltBytes must be wiped on EVERY path, including a throw
// from getHardwareFactorWithLockoutFallback (biometric cancel / lockout / plugin
// failure). Before the fix, `decodeKekSalt` and the awaited getHF call ran OUTSIDE
// the try/finally in _unlockInner, saveVaultContents, and upgradeKekToV3, so a throw
// from getHF left the decoded salt bytes in the JS heap until GC.
//
// The regression is asserted BEHAVIOURALLY: we capture the Uint8Array returned by
// the mocked decodeKekSalt, force getHardwareFactor to reject, and check the salt
// bytes are all zeros after the call settles.

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

// Capture every Uint8Array decodeKekSalt hands out so a test can assert it was wiped.
const decodedSalts = [];
const kekMock = {
  combineKek: vi.fn(async () => new Uint8Array(32).fill(9)),
  randomDek: vi.fn(() => new Uint8Array(32).fill(3)),
  wrapDek: vi.fn(async () => ({ v: 1, iv: 'iv', ct: 'ct' })),
  unwrapDek: vi.fn(async () => new Uint8Array(32).fill(4)),
  KEK_ERR: { NO_HARDWARE_FACTOR: 'NO_HARDWARE_FACTOR', UNWRAP_FAILED: 'UNWRAP_FAILED' },
  MALFORMED_VAULT: 'KEK_MALFORMED_VAULT',
  decodeKekSalt: vi.fn((kekSalt) => {
    if (typeof kekSalt !== 'string' || kekSalt.length === 0) throw new Error('KEK_MALFORMED_VAULT');
    let bin; try { bin = atob(kekSalt); } catch { throw new Error('KEK_MALFORMED_VAULT'); }
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    decodedSalts.push(out);
    return out;
  }),
  parseVaultBlob: (raw) => {
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw !== 'string') throw new Error('KEK_MALFORMED_VAULT');
    try { return JSON.parse(raw); } catch { throw new Error('KEK_MALFORMED_VAULT'); }
  },
};
vi.mock('../kek.js', () => kekMock);

vi.mock('../hardware.js', () => ({
  getHardwareFactor: vi.fn(async () => new Uint8Array(32).fill(1)),
  clearHardwareCredential: vi.fn(async () => {}),
}));

const { nativeKeyStore } = await import('../native.js');

const isAllZero = (u8) => u8.every((b) => b === 0);
const kekSalt = btoa('s'.repeat(32));

beforeEach(() => {
  vi.clearAllMocks();
  decodedSalts.length = 0;
  vaultMock.deriveKekC.mockResolvedValue(new Uint8Array(32).fill(7));
  vaultMock.decryptVault.mockResolvedValue('seed');
  vaultMock.decryptVaultWithDek.mockResolvedValue('seed');
  vaultMock.encryptVault.mockResolvedValue({ v: 1, kdf: 'argon2id', salt: 's', iv: 'iv', ct: 'ct' });
  vaultMock.encryptVaultWithDek.mockResolvedValue({ iv: 'iv', ct: 'ct' });
  kekMock.combineKek.mockResolvedValue(new Uint8Array(32).fill(9));
  kekMock.randomDek.mockReturnValue(new Uint8Array(32).fill(3));
  kekMock.unwrapDek.mockResolvedValue(new Uint8Array(32).fill(4));
  kekMock.wrapDek.mockResolvedValue({ v: 1, iv: 'iv', ct: 'ct' });
  secureStoreMock.get.mockResolvedValue(null);
  secureStoreMock.set.mockResolvedValue(undefined);
});

describe('L-2 saltBytes zeroization on getHardwareFactor throw', () => {
  it('_unlockInner: saltBytes wiped when getHardwareFactor rejects', async () => {
    secureStoreMock.get.mockResolvedValue(JSON.stringify({ iv: 'x', ct: 'y', kekWrap: { v: 1 }, kekSalt }));
    const getHF = vi.fn(async () => { throw new Error('biometric-cancel'); });

    await expect(nativeKeyStore.unlock('pw', { getHardwareFactor: getHF })).rejects.toThrow('biometric-cancel');

    expect(decodedSalts.length).toBeGreaterThan(0);
    for (const salt of decodedSalts) expect(isAllZero(salt)).toBe(true);
  });

  it('saveVaultContents: saltBytes wiped when getHardwareFactor rejects', async () => {
    secureStoreMock.get.mockResolvedValue(JSON.stringify({ iv: 'x', ct: 'y', kekWrap: { v: 1 }, kekSalt }));
    const getHF = vi.fn(async () => { throw new Error('biometric-cancel'); });

    await expect(
      nativeKeyStore.saveVaultContents('new-secret', 'pw', { getHardwareFactor: getHF }),
    ).rejects.toThrow('biometric-cancel');

    expect(decodedSalts.length).toBeGreaterThan(0);
    for (const salt of decodedSalts) expect(isAllZero(salt)).toBe(true);
  });

  it('upgradeKekToV3: oldSaltBytes wiped when getHardwareFactor rejects on the old side', async () => {
    // hardwareKekVersion 1 (or 2) forces the actual upgrade branch (not the v3 short-circuit).
    secureStoreMock.get.mockResolvedValue(JSON.stringify({
      iv: 'x', ct: 'y', kekWrap: { v: 1 }, kekSalt, hardwareKekVersion: 1,
    }));
    const getHF = vi.fn(async () => { throw new Error('biometric-cancel'); });

    await expect(
      nativeKeyStore.upgradeKekToV3('pw', { getHardwareFactor: getHF }),
    ).rejects.toThrow('biometric-cancel');

    // At least oldSaltBytes was decoded before getHF threw; assert every decoded salt zeroed.
    expect(decodedSalts.length).toBeGreaterThan(0);
    for (const salt of decodedSalts) expect(isAllZero(salt)).toBe(true);
  });

  // M-2 (2026-08-03 audit) — the L-2 fix listed three call sites and unenrollKek
  // was not one of them. It kept the pre-fix shape: decodeKekSalt and the
  // biometric-gated getHardwareFactorWithLockoutFallback both ran BEFORE the
  // try, so a throw between them skipped the finally entirely.
  //
  // The throw is not hypothetical: cancelling the biometric prompt is the exact
  // scenario the L-2 commit cites, and "remove hardware protection" is a flow a
  // user may well back out of halfway.
  it('unenrollKek: saltBytes wiped when getHardwareFactor rejects (M-2)', async () => {
    secureStoreMock.get.mockResolvedValue(JSON.stringify({ iv: 'x', ct: 'y', kekWrap: { v: 1 }, kekSalt }));
    const getHF = vi.fn(async () => { throw new Error('biometric-cancel'); });

    await expect(
      nativeKeyStore.unenrollKek('pw', { getHardwareFactor: getHF }),
    ).rejects.toThrow('biometric-cancel');

    expect(decodedSalts.length).toBeGreaterThan(0);
    for (const salt of decodedSalts) expect(isAllZero(salt)).toBe(true);
  });

  it('unenrollKek: saltBytes wiped on the SUCCESS path too', async () => {
    // The control that proves the fix did not simply move the wipe onto the
    // error path. safeWriteVault re-reads what it wrote to verify it, so `get`
    // has to reflect `set` or the call throws VAULT_WRITE_VERIFY_FAILED before
    // the assertion is ever reached — a green here would then mean nothing.
    let stored = JSON.stringify({ iv: 'x', ct: 'y', kekWrap: { v: 1 }, kekSalt });
    secureStoreMock.get.mockImplementation(async () => stored);
    secureStoreMock.set.mockImplementation(async (_k, v) => {
      stored = typeof v === 'string' ? v : JSON.stringify(v);
    });
    const getHF = vi.fn(async () => new Uint8Array(32).fill(1));

    await nativeKeyStore.unenrollKek('pw', { getHardwareFactor: getHF });

    expect(decodedSalts.length).toBeGreaterThan(0);
    for (const salt of decodedSalts) expect(isAllZero(salt)).toBe(true);
  });
});
