// src/wallet-core/keystore/__tests__/web.kek-preserving-repersist.test.js
//
// KEK DOWNGRADE-ON-REPERSIST bug — WEB sibling of the Android "bug 3" (I4 fail-closed).
// Found 2026-07-06 while building the web WebAuthn PRF KEK e2e suite (PR #630).
//
// ROOT CAUSE: WalletProvider re-persists the primary container on unlock-time
// migrations and on seed add/import/rename via keyStore.saveVaultContents(),
// passing getHardwareFactor "to be KEK-preserving". The WEB implementation
// ignored opts and always wrote a BARE argon2id vault (encryptVault), dropping
// kekWrap/kekSalt. So immediately after any content mutation a PRF-enrolled web
// vault was silently downgraded to bare — unlockable by password ALONE, with no
// WebAuthn PRF assertion. That reopens the Phase-1 offline-seizure gap.
//
// FIX: mirror native.saveVaultContents — when the stored vault is KEK-wrapped,
// re-encrypt the new content under the EXISTING DEK (recovered via getHardwareFactor
// → PRF assertion + PIN-derived C), preserving kekWrap/kekSalt and kdf:'kek-dek'.
// When NOT KEK-enrolled it writes bare exactly like createVault. If a KEK-preserving
// write cannot complete on an enrolled vault it THROWS (never a silent bare downgrade).
//
// Web mocking pattern mirrors web.kek-zeroing.test.js (mocks vaultStore + vault + kek).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const vaultMock = {
  encryptVault: vi.fn(async () => ({ v: 1, kdf: 'argon2id', salt: 's', iv: 'bareiv', ct: 'barect' })),
  decryptVault: vi.fn(async () => 'seed'),
  vaultNeedsRekey: vi.fn(() => false),
  deriveKekC: vi.fn(async () => new Uint8Array(32).fill(7)),
  encryptVaultWithDek: vi.fn(async () => ({ iv: 'newiv', ct: 'newct' })),
  decryptVaultWithDek: vi.fn(async () => 'seed'),
};
const store = new Map();
const VAULT_KEY = 'primary';
const storeMock = {
  saveVault: vi.fn(async (blob) => { store.set(VAULT_KEY, blob); }),
  loadVault: vi.fn(async () => (store.has(VAULT_KEY) ? store.get(VAULT_KEY) : null)),
  hasVault: vi.fn(async () => store.has(VAULT_KEY)),
  clearVault: vi.fn(async () => { store.delete(VAULT_KEY); }),
};
const kekMock = {
  combineKek: vi.fn(async () => new Uint8Array(32).fill(9)),
  randomDek: vi.fn(() => new Uint8Array(32).fill(3)),
  wrapDek: vi.fn(async () => ({ v: 1, iv: 'wiv', ct: 'wct' })),
  unwrapDek: vi.fn(async () => new Uint8Array(32).fill(4)),
  KEK_ERR: { NO_HARDWARE_FACTOR: 'NO_HARDWARE_FACTOR', UNWRAP_FAILED: 'UNWRAP_FAILED' },
  MALFORMED_VAULT: 'KEK_MALFORMED_VAULT',
  decodeKekSalt: (kekSalt) => {
    if (typeof kekSalt !== 'string' || kekSalt.length === 0) throw new Error('KEK_MALFORMED_VAULT');
    let bin; try { bin = atob(kekSalt); } catch { throw new Error('KEK_MALFORMED_VAULT'); }
    const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out;
  },
};

vi.mock('../../vault.js', () => vaultMock);
vi.mock('../../evm/vaultStore.js', () => storeMock);
vi.mock('../kek.js', () => kekMock);

const { webKeyStore } = await import('../web.js');

const isAllZero = (u8) => u8.every((b) => b === 0);
const kekSalt = btoa('s'.repeat(32));
// ≥12 chars so the H-A web-vault minimum (validateWebVaultPassword) never trips
// and we exercise the KEK path, not the password-length guard.
const PW = 'correct-horse-battery-12';
const newHF = () => new Uint8Array(32).fill(1);
const setVault = (v) => { if (v == null) store.delete(VAULT_KEY); else store.set(VAULT_KEY, v); };

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  storeMock.saveVault.mockImplementation(async (blob) => { store.set(VAULT_KEY, blob); });
  storeMock.loadVault.mockImplementation(async () => (store.has(VAULT_KEY) ? store.get(VAULT_KEY) : null));
  vaultMock.encryptVault.mockResolvedValue({ v: 1, kdf: 'argon2id', salt: 's', iv: 'bareiv', ct: 'barect' });
  vaultMock.encryptVaultWithDek.mockResolvedValue({ iv: 'newiv', ct: 'newct' });
  vaultMock.deriveKekC.mockResolvedValue(new Uint8Array(32).fill(7));
  kekMock.combineKek.mockResolvedValue(new Uint8Array(32).fill(9));
  kekMock.unwrapDek.mockResolvedValue(new Uint8Array(32).fill(4));
});

describe('(a) KEK-enrolled web vault: content re-persist STAYS kek-dek with kekWrap intact', () => {
  it('re-encrypts new content under the existing DEK, preserving kekWrap/kekSalt', async () => {
    const kekWrap = { v: 1, iv: 'wrapiv', ct: 'wrapct' };
    setVault({ v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct', kekWrap, kekSalt });

    await webKeyStore.saveVaultContents('NEW_CONTAINER_JSON', PW, {
      getHardwareFactor: async () => newHF(),
    });

    const written = store.get(VAULT_KEY);
    // kek-dek format preserved — NOT downgraded to bare argon2id
    expect(written.kdf).toBe('kek-dek');
    expect(written.kekWrap).toEqual(kekWrap);
    expect(written.kekSalt).toBe(kekSalt);
    // new content ciphertext came from encryptVaultWithDek (under the existing DEK)
    expect(written.iv).toBe('newiv');
    expect(written.ct).toBe('newct');
    expect(vaultMock.encryptVaultWithDek).toHaveBeenCalledWith('NEW_CONTAINER_JSON', expect.any(Uint8Array));
    // NEVER the bare argon2id path on an enrolled vault
    expect(vaultMock.encryptVault).not.toHaveBeenCalled();
  });

  it('zeroes H, C, KEK and DEK on the success path', async () => {
    let H, C, kek, dek;
    vaultMock.deriveKekC.mockImplementation(async () => { C = new Uint8Array(32).fill(7); return C; });
    kekMock.combineKek.mockImplementation(async () => { kek = new Uint8Array(32).fill(9); return kek; });
    kekMock.unwrapDek.mockImplementation(async () => { dek = new Uint8Array(32).fill(4); return dek; });
    setVault({ v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct', kekWrap: { v: 1 }, kekSalt });

    await webKeyStore.saveVaultContents('NEW', PW, {
      getHardwareFactor: async () => { H = newHF(); return H; },
    });

    expect(isAllZero(H)).toBe(true);
    expect(isAllZero(C)).toBe(true);
    expect(isAllZero(kek)).toBe(true);
    expect(isAllZero(dek)).toBe(true);
  });

  it('invokes getHardwareFactor exactly once (one PRF assertion per content re-persist)', async () => {
    const getHF = vi.fn(async () => newHF());
    setVault({ v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct', kekWrap: { v: 1 }, kekSalt });

    await webKeyStore.saveVaultContents('NEW', PW, { getHardwareFactor: getHF });

    expect(getHF).toHaveBeenCalledTimes(1);
  });
});

describe('(b) bare / non-KEK web vault: writes bare exactly like createVault (no regression)', () => {
  it('writes an argon2id bare blob and never touches the KEK path', async () => {
    const getHF = vi.fn(async () => newHF());
    setVault({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' });

    await webKeyStore.saveVaultContents('NEW', PW, { getHardwareFactor: getHF });

    const written = store.get(VAULT_KEY);
    expect(written.kdf).toBe('argon2id');
    expect(written.kekWrap).toBeUndefined();
    expect(vaultMock.encryptVault).toHaveBeenCalledWith('NEW', PW);
    expect(vaultMock.encryptVaultWithDek).not.toHaveBeenCalled();
    // no hardware-factor prompt on a bare vault
    expect(getHF).not.toHaveBeenCalled();
  });

  it('writes bare when there is no prior vault at all (first write)', async () => {
    setVault(null);
    await webKeyStore.saveVaultContents('NEW', PW, {});
    const written = store.get(VAULT_KEY);
    expect(written.kdf).toBe('argon2id');
    expect(written.kekWrap).toBeUndefined();
  });

  it('still works when opts is omitted entirely on a bare vault', async () => {
    setVault({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' });
    await webKeyStore.saveVaultContents('NEW', PW);
    expect(store.get(VAULT_KEY).kdf).toBe('argon2id');
  });
});

describe('(c) fail-closed: a KEK-enrolled web vault THROWS rather than downgrading to bare', () => {
  it('throws NO_HARDWARE_FACTOR when getHardwareFactor is missing, and does NOT write bare', async () => {
    const original = { v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct', kekWrap: { v: 1 }, kekSalt };
    setVault(original);

    await expect(
      webKeyStore.saveVaultContents('NEW', PW, {}),
    ).rejects.toThrow(kekMock.KEK_ERR.NO_HARDWARE_FACTOR);

    // The vault must be UNTOUCHED — never silently rewritten bare (the bug).
    expect(store.get(VAULT_KEY)).toEqual(original);
    expect(storeMock.saveVault).not.toHaveBeenCalled();
    expect(vaultMock.encryptVault).not.toHaveBeenCalled();
  });

  it('throws (and never writes bare) when DEK recovery fails on the enrolled vault', async () => {
    kekMock.unwrapDek.mockRejectedValue(new Error(kekMock.KEK_ERR.UNWRAP_FAILED));
    const original = { v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct', kekWrap: { v: 1 }, kekSalt };
    setVault(original);

    await expect(
      webKeyStore.saveVaultContents('NEW', PW, { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow();

    expect(store.get(VAULT_KEY)).toEqual(original);
    expect(vaultMock.encryptVault).not.toHaveBeenCalled();
  });

  it('throws when getHardwareFactor itself fails (PRF unavailable) — no bare downgrade', async () => {
    const original = { v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct', kekWrap: { v: 1 }, kekSalt };
    setVault(original);

    await expect(
      webKeyStore.saveVaultContents('NEW', PW, {
        getHardwareFactor: async () => { throw new Error('PRF unavailable'); },
      }),
    ).rejects.toThrow('PRF unavailable');

    expect(store.get(VAULT_KEY)).toEqual(original);
    expect(vaultMock.encryptVault).not.toHaveBeenCalled();
  });

  it('fails closed with MALFORMED_VAULT when an enrolled vault has a missing/invalid kekSalt', async () => {
    const original = { v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct', kekWrap: { v: 1 } /* no kekSalt */ };
    setVault(original);

    await expect(
      webKeyStore.saveVaultContents('NEW', PW, { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow(kekMock.MALFORMED_VAULT);

    expect(store.get(VAULT_KEY)).toEqual(original);
    expect(vaultMock.encryptVault).not.toHaveBeenCalled();
  });
});
