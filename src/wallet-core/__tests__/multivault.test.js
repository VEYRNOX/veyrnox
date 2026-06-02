// wallet-core/__tests__/multivault.test.js
//
// ⚠️ THE highest-priority test file for feat/multi-wallet-portfolio. The
// multi-seed vault is the crypto-critical core, so these tests lead the suite
// and prove the three properties the change lives or dies by:
//
//   1. MIGRATION — an existing single-seed vault (a bare mnemonic) becomes
//      "wallet 1" LOSSLESSLY, including through the REAL Argon2id+AES-GCM round
//      trip, so an old vault still decrypts and its derived addresses are
//      unchanged.
//   2. ISOLATION — each seed derives ONLY its own addresses across EVM/BTC/SOL;
//      deriving or removing one wallet never exposes or alters another.
//   3. NO CROSS-CONTAMINATION — add/remove are pure: the inputs and the other
//      wallets are never mutated.
//
// The crypto primitives are NOT re-tested here (vault.js / derivation.js own
// that). We test that the container rides INSIDE the unchanged crypto without
// disturbing it.

import { describe, it, expect } from 'vitest';
import {
  MULTI_VAULT_TAG,
  newWalletId,
  isMultiContainer,
  parseVault,
  serializeContainer,
  migrateLegacyMnemonic,
  addWallet,
  removeWallet,
  findWallet,
  listWalletIds,
  walletCount,
  containsMnemonic,
  validateContainer,
} from '../multiVault.js';
import { encryptVault, decryptVault } from '../vault.js';
import { generateMnemonic } from '../mnemonic.js';
import { deriveEvmAccount } from '../derivation.js';
import { deriveBtcAccount } from '../btc/derivation.js';
import { deriveSolAccount } from '../sol/derivation.js';

// Fixed, valid BIP-39 vectors so tests are deterministic.
const SEED_A = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const SEED_B = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';
const SEED_C = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const PASSWORD = 'correct horse battery staple';

// Full multi-chain public identity for a seed — the thing isolation must protect.
function identity(mnemonic) {
  return {
    evm: deriveEvmAccount(mnemonic, 0).address,
    btc: deriveBtcAccount(mnemonic, { networkKey: 'testnet' }).address,
    sol: deriveSolAccount(mnemonic).address,
  };
}

describe('multiVault — wallet id', () => {
  it('generates unique 32-char hex ids', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newWalletId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('multiVault — migration (lossless single-seed -> multi-seed)', () => {
  it('migrateLegacyMnemonic wraps a bare mnemonic as wallet #1, byte-identical', () => {
    const { container, walletId } = migrateLegacyMnemonic(SEED_A);
    expect(isMultiContainer(container)).toBe(true);
    expect(walletCount(container)).toBe(1);
    expect(findWallet(container, walletId).mnemonic).toBe(SEED_A);
  });

  it('parseVault detects a legacy bare mnemonic and migrates it', () => {
    const { container, migrated, walletId } = parseVault(SEED_A);
    expect(migrated).toBe(true);
    expect(walletCount(container)).toBe(1);
    expect(findWallet(container, walletId).mnemonic).toBe(SEED_A);
  });

  it('parseVault recognises an already-multi container WITHOUT re-migrating', () => {
    const { container } = migrateLegacyMnemonic(SEED_A);
    const payload = serializeContainer(container);
    const { container: out, migrated } = parseVault(payload);
    expect(migrated).toBe(false);
    expect(listWalletIds(out)).toEqual(listWalletIds(container));
  });

  it('a legacy bare-mnemonic vault still decrypts AND migrates through the REAL crypto', async () => {
    // Encrypt EXACTLY as the pre-change app did: a bare mnemonic string.
    const legacyBlob = await encryptVault(SEED_A, PASSWORD);
    // Decrypt with the unchanged crypto.
    const plaintext = await decryptVault(legacyBlob, PASSWORD);
    expect(plaintext).toBe(SEED_A); // crypto path unchanged
    // Migrate.
    const { container, migrated, walletId } = parseVault(plaintext);
    expect(migrated).toBe(true);
    // The migrated wallet derives the SAME addresses the legacy wallet had —
    // funds/addresses are unchanged (the whole point of lossless migration).
    expect(identity(findWallet(container, walletId).mnemonic)).toEqual(identity(SEED_A));
  });

  it('round-trips a multi-seed container through the REAL Argon2id+AES-GCM crypto', async () => {
    let c = migrateLegacyMnemonic(SEED_A).container;
    c = addWallet(c, SEED_B).container;
    c = addWallet(c, SEED_C).container;
    // Encrypt the SERIALISED container as the secret — the crypto is untouched.
    const blob = await encryptVault(serializeContainer(c), PASSWORD);
    const decrypted = await decryptVault(blob, PASSWORD);
    const { container: out, migrated } = parseVault(decrypted);
    expect(migrated).toBe(false);
    expect(out.wallets.map((w) => w.mnemonic)).toEqual([SEED_A, SEED_B, SEED_C]);
    // A wrong password still fails generically (crypto unchanged).
    await expect(decryptVault(blob, 'wrong')).rejects.toThrow(/wrong password or corrupted/i);
  });
});

describe('multiVault — isolation (each seed derives only its own keys)', () => {
  it('two wallets in one container derive DIFFERENT addresses on every chain', () => {
    let c = migrateLegacyMnemonic(SEED_A).container;
    c = addWallet(c, SEED_B).container;
    const [a, b] = c.wallets;
    const idA = identity(a.mnemonic);
    const idB = identity(b.mnemonic);
    expect(idA.evm).not.toBe(idB.evm);
    expect(idA.btc).not.toBe(idB.btc);
    expect(idA.sol).not.toBe(idB.sol);
    // And each matches the standalone derivation of its OWN seed exactly.
    expect(idA).toEqual(identity(SEED_A));
    expect(idB).toEqual(identity(SEED_B));
  });

  it('deriving one wallet does not alter or read any other wallet entry', () => {
    let c = migrateLegacyMnemonic(SEED_A).container;
    c = addWallet(c, SEED_B).container;
    const bBefore = { ...c.wallets[1] };
    // Exercise every signing-key derivation for wallet A.
    deriveEvmAccount(c.wallets[0].mnemonic, 0);
    deriveBtcAccount(c.wallets[0].mnemonic, { networkKey: 'testnet' });
    deriveSolAccount(c.wallets[0].mnemonic);
    // Wallet B is untouched.
    expect(c.wallets[1]).toEqual(bBefore);
  });

  it('removing a wallet leaves the others byte-identical', () => {
    let c = migrateLegacyMnemonic(SEED_A).container;
    const addB = addWallet(c, SEED_B); c = addB.container;
    const addC = addWallet(c, SEED_C); c = addC.container;
    const idABefore = identity(SEED_A);
    const idCBefore = identity(SEED_C);
    const after = removeWallet(c, addB.walletId);
    expect(walletCount(after)).toBe(2);
    expect(findWallet(after, addB.walletId)).toBeNull(); // B gone
    // A and C unchanged — same mnemonics, same derived addresses.
    expect(findWallet(after, listWalletIds(c)[0]).mnemonic).toBe(SEED_A);
    expect(findWallet(after, addC.walletId).mnemonic).toBe(SEED_C);
    expect(identity(findWallet(after, listWalletIds(c)[0]).mnemonic)).toEqual(idABefore);
    expect(identity(findWallet(after, addC.walletId).mnemonic)).toEqual(idCBefore);
  });
});

describe('multiVault — purity / no cross-contamination', () => {
  it('addWallet does not mutate the input container', () => {
    const c0 = migrateLegacyMnemonic(SEED_A).container;
    const snapshot = JSON.parse(JSON.stringify(c0));
    const { container: c1 } = addWallet(c0, SEED_B);
    expect(c0).toEqual(snapshot);     // input untouched
    expect(c1).not.toBe(c0);          // new object
    expect(c1.wallets).not.toBe(c0.wallets);
    expect(walletCount(c0)).toBe(1);
    expect(walletCount(c1)).toBe(2);
  });

  it('removeWallet does not mutate the input container', () => {
    let c0 = migrateLegacyMnemonic(SEED_A).container;
    c0 = addWallet(c0, SEED_B).container;
    const snapshot = JSON.parse(JSON.stringify(c0));
    const ids = listWalletIds(c0);
    const c1 = removeWallet(c0, ids[0]);
    expect(c0).toEqual(snapshot);
    expect(walletCount(c0)).toBe(2);
    expect(walletCount(c1)).toBe(1);
  });

  it('mutating a returned wallet entry never reaches back into the input', () => {
    const c0 = migrateLegacyMnemonic(SEED_A).container;
    const { container: c1 } = addWallet(c0, SEED_B);
    c1.wallets[0].mnemonic = 'tampered';
    expect(c0.wallets[0].mnemonic).toBe(SEED_A); // defensive copy held
  });
});

describe('multiVault — guards', () => {
  it('rejects a duplicate seed', () => {
    const c = migrateLegacyMnemonic(SEED_A).container;
    expect(() => addWallet(c, SEED_A)).toThrow(/already in your wallet/i);
  });

  it('rejects an invalid mnemonic on add', () => {
    const c = migrateLegacyMnemonic(SEED_A).container;
    expect(() => addWallet(c, 'not a real seed phrase at all')).toThrow(/invalid recovery phrase/i);
  });

  it('refuses to remove the last wallet', () => {
    const c = migrateLegacyMnemonic(SEED_A).container;
    const id = listWalletIds(c)[0];
    expect(() => removeWallet(c, id)).toThrow(/last wallet/i);
  });

  it('removeWallet throws on an unknown id', () => {
    let c = migrateLegacyMnemonic(SEED_A).container;
    c = addWallet(c, SEED_B).container;
    expect(() => removeWallet(c, 'deadbeef')).toThrow(/not found/i);
  });

  it('parseVault throws on a corrupt payload', () => {
    expect(() => parseVault('{"vlt":"veyrnox-multi-vault","v":1,"wallets":[]}')).toThrow();
    expect(() => parseVault('garbage that is not a mnemonic or json')).toThrow(/unrecognized/i);
  });

  it('containsMnemonic is normalisation-insensitive', () => {
    const c = migrateLegacyMnemonic(SEED_A).container;
    expect(containsMnemonic(c, `  ${SEED_A.toUpperCase()}  `)).toBe(true);
    expect(containsMnemonic(c, SEED_B)).toBe(false);
  });

  it('validateContainer rejects duplicate ids', () => {
    const bad = { vlt: MULTI_VAULT_TAG, v: 1, wallets: [{ id: 'x', mnemonic: SEED_A }, { id: 'x', mnemonic: SEED_B }] };
    expect(() => validateContainer(bad)).toThrow(/duplicate/i);
  });
});
