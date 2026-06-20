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
  hasStealthPool, wipeStealthPool, slotForSecret,
} from '../stealth.js';
import { deriveEvmAccount } from '../derivation.js';
import { generateMnemonic } from '../mnemonic.js';
import { deriveBtcAddress } from '../btc/derivation.js';
import { deriveSolAddress } from '../sol/derivation.js';
import { parseVault, FIXED_LEN } from '../multiVault.js';

// H2: tryRevealHidden now returns the decrypted PAYLOAD string — a FIXED-LENGTH
// multi-seed container JSON (or a legacy bare mnemonic). These tests reason about
// the underlying SEED, so unwrap the payload to the bare mnemonic via the shared
// parser (which handles both formats). null payload (a miss) stays null.
function revealedMnemonic(payload) {
  if (payload == null) return null;
  return parseVault(payload).container.wallets[0].mnemonic;
}

// M1: pool raised 12 -> 256 to cut slot-collision (silent fund-loss) probability.
const POOL_SIZE = 256;

// Replicate stealth.js's slot math at an ARBITRARY modulus, so a test can find
// secrets that collide at the OLD pool size (12) and show they no longer collide
// at the new one. Mirrors slotForSecret: SHA-256(secret), first 4 bytes as a u32.
async function slotIndexAtModulus(secret, modulus) {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)),
  );
  const n = ((digest[0] << 24) | (digest[1] << 16) | (digest[2] << 8) | digest[3]) >>> 0;
  return n % modulus;
}

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

  it('H2: a real hidden slot and a chaff slot have BYTE-IDENTICAL ct length (deniability)', async () => {
    function unb64(str) {
      const s = atob(str); const u8 = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
      return u8;
    }
    await ensureStealthPool();          // all chaff
    const created = await createHiddenWallet('length-parity-secret');
    const store = await dumpVaultStore();
    const realSlot = created.slot;
    // Pick any slot that is NOT the real one — it is chaff.
    const chaffKey = Object.keys(store).find((k) => k.startsWith('vault:') && k !== realSlot);
    const realCtLen = unb64(store[realSlot].ct).length;
    const chaffCtLen = unb64(store[chaffKey].ct).length;
    // Both encrypt a FIXED_LEN container plaintext, so both ct lengths are
    // FIXED_LEN + 16-byte GCM tag — a raw dump cannot pick the real wallet by length.
    expect(realCtLen).toBe(chaffCtLen);
    expect(realCtLen).toBe(FIXED_LEN + 16);
  });

  it('reveals only the wallet whose secret is given, with the right address', async () => {
    const a = await createHiddenWallet('alpha-secret-1');
    const b = await createHiddenWallet('beta-secret-2');

    expect(a.address).not.toBe(b.address);

    const revealedA = revealedMnemonic(await tryRevealHidden('alpha-secret-1'));
    const revealedB = revealedMnemonic(await tryRevealHidden('beta-secret-2'));
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
    const revealed = revealedMnemonic(await tryRevealHidden('keep-me-please'));
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

  it('returns the full multi-chain identity (EVM+BTC+SOL) from the existing derivation', async () => {
    const created = await createHiddenWallet('multichain-secret-1');
    // Reveal the mnemonic and re-derive via the canonical public helpers — the
    // hidden wallet's addresses must match them EXACTLY (no reimplemented paths).
    const m = revealedMnemonic(await tryRevealHidden('multichain-secret-1'));
    expect(created.evm.address).toBe(deriveEvmAccount(m, 0).address);
    expect(created.btc.address).toBe(deriveBtcAddress(m, { networkKey: 'testnet' }).address);
    expect(created.sol.address).toBe(deriveSolAddress(m).address);
    // `address` stays an alias of the EVM address for back-compat.
    expect(created.address).toBe(created.evm.address);
    // Plausible per-chain formats (testnet BTC is bech32 tb1…; EVM is 0x…).
    expect(created.evm.address.startsWith('0x')).toBe(true);
    expect(created.btc.address.startsWith('tb1')).toBe(true);
    expect(created.btc.networkKey).toBe('testnet');
    expect(created.sol.networkKey).toBe('devnet');
  });

  it('multi-chain identity does NOT change the slot pool (deniability unchanged)', async () => {
    await ensureStealthPool();
    await createHiddenWallet('still-one-slot');
    const store = await dumpVaultStore();
    const slots = Object.keys(store).filter((k) => k.startsWith('vault:'));
    // Still exactly one fixed pool of uniformly-shaped slots — deriving BTC/SOL
    // addresses is pure local computation and writes nothing extra.
    expect(slots.length).toBe(POOL_SIZE);
    const shapes = new Set(slots.map((k) => Object.keys(store[k]).sort().join(',')));
    expect(shapes.size).toBe(1);
  });

  // ---- M1: slot-collision hardening (silent fund-loss bug) ----

  it('places every secret in an in-range vault:N slot (slotForSecret)', async () => {
    for (const s of ['aaaa', 'some-secret', 'another-one-2', 'zzzz-9999']) {
      const slot = await slotForSecret(s);
      expect(slot).toMatch(/^vault:\d+$/);
      const idx = Number(slot.slice('vault:'.length));
      expect(idx).toBeGreaterThanOrEqual(1);
      expect(idx).toBeLessThanOrEqual(POOL_SIZE);
    }
  });

  it('the larger pool resolves a pair that COLLIDED at the old size (12) into distinct slots, so both wallets survive', async () => {
    // Find two DISTINCT secrets that map to the SAME slot under the OLD pool
    // (POOL_SIZE = 12) — the exact input shape that used to silently overwrite a
    // hidden wallet — but to DIFFERENT slots under the new pool (256).
    let a = null;
    let b = null;
    const byOldSlot = new Map();
    for (let i = 0; i < 5000 && !a; i++) {
      const secret = `collide-probe-${i}`;
      const oldSlot = await slotIndexAtModulus(secret, 12);
      const newSlot = slotForSecret(secret); // use the real HKDF+salt mapping
      const prior = byOldSlot.get(oldSlot);
      if (prior && prior.newSlot !== newSlot) { a = prior.secret; b = secret; break; }
      if (!prior) byOldSlot.set(oldSlot, { secret, newSlot });
    }
    expect(a).not.toBeNull(); // such a pair must exist quickly
    expect(b).not.toBeNull();
    // They WOULD have shared a slot at POOL_SIZE = 12 (the bug), but not at 256.
    expect(await slotIndexAtModulus(a, 12)).toBe(await slotIndexAtModulus(b, 12));
    expect(await slotForSecret(a)).not.toBe(await slotForSecret(b));

    // Both hidden wallets now coexist — neither is silently destroyed.
    const wa = await createHiddenWallet(a);
    const wb = await createHiddenWallet(b);
    expect(wa.address).not.toBe(wb.address);
    expect(revealedMnemonic(await tryRevealHidden(a))).toBe(wa.mnemonic);
    expect(revealedMnemonic(await tryRevealHidden(b))).toBe(wb.mnemonic);
  });

  it('self-verifies a freshly created hidden wallet is immediately revealable', async () => {
    // The post-write self-verify guarantees a create that returns has actually
    // landed in storage (a write that did not take throws instead of silently
    // "succeeding" with nothing stored).
    const created = await createHiddenWallet('verify-after-write-1');
    expect(created.existing).toBe(false);
    expect(revealedMnemonic(await tryRevealHidden('verify-after-write-1'))).toBe(created.mnemonic);
  });

  // ---- moveWalletToHidden: hide an EXISTING (provided) wallet ----

  it('moves an existing wallet into the pool and reveals it by its secret', async () => {
    const mnemonic = generateMnemonic(128);
    const expectedAddr = deriveEvmAccount(mnemonic, 0).address;

    const { address } = await moveWalletToHidden(mnemonic, 'move-secret-aaaa');
    expect(address).toBe(expectedAddr);

    // It is now revealable by its secret and yields the SAME wallet (not a fresh one).
    const revealed = revealedMnemonic(await tryRevealHidden('move-secret-aaaa'));
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
    expect(revealedMnemonic(await tryRevealHidden('shared-secret-cccc'))).toBe(first);
  });

  it('re-moving the SAME wallet under the same secret is idempotent', async () => {
    const mnemonic = generateMnemonic(128);
    const a = await moveWalletToHidden(mnemonic, 'idem-secret-dddd');
    const b = await moveWalletToHidden(mnemonic, 'idem-secret-dddd');
    expect(b.address).toBe(a.address);
    expect(b.slot).toBe(a.slot);
  });
});
