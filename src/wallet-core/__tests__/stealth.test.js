// wallet-core/__tests__/stealth.test.js
//
// Tests for the STEALTH / HIDDEN WALLETS deniability invariants (S3). These run
// against the REAL crypto (vault.js Argon2id+AES-GCM) and a fake IndexedDB, so
// they exercise the same code path WalletProvider.unlock uses. They assert the
// properties the deniability claim rests on:
//   - reveal opens only the matching hidden wallet, via the secret-derived slot;
//   - re-creating with the same secret returns the SAME wallet (no silent loss);
//   - the storage pool is a fixed set of uniformly-shaped slots, so a raw dump
//     cannot distinguish real hidden wallets from chaff (count is hidden);
//   - a miss returns null (never throws), so the unlock prompt gives no tell.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ensureStealthPool, createHiddenWallet, moveWalletToHidden, tryRevealHidden,
  hasStealthPool, wipeStealthPool,
} from '../stealth.js';
import { deriveEvmAccount } from '../derivation.js';
import { generateMnemonic } from '../mnemonic.js';

const POOL_SIZE = 12;

function dumpVaultStore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('veyrnox-vault', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('vault')) db.createObjectStore('vault');
    };
    req.onsuccess = () => {
      const db = req.result;
      const st = db.transaction('vault', 'readonly').objectStore('vault');
      const keysReq = st.getAllKeys();
      const valsReq = st.getAll();
      keysReq.onsuccess = () => {
        valsReq.onsuccess = () => {
          const out = {};
          keysReq.result.forEach((k, i) => { out[k] = valsReq.result[i]; });
          db.close();
          resolve(out);
        };
      };
      keysReq.onerror = () => reject(keysReq.error);
    };
    req.onerror = () => reject(req.error);
  });
}

describe('stealth / hidden wallets', () => {
  beforeEach(async () => {
    await wipeStealthPool();
  });

  it('seeds a fixed pool of uniformly-shaped slots (chaff baseline)', async () => {
    await ensureStealthPool();
    expect(await hasStealthPool()).toBe(true);

    const store = await dumpVaultStore();
    const slots = Object.keys(store).filter((k) => k.startsWith('vault:'));
    expect(slots.length).toBe(POOL_SIZE);

    // Every slot — chaff here — has the SAME { v, kdf, salt, iv, ct } shape, so a
    // raw storage dump cannot pick real wallets out by structure.
    const shapes = new Set(slots.map((k) => Object.keys(store[k]).sort().join(',')));
    expect(shapes.size).toBe(1);
    expect([...shapes][0]).toBe('ct,iv,kdf,salt,v');
  });

  it('reveals only the wallet whose secret is given, with the right address', async () => {
    const a = await createHiddenWallet('alpha-secret-1');
    const b = await createHiddenWallet('beta-secret-2');

    expect(a.address).not.toBe(b.address);

    const revealedA = await tryRevealHidden('alpha-secret-1');
    const revealedB = await tryRevealHidden('beta-secret-2');
    expect(revealedA).not.toBeNull();
    expect(revealedB).not.toBeNull();
    expect(deriveEvmAccount(revealedA, 0).address).toBe(a.address);
    expect(deriveEvmAccount(revealedB, 0).address).toBe(b.address);
  });

  it('returns null (no throw, no tell) for a wrong secret and for chaff', async () => {
    await ensureStealthPool();                 // all chaff
    expect(await tryRevealHidden('nope-not-a-secret')).toBeNull();

    await createHiddenWallet('real-secret-xyz');
    // A different wrong secret still just misses, silently.
    expect(await tryRevealHidden('some-other-wrong')).toBeNull();
  });

  it('is idempotent for the same secret — never silently replaces the wallet', async () => {
    const first = await createHiddenWallet('keep-me-please');
    const again = await createHiddenWallet('keep-me-please');
    expect(again.existing).toBe(true);
    expect(again.address).toBe(first.address);
    expect(again.slot).toBe(first.slot);

    // The wallet behind the secret is unchanged.
    const revealed = await tryRevealHidden('keep-me-please');
    expect(deriveEvmAccount(revealed, 0).address).toBe(first.address);
  });

  it('keeps the slot count constant whether or not hidden wallets exist', async () => {
    await ensureStealthPool();
    const before = Object.keys(await dumpVaultStore()).filter((k) => k.startsWith('vault:')).length;
    await createHiddenWallet('one-hidden-wallet');
    const after = Object.keys(await dumpVaultStore()).filter((k) => k.startsWith('vault:')).length;
    // Creating a hidden wallet overwrites a chaff slot in place — the pool size
    // (and thus the visible count of slots) does not change.
    expect(after).toBe(before);
    expect(after).toBe(POOL_SIZE);
  });

  it('rejects a too-short reveal secret', async () => {
    await expect(createHiddenWallet('ab')).rejects.toThrow(/at least 4/i);
  });

  // ---- moveWalletToHidden: hide an EXISTING (provided) wallet ----

  it('moves an existing wallet into the pool and reveals it by its secret', async () => {
    const mnemonic = generateMnemonic(128);
    const expectedAddr = deriveEvmAccount(mnemonic, 0).address;

    const { address } = await moveWalletToHidden(mnemonic, 'move-secret-aaaa');
    expect(address).toBe(expectedAddr);

    // It is now revealable by its secret and yields the SAME wallet (not a fresh one).
    const revealed = await tryRevealHidden('move-secret-aaaa');
    expect(revealed).toBe(mnemonic);
    expect(deriveEvmAccount(revealed, 0).address).toBe(expectedAddr);
  });

  it('moving an existing wallet does NOT change the slot pool shape (deniability unchanged)', async () => {
    await ensureStealthPool();
    const before = await dumpVaultStore();
    const beforeSlots = Object.keys(before).filter((k) => k.startsWith('vault:')).length;

    await moveWalletToHidden(generateMnemonic(128), 'move-secret-bbbb');

    const after = await dumpVaultStore();
    const slots = Object.keys(after).filter((k) => k.startsWith('vault:'));
    // Same fixed pool size, still one uniform blob shape — a moved wallet looks
    // exactly like a fresh hidden wallet and like chaff in storage.
    expect(slots.length).toBe(POOL_SIZE);
    expect(slots.length).toBe(beforeSlots);
    const shapes = new Set(slots.map((k) => Object.keys(after[k]).sort().join(',')));
    expect(shapes.size).toBe(1);
  });

  it('rejects an invalid recovery phrase (cannot hide a wallet you do not control)', async () => {
    await expect(moveWalletToHidden('not a real bip39 phrase at all', 'secret-xyz'))
      .rejects.toThrow(/recovery phrase/i);
  });

  it('refuses to clobber a DIFFERENT hidden wallet already under the same secret', async () => {
    const first = generateMnemonic(128);
    const second = generateMnemonic(128);
    await moveWalletToHidden(first, 'shared-secret-cccc');
    // A different wallet under the same secret must be refused, not silently
    // overwrite the first (which would destroy it).
    await expect(moveWalletToHidden(second, 'shared-secret-cccc'))
      .rejects.toThrow(/already in use/i);
    // The first wallet is intact.
    expect(await tryRevealHidden('shared-secret-cccc')).toBe(first);
  });

  it('re-moving the SAME wallet under the same secret is idempotent', async () => {
    const mnemonic = generateMnemonic(128);
    const a = await moveWalletToHidden(mnemonic, 'idem-secret-dddd');
    const b = await moveWalletToHidden(mnemonic, 'idem-secret-dddd');
    expect(b.address).toBe(a.address);
    expect(b.slot).toBe(a.slot);
  });
});
