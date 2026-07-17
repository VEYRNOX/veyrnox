// src/wallet-core/keystore/__tests__/web-kek-v-propagation.test.js
//
// I-1 (defect): web KEK write paths destructure only { iv, ct } from
// encryptVaultWithDek() — but that helper returns { v, kdf, iv, ct } and seals
// the GCM auth-tag over vaultAad({v, kdf}). Today the saved blob's `v` comes
// from the `...blob` spread of the pre-existing vault, which today happens to
// equal VAULT_VERSION so the mismatch is benign. If VAULT_VERSION ever bumps
// (v:2 → v:3), any KEK-enrolled vault would be written with a mismatched
// header `v` vs the AAD baked into the ciphertext auth-tag — decrypt would
// then throw GCM auth-tag failure and the vault becomes permanently
// unlockable.
//
// These tests stub encryptVaultWithDek() to return v:999 and assert the saved
// blob carries v:999 — proving the `v` from encryptVaultWithDek() is what gets
// persisted, not the pre-existing blob.v spread value.
//
// Reference fix pattern: native.js after PR #1079 destructures `v: newV` and
// includes it explicitly in the saveVault call.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const vaultMock = {
  encryptVault: vi.fn(async () => ({ v: 2, kdf: 'argon2id', salt: 's', iv: 'bareiv', ct: 'barect' })),
  decryptVault: vi.fn(async () => 'seed'),
  vaultNeedsRekey: vi.fn(() => false),
  deriveKekC: vi.fn(async () => new Uint8Array(32).fill(7)),
  // Stubbed to return a FUTURE version (v:999) so we can detect whether the
  // save site propagates the encrypt-time `v` or leaks the pre-existing blob.v.
  encryptVaultWithDek: vi.fn(async () => ({ v: 999, kdf: 'kek-dek', iv: 'newiv', ct: 'newct' })),
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

const kekSalt = btoa('s'.repeat(32));
const PW = 'correct-horse-battery-12';
const newHF = () => new Uint8Array(32).fill(1);
const setVault = (v) => { if (v == null) store.delete(VAULT_KEY); else store.set(VAULT_KEY, v); };

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  storeMock.saveVault.mockImplementation(async (blob) => { store.set(VAULT_KEY, blob); });
  storeMock.loadVault.mockImplementation(async () => (store.has(VAULT_KEY) ? store.get(VAULT_KEY) : null));
  vaultMock.encryptVault.mockResolvedValue({ v: 2, kdf: 'argon2id', salt: 's', iv: 'bareiv', ct: 'barect' });
  vaultMock.encryptVaultWithDek.mockResolvedValue({ v: 999, kdf: 'kek-dek', iv: 'newiv', ct: 'newct' });
  vaultMock.deriveKekC.mockResolvedValue(new Uint8Array(32).fill(7));
  kekMock.combineKek.mockResolvedValue(new Uint8Array(32).fill(9));
  kekMock.unwrapDek.mockResolvedValue(new Uint8Array(32).fill(4));
});

describe('I-1: enrollKek propagates `v` from encryptVaultWithDek()', () => {
  it('saves blob.v === encryptVaultWithDek()`s v, not the pre-existing bare blob.v', async () => {
    // Pre-existing BARE argon2id vault at v:2 (today's VAULT_VERSION).
    setVault({ v: 2, kdf: 'argon2id', salt: 's', iv: 'bareiv', ct: 'barect' });

    await webKeyStore.enrollKek(PW, { getHardwareFactor: async () => newHF() });

    const written = store.get(VAULT_KEY);
    // Must reflect what encryptVaultWithDek() actually sealed (999), not the
    // pre-existing blob's v (2). If this fails at v:2 today the header/AAD
    // mismatch is benign; when VAULT_VERSION bumps it becomes fatal.
    expect(written.v).toBe(999);
    expect(written.kdf).toBe('kek-dek');
    expect(written.iv).toBe('newiv');
    expect(written.ct).toBe('newct');
    // KEK envelope still recorded.
    expect(written.kekWrap).toBeDefined();
    expect(written.kekSalt).toBeDefined();
  });
});

describe('I-1: saveVaultContents propagates `v` from encryptVaultWithDek()', () => {
  it('saves blob.v === encryptVaultWithDek()`s v on an already-enrolled vault', async () => {
    // Pre-existing KEK-enrolled vault stamped at v:2.
    setVault({ v: 2, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct', kekWrap: { v: 1 }, kekSalt });

    await webKeyStore.saveVaultContents('NEW_CONTAINER_JSON', PW, {
      getHardwareFactor: async () => newHF(),
    });

    const written = store.get(VAULT_KEY);
    // Must reflect encryptVaultWithDek()'s v (999), not the pre-existing v (2).
    expect(written.v).toBe(999);
    expect(written.kdf).toBe('kek-dek');
    expect(written.iv).toBe('newiv');
    expect(written.ct).toBe('newct');
  });
});

describe('I-1: changePassword KEK branch preserves original blob.v (seed CT not re-sealed)', () => {
  it('does NOT re-encrypt the seed CT — v/kdf on the saved blob equal the original', async () => {
    // The KEK branch of changePassword re-wraps the DEK only (spec §3): the
    // seed CT stays byte-identical, so its AAD stays bound to the ORIGINAL
    // {v, kdf}. That means preserving the original blob's v via the spread is
    // the CORRECT behaviour here — bumping v without re-sealing the CT would
    // break the AAD binding (GCM auth-tag mismatch on next unlock).
    //
    // This test pins that intent: the saved blob must retain the original
    // {v, kdf} and must NOT have called encryptVaultWithDek.
    // Distinguish pre-existing kekWrap ('old-wrap') from the rotated one
    // produced by wrapDek() ('rotated-wrap') so the "did rotate" assertion is meaningful.
    const originalKekWrap = { v: 1, iv: 'old-wiv', ct: 'old-wct' };
    kekMock.wrapDek.mockResolvedValue({ v: 1, iv: 'rotated-wiv', ct: 'rotated-wct' });
    setVault({ v: 2, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct', kekWrap: originalKekWrap, kekSalt });

    await webKeyStore.changePassword(PW, 'new-strong-password-123', {
      getHardwareFactor: async () => newHF(),
    });

    const written = store.get(VAULT_KEY);
    // v and kdf unchanged — AAD over the un-re-sealed seed CT still matches.
    expect(written.v).toBe(2);
    expect(written.kdf).toBe('kek-dek');
    // Seed CT/iv untouched (only the DEK wrap rotated).
    expect(written.iv).toBe('oldiv');
    expect(written.ct).toBe('oldct');
    // kekWrap/kekSalt DID change (that's the whole point of changePassword).
    expect(written.kekWrap).not.toEqual(originalKekWrap);
    expect(written.kekSalt).not.toBe(kekSalt);
    // Never called encryptVaultWithDek in this branch.
    expect(vaultMock.encryptVaultWithDek).not.toHaveBeenCalled();
  });
});
