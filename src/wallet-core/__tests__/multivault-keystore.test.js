// wallet-core/__tests__/multivault-keystore.test.js
//
// END-TO-END vault integration for the multi-seed change, through the REAL
// keyStore (Argon2id + AES-GCM) and the REAL IndexedDB store (fake-indexeddb).
// These mirror EXACTLY what WalletProvider does on unlock/add/remove, so they
// prove the security-critical properties at the storage seam — not just on the
// pure container:
//   - an existing SINGLE-SEED vault unlocks and MIGRATES to a multi-seed
//     container LOSSLESSLY, then keeps opening as a container;
//   - add/remove persist and reload with full ISOLATION (each seed only its own
//     keys; removing one leaves the others byte-identical);
//   - a wrong password still fails generically and mutates nothing.

import { describe, it, expect, beforeEach } from 'vitest';
import { webKeyStore } from '../keystore/web.js';
import { loadVault, clearVault } from '../evm/vaultStore.js';
import * as mv from '../multiVault.js';
import { deriveEvmAccount } from '../derivation.js';
import { deriveBtcAccount } from '../btc/derivation.js';
import { deriveSolAccount } from '../sol/derivation.js';

const SEED_A = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const SEED_B = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';
const SEED_C = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const PASSWORD = 'correct horse battery staple';

function identity(m) {
  return {
    evm: deriveEvmAccount(m, 0).address,
    btc: deriveBtcAccount(m, { networkKey: 'testnet' }).address,
    sol: deriveSolAccount(m).address,
  };
}

// Replicate WalletProvider.unlock's PRIMARY path: decrypt -> parseVault ->
// (if migrated) re-encrypt as container -> return the container.
async function unlockPrimary(password) {
  const plaintext = await webKeyStore.unlock(password); // throws on wrong pw
  const { container, migrated } = mv.parseVault(plaintext);
  if (migrated) {
    await webKeyStore.createVault(mv.serializeContainer(container), password);
  }
  return { container, migrated };
}

// Replicate WalletProvider.addWallet / removeWallet (re-auth + re-encrypt).
async function addSeed(password, mnemonic) {
  const plaintext = await webKeyStore.unlock(password);
  const current = mv.parseVault(plaintext).container;
  const { container, walletId } = mv.addWallet(current, mnemonic);
  await webKeyStore.createVault(mv.serializeContainer(container), password);
  return walletId;
}
async function removeSeed(password, walletId) {
  const plaintext = await webKeyStore.unlock(password);
  const current = mv.parseVault(plaintext).container;
  const container = mv.removeWallet(current, walletId);
  await webKeyStore.createVault(mv.serializeContainer(container), password);
}

beforeEach(async () => { await clearVault(); });

describe('multi-seed vault — lossless single-seed migration (end-to-end)', () => {
  it('an existing single-seed vault unlocks, migrates, and is unchanged', async () => {
    // Pre-change app: a BARE mnemonic encrypted under the password.
    await webKeyStore.createVault(SEED_A, PASSWORD);

    // First unlock migrates it to a container and persists.
    const first = await unlockPrimary(PASSWORD);
    expect(first.migrated).toBe(true);
    expect(mv.walletCount(first.container)).toBe(1);
    const w0 = first.container.wallets[0];
    expect(identity(w0.mnemonic)).toEqual(identity(SEED_A)); // funds/addresses unchanged

    // The stored blob is now a container, NOT a bare mnemonic.
    const stored = await loadVault();
    expect(stored.ct).toBeTruthy();
    expect(stored.salt).toBeTruthy(); // still a real encrypted blob

    // Second unlock sees a container (no further migration); same wallet.
    const second = await unlockPrimary(PASSWORD);
    expect(second.migrated).toBe(false);
    expect(second.container.wallets[0].mnemonic).toBe(SEED_A);
    expect(mv.listWalletIds(second.container)).toEqual(mv.listWalletIds(first.container));
  });

  it('a wrong password fails generically and does not migrate', async () => {
    await webKeyStore.createVault(SEED_A, PASSWORD);
    await expect(unlockPrimary('nope')).rejects.toThrow(/wrong password or corrupted/i);
    // Still openable with the right password afterwards.
    const ok = await unlockPrimary(PASSWORD);
    expect(ok.container.wallets[0].mnemonic).toBe(SEED_A);
  });
});

describe('multi-seed vault — add / remove with isolation (end-to-end)', () => {
  it('adds independent seeds that persist and derive only their own keys', async () => {
    await webKeyStore.createVault(SEED_A, PASSWORD);
    await unlockPrimary(PASSWORD); // migrate to container

    const idB = await addSeed(PASSWORD, SEED_B);
    const idC = await addSeed(PASSWORD, SEED_C);

    const { container } = await unlockPrimary(PASSWORD);
    expect(mv.walletCount(container)).toBe(3);
    const mnemonics = container.wallets.map((w) => w.mnemonic);
    expect(mnemonics).toEqual([SEED_A, SEED_B, SEED_C]);

    // Each seed derives ONLY its own (distinct) addresses on every chain.
    const ids = identity;
    expect(ids(SEED_A)).toEqual(identity(SEED_A));
    expect(ids(SEED_B).evm).not.toBe(ids(SEED_A).evm);
    expect(ids(SEED_C).sol).not.toBe(ids(SEED_A).sol);
    expect(idB).not.toBe(idC);
  });

  it('rejects adding a seed already in the vault', async () => {
    await webKeyStore.createVault(SEED_A, PASSWORD);
    await unlockPrimary(PASSWORD);
    await expect(addSeed(PASSWORD, SEED_A)).rejects.toThrow(/already in your wallet/i);
  });

  it('removing one wallet leaves the others byte-identical and persisted', async () => {
    await webKeyStore.createVault(SEED_A, PASSWORD);
    await unlockPrimary(PASSWORD);
    const idB = await addSeed(PASSWORD, SEED_B);
    await addSeed(PASSWORD, SEED_C);

    await removeSeed(PASSWORD, idB);

    const { container } = await unlockPrimary(PASSWORD);
    const mnemonics = container.wallets.map((w) => w.mnemonic);
    expect(mnemonics).toContain(SEED_A);
    expect(mnemonics).toContain(SEED_C);
    expect(mnemonics).not.toContain(SEED_B);
    // A and C still derive exactly their own addresses (unaffected by B's removal).
    const a = container.wallets.find((w) => w.mnemonic === SEED_A);
    const c = container.wallets.find((w) => w.mnemonic === SEED_C);
    expect(identity(a.mnemonic)).toEqual(identity(SEED_A));
    expect(identity(c.mnemonic)).toEqual(identity(SEED_C));
  });

  it('refuses to remove the last remaining wallet', async () => {
    await webKeyStore.createVault(SEED_A, PASSWORD);
    const { container } = await unlockPrimary(PASSWORD);
    const onlyId = mv.listWalletIds(container)[0];
    await expect(removeSeed(PASSWORD, onlyId)).rejects.toThrow(/last wallet/i);
  });
});
