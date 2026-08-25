// wallet-core/__tests__/deniability-kdf-parity.test.js
//
// H-2 (weekly audit 2026-08-25) — CHAFF ↔ REAL KDF-PARAM PARITY.
//
// The invariant this suite defends: every deniability blob on a device — all
// 256 stealth slots plus the duress ('secondary') and panic ('tertiary') slots
// — should report an IDENTICAL `kdf` object. That field is PLAINTEXT in a
// storage dump, so any divergence is a real-vs-chaff distinguisher that needs
// no secret: sort the slots by `kdf.memorySize` and the odd one out is the
// real hidden wallet.
//
// The KDF profile v2 change (2026-08-24: 192 MiB/t=3 → 96 MiB/t=6, migration
// flag OFF) broke this on every device provisioned before that date. A first
// remediation stamped THIS DEVICE's recorded era on every new write, so a v1
// pool stayed v1 across chaff and real alike. That preserved uniformity today
// but pinned the whole footprint at v1 forever with no path forward.
//
// GATE 2 — REVEAL-TIME OPPORTUNISTIC REKEY (owner ruling, 2026-08-25):
//   - Every writer stamps the CURRENT `KDF_PARAMS` (v2). No more per-device
//     era lookup on the write path.
//   - Reveal, duress-unlock, and panic-unlock silently rekey the slot they
//     just opened to the current profile, if it disagrees.
//   - HONEST COST: on a v1-era device, a hidden wallet the user never opens
//     again keeps its v1 slot while everything around it migrates. That
//     specific slot becomes a transient tell for the length of time it takes
//     the user to actively reveal it. The owner accepted this as the smallest
//     honest shape that does not clobber real data.
//
// These tests write REAL v1-era encrypted blobs into the shared store to stand
// in for a pre-2026-08-24 device, then exercise the genuine write and reveal
// paths and pin what the invariant now is — and what it explicitly ISN'T.
//
// Comparison is on JSON.stringify, not toEqual: field ORDER matters as much as
// field values, because a raw dump inspects bytes, not deep-equality.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ensureStealthPool,
  createHiddenWallet,
  tryRevealHidden,
  _awaitPendingKdfRekey as awaitStealthRekey,
} from '../stealth.js';
import {
  setDuressVault,
  tryDuressUnlock,
  _awaitPendingKdfRekey as awaitDuressRekey,
} from '../duress.js';
import {
  setPanicVault,
  tryPanicUnlock,
  _awaitPendingKdfRekey as awaitPanicRekey,
} from '../panic.js';
import { generateMnemonic } from '../mnemonic.js';
import {
  KDF_PARAMS,
  encryptVault,
  vaultNeedsKdfMigration,
} from '../vault.js';
import { FIXED_LEN, padToFixedLen, makeContainer, serializeContainer, newWalletId } from '../multiVault.js';

const POOL_SIZE = 256;
const SLOT_KEYS = Array.from({ length: POOL_SIZE }, (_, i) => `vault:${i + 1}`);

// The v1 at-rest profile (192 MiB / t=3, PR #604) exactly as it was recorded
// on disk before v2 — note the ABSENCE of `kdfProfileVersion`, which v2
// introduced. Real v1 blobs were written with this object.
const V1_KDF = Object.freeze({
  name: 'argon2id', parallelism: 1, iterations: 3, memorySize: 196608, hashLength: 32,
});
const V1_PARAMS = Object.freeze({
  parallelism: 1, iterations: 3, memorySize: 196608, hashLength: 32,
});

function openStore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('veyrnox-vault', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('vault')) db.createObjectStore('vault');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function b64(u8) {
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s);
}

function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

// A random-bytes "chaff" blob at an ARBITRARY recorded profile — indistinguishable
// from a real slot on a raw dump because AES-GCM ciphertext is computationally
// random. Never decryptable; safe to seed a pool with.
function chaffAt(kdf) {
  return {
    v: 1,
    kdf: { ...kdf },
    salt: b64(randomBytes(16)),
    iv: b64(randomBytes(12)),
    ct: b64(randomBytes(FIXED_LEN + 16)),
  };
}

async function put(key, value) {
  const db = await openStore();
  try {
    await new Promise((res, rej) => {
      const r = db.transaction('vault', 'readwrite').objectStore('vault').put(value, key);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  } finally {
    db.close();
  }
}

async function get(key) {
  const db = await openStore();
  try {
    return await new Promise((res, rej) => {
      const r = db.transaction('vault', 'readonly').objectStore('vault').get(key);
      r.onsuccess = () => res(r.result ?? null);
      r.onerror = () => rej(r.error);
    });
  } finally {
    db.close();
  }
}

async function clearStore() {
  const db = await openStore();
  try {
    await new Promise((res, rej) => {
      const r = db.transaction('vault', 'readwrite').objectStore('vault').clear();
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  } finally {
    db.close();
  }
}

async function dumpStore() {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const st = db.transaction('vault', 'readonly').objectStore('vault');
      const keysReq = st.getAllKeys();
      const valsReq = st.getAll();
      keysReq.onsuccess = () => {
        valsReq.onsuccess = () => {
          const out = {};
          keysReq.result.forEach((k, i) => { out[k] = valsReq.result[i]; });
          resolve(out);
        };
      };
      keysReq.onerror = () => reject(keysReq.error);
    });
  } finally {
    db.close();
  }
}

// Seed a pre-2026-08-24 device: 256 stealth slots + secondary + tertiary, all
// random-bytes chaff at the v1 profile. Chaff can be pure random because the
// tests never try to decrypt it — they exercise real writes/reveals AGAINST it.
async function seedV1ChaffOnly() {
  for (const key of [...SLOT_KEYS, 'secondary', 'tertiary']) {
    await put(key, chaffAt(V1_KDF));
  }
}

function kdfFingerprints(store, keys) {
  return new Set(keys.map((k) => JSON.stringify(store[k].kdf)));
}

const CURRENT_KDF_FINGERPRINT = JSON.stringify({ name: 'argon2id', ...KDF_PARAMS });

describe('H-2 gate 2 — writers stamp current KDF_PARAMS uniformly (Shape X)', () => {
  beforeEach(async () => {
    await clearStore();
    try { localStorage.clear(); } catch { /* jsdom */ }
  });

  it('a hidden wallet created on any device stamps the current v2 profile (not the device era)', async () => {
    await seedV1ChaffOnly();
    await createHiddenWallet('kdf-parity-secret-writer');

    const store = await dumpStore();
    // Find the slot that is no longer chaff — the one whose kdf matches current.
    const realSlots = SLOT_KEYS.filter((k) => JSON.stringify(store[k].kdf) === CURRENT_KDF_FINGERPRINT);
    expect(realSlots.length).toBe(1);
  }, 300_000);

  it('setDuressVault stamps the current v2 profile even on a v1-era device', async () => {
    await seedV1ChaffOnly();
    await setDuressVault(generateMnemonic(128), 'duress-password-1234');

    const decoy = await get('secondary');
    expect(JSON.stringify(decoy.kdf)).toBe(CURRENT_KDF_FINGERPRINT);
  }, 300_000);

  it('setPanicVault stamps the current v2 profile even on a v1-era device', async () => {
    await seedV1ChaffOnly();
    await setPanicVault('12345678');

    const marker = await get('tertiary');
    expect(JSON.stringify(marker.kdf)).toBe(CURRENT_KDF_FINGERPRINT);
  }, 300_000);

  it('a fresh device writes the current v2 profile everywhere it writes', async () => {
    await ensureStealthPool();
    await createHiddenWallet('kdf-parity-fresh-writer');

    const store = await dumpStore();
    const slots = Object.keys(store).filter((k) => k.startsWith('vault:'));
    const fingerprints = kdfFingerprints(store, slots);
    // Every slot the pool wrote goes at the current profile — the fresh-device
    // property is unchanged by Gate 2.
    expect([...fingerprints]).toEqual([CURRENT_KDF_FINGERPRINT]);
  }, 300_000);
});

describe('H-2 gate 2 — reveal-time opportunistic rekey', () => {
  beforeEach(async () => {
    await clearStore();
    try { localStorage.clear(); } catch { /* jsdom */ }
  });

  it('revealHidden rekeys a v1 hidden slot to the current profile after a successful decrypt', async () => {
    // Establish the per-device slot salt so slotForSecret is deterministic here
    // — createHiddenWallet on some placeholder secret provisions it and gives us
    // a known primary slot to inspect. That real wallet is unrelated to what we
    // test next; we clear it out and drop a v1-encrypted blob under a KNOWN slot.
    await createHiddenWallet('placeholder-secret-12345', 128);
    await clearStore();

    // Compute the slot for our test secret (relies on the salt just provisioned).
    const { slotForSecret } = await import('../stealth.js');
    const secret = 'v1-hidden-secret-abcd';
    const slot = await slotForSecret(secret);
    const mnemonic = generateMnemonic(128);
    const container = makeContainer([{ id: newWalletId(), mnemonic }]);
    const v1Blob = await encryptVault(serializeContainer(container), secret, V1_PARAMS);
    // Sanity: the seeded blob really is at v1.
    expect(vaultNeedsKdfMigration(v1Blob)).toBe(true);
    await put(slot, v1Blob);

    // Act: reveal it.
    const revealed = await tryRevealHidden(secret);
    expect(revealed).not.toBeNull();

    // Fire-and-forget rekey (H-1 timing budget) — wait for it to settle.
    await awaitStealthRekey();

    // After a successful reveal, the slot should have been silently rekeyed.
    const after = await get(slot);
    expect(vaultNeedsKdfMigration(after)).toBe(false);
    expect(JSON.stringify(after.kdf)).toBe(CURRENT_KDF_FINGERPRINT);
    // The blob still decrypts under the same secret (rekey preserves plaintext).
    const revealedAgain = await tryRevealHidden(secret);
    expect(revealedAgain).toBe(revealed);
  }, 300_000);

  it('tryDuressUnlock rekeys the decoy slot to the current profile after a successful decrypt', async () => {
    const decoyMnemonic = generateMnemonic(128);
    const password = 'duress-password-1234';
    const container = makeContainer([{ id: newWalletId(), mnemonic: decoyMnemonic }]);
    const v1Blob = await encryptVault(serializeContainer(container), password, V1_PARAMS);
    await put('secondary', v1Blob);

    const out = await tryDuressUnlock(password);
    expect(out).not.toBeNull();
    await awaitDuressRekey();

    const after = await get('secondary');
    expect(vaultNeedsKdfMigration(after)).toBe(false);
    expect(JSON.stringify(after.kdf)).toBe(CURRENT_KDF_FINGERPRINT);
  }, 300_000);

  it('tryPanicUnlock rekeys the panic marker to the current profile after a successful decrypt', async () => {
    const password = '12345678';
    const marker = generateMnemonic(128);
    const v1Blob = await encryptVault(padToFixedLen(marker), password, V1_PARAMS);
    await put('tertiary', v1Blob);

    const ok = await tryPanicUnlock(password);
    expect(ok).toBe(true);
    await awaitPanicRekey();

    const after = await get('tertiary');
    expect(vaultNeedsKdfMigration(after)).toBe(false);
    expect(JSON.stringify(after.kdf)).toBe(CURRENT_KDF_FINGERPRINT);
  }, 300_000);

  it('a WRONG secret does not touch the slot (rekey is gated on successful decrypt)', async () => {
    await createHiddenWallet('placeholder-secret-12345', 128);
    await clearStore();

    const { slotForSecret } = await import('../stealth.js');
    const secret = 'right-secret-abcd-9876';
    const slot = await slotForSecret(secret);
    const mnemonic = generateMnemonic(128);
    const container = makeContainer([{ id: newWalletId(), mnemonic }]);
    const v1Blob = await encryptVault(serializeContainer(container), secret, V1_PARAMS);
    await put(slot, v1Blob);
    const before = await get(slot);

    // Attempt reveal with a WRONG secret. slotForSecret(wrong) may not even hash
    // to this slot — that is fine, the point is that whatever slot it hits, it
    // decrypts to nothing and no rekey happens anywhere.
    const revealed = await tryRevealHidden('wrong-secret-abcd-1111');
    expect(revealed).toBeNull();
    // Even wait out any queued rekey: a wrong secret must never touch it.
    await awaitStealthRekey();

    const after = await get(slot);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  }, 300_000);
});

describe('H-2 gate 2 — the accepted transient tell (honest limit)', () => {
  beforeEach(async () => {
    await clearStore();
    try { localStorage.clear(); } catch { /* jsdom */ }
  });

  it('an UN-OPENED v1 slot retains its v1 profile after new v2 writes land — this IS a transient distinguisher', async () => {
    // Seed a v1-era device.
    await seedV1ChaffOnly();

    // Land a v2 write (a real hidden wallet under an unrelated secret) alongside
    // the untouched v1 chaff. This is the mixed state the owner ruling accepted.
    await createHiddenWallet('gate-2-writer-secret-9999');

    const store = await dumpStore();
    // The slot that was written stamps v2. The other 255 slots STILL stamp v1
    // — nothing rewrote them, and Gate 2 explicitly does not.
    const slotFingerprints = SLOT_KEYS.map((k) => JSON.stringify(store[k].kdf));
    const uniq = new Set(slotFingerprints);
    // TWO fingerprints coexist. If this test ever collapses to one, either
    // Gate 2 has silently started sweeping unread slots (breaking the ruling
    // in the safe direction but demanding a docs update), or the writer path
    // regressed to per-device era (breaking it in the unsafe direction). Both
    // matter — read the diff before "fixing" this test.
    expect(uniq.size).toBe(2);
    expect(uniq.has(CURRENT_KDF_FINGERPRINT)).toBe(true);
    expect(uniq.has(JSON.stringify({ ...V1_KDF }))).toBe(true);
  }, 300_000);
});
