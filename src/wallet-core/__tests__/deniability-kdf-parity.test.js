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
// GATE 2 was that path forward, and it did not work (owner ruling 2026-08-25,
// REVERTED for the write path 2026-08-26 after the daily security diff #2111).
// It pointed every writer at the current `KDF_PARAMS` and had reveal/duress
// opportunistically rekey the slot just opened. Its stated cost was "a transient
// tell during the rekey window", attached to the slot the user never opens.
//
// BOTH HALVES OF THAT WERE INVERTED, which is why this suite now reads the way
// it does:
//   - NOT TRANSIENT. Chaff cannot be rekeyed — nothing can decrypt it — and
//     ensureStealthPool only fills MISSING slots, never rewrites one. So a v1
//     pool stays v1 permanently. There is no window.
//   - THE TELL IS ON THE REAL SLOT, NOT THE UNOPENED ONE. Since everything
//     around it stays v1, the slot that gets written or revealed becomes the
//     only v2 blob among 257. The minority `kdf` object IS the hidden wallet.
//     For 'secondary' it is worse still: that key's meaning is unambiguous, so a
//     v2 'secondary' announces "this user configured a duress PIN".
//
// WHY THE POOL SIMPLY CANNOT MIGRATE (the constraint that decides everything
// here — do not re-derive it, and do not "fix" these tests by sweeping):
//   - You cannot sweep chaff forward to match: chaff is indistinguishable from a
//     real slot by construction, so a sweep cannot select its targets and would
//     overwrite other hidden wallets whose mnemonics exist nowhere else.
//   - You cannot edit the `kdf` field in place: paramsFromVault derives the key
//     from it, and v:2 AAD-binds it into the GCM tag.
//   - You cannot re-encrypt an UNREVEALED hidden wallet at all — that needs its
//     secret. So a pool holding one can never be uniform at a new era.
// Holding the era is the only option that neither destroys wallets nor moves the
// tell onto the wallets hidden hardest.
//
// THE INVARIANT THIS SUITE NOW DEFENDS:
//   - Every writer stamps THIS DEVICE'S recorded era via encryptDeniabilityVault
//     / makeChaff(era) — stealth create/move/AP-record, setDuressVault,
//     setPanicVault. A fresh device's era IS KDF_PARAMS, so new installs are
//     all-v2 and self-consistent.
//   - Reveal and duress-unlock still carry an opportunistic re-encrypt, but it
//     is now a REPAIR toward the footprint's era rather than a migration toward
//     the current default. Its job is healing a device that already ran #2103
//     and wrote a v2 blob into a v1 footprint. On a device that never did, it
//     never fires.
//   - Panic-unlock does NOT rekey. That exclusion is unrelated to any of the
//     above and stands on its own (reviewer C-1 on #2103) — see its test.
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
import { deniabilityKdfProfile } from '../deniabilityKdfProfile.js';

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

// Delete SPECIFIC slots, leaving the rest of the footprint intact — used to
// stage the backfill case (a pool that grew, or lost a slot) on a device whose
// remaining blobs still record the old era.
async function clearSlots(keys) {
  const db = await openStore();
  try {
    for (const key of keys) {
      await new Promise((res, rej) => {
        const r = db.transaction('vault', 'readwrite').objectStore('vault').delete(key);
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
      });
    }
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

const V1_KDF_FINGERPRINT = JSON.stringify({ ...V1_KDF });

describe('H-2 — writers stamp THIS DEVICE\'S era, so the footprint stays uniform', () => {
  beforeEach(async () => {
    await clearStore();
    try { localStorage.clear(); } catch { /* jsdom */ }
  });

  // Each of the three writers gets its own case rather than one combined
  // assertion, so a regression names the writer that broke. #2103 broke all
  // three at once and a single test would have said only "something drifted".
  it('createHiddenWallet stamps the device era, NOT the current default', async () => {
    await seedV1ChaffOnly();
    await createHiddenWallet('kdf-parity-secret-writer');

    // The whole point: after a real write, the pool is STILL uniform. There is
    // no slot whose kdf differs, so there is nothing to sort the dump by.
    const store = await dumpStore();
    expect([...kdfFingerprints(store, SLOT_KEYS)]).toEqual([V1_KDF_FINGERPRINT]);
    // Stated the other way round, because this is the exact failure #2103 had:
    // no slot may match the current default on a v1-era device.
    const odd = SLOT_KEYS.filter((k) => JSON.stringify(store[k].kdf) === CURRENT_KDF_FINGERPRINT);
    expect(odd).toEqual([]);
  }, 300_000);

  it('setDuressVault stamps the device era on a v1-era device', async () => {
    // The sharpest case in the suite. 'secondary' is the duress key by name, so
    // an odd `kdf` here does not merely hint that some slot is real — it says
    // the user deliberately configured a duress PIN, which is precisely what
    // duress exists to deny.
    await seedV1ChaffOnly();
    await setDuressVault(generateMnemonic(128), 'duress-password-1234');

    const decoy = await get('secondary');
    expect(JSON.stringify(decoy.kdf)).toBe(V1_KDF_FINGERPRINT);
    expect(JSON.stringify(decoy.kdf)).not.toBe(CURRENT_KDF_FINGERPRINT);
  }, 300_000);

  it('setPanicVault stamps the device era on a v1-era device', async () => {
    await seedV1ChaffOnly();
    await setPanicVault('12345678');

    const marker = await get('tertiary');
    expect(JSON.stringify(marker.kdf)).toBe(V1_KDF_FINGERPRINT);
    expect(JSON.stringify(marker.kdf)).not.toBe(CURRENT_KDF_FINGERPRINT);
  }, 300_000);

  it('backfilled chaff matches the pool it lands in, not the current default', async () => {
    // ensureStealthPool only refills MISSING slots, so this is what happens when
    // the pool grows or a slot is lost on an established device. Under #2103 the
    // fresh chaff stamped current params and became the odd one out — chaff
    // failing at the one job chaff has.
    await seedV1ChaffOnly();
    await clearSlots(SLOT_KEYS.slice(0, 3));
    await ensureStealthPool();

    const store = await dumpStore();
    expect([...kdfFingerprints(store, SLOT_KEYS)]).toEqual([V1_KDF_FINGERPRINT]);
  }, 300_000);

  it('a FRESH device writes the current v2 profile everywhere — era resolves to KDF_PARAMS', async () => {
    // The other half of the invariant, and the reason holding the era is not a
    // permanent v1 sentence for the product: a device with nothing to read back
    // gets KDF_PARAMS, so new installs are all-v2 and self-consistent. Only
    // devices provisioned before 2026-08-24 stay at v1.
    await ensureStealthPool();
    await createHiddenWallet('kdf-parity-fresh-writer');

    const store = await dumpStore();
    const slots = Object.keys(store).filter((k) => k.startsWith('vault:'));
    expect([...kdfFingerprints(store, slots)]).toEqual([CURRENT_KDF_FINGERPRINT]);
  }, 300_000);
});

describe('H-2 — the era probe reads the POOL, not a rewritable slot', () => {
  // Direct coverage for deniabilityKdfProfile(). The repair and writer tests
  // exercise it only as a proxy, and both of their scenarios survive a probe
  // that is wrong in isolation — so without these the probe's two protections
  // (pool-first ordering, majority vote) would be untested machinery. That is
  // the same shape of gap the fastpath tests had.
  beforeEach(async () => {
    await clearStore();
    try { localStorage.clear(); } catch { /* jsdom */ }
  });

  it('a #2103-rewritten v2 "secondary" does not poison the device era', async () => {
    // The failure this ordering exists to prevent. setDuressVault/setPanicVault
    // DO rewrite secondary/tertiary — the old probe order assumed they never
    // did — so on a device that ran #2103 with a duress PIN set, reading
    // 'secondary' first reports v2 with total confidence. Every later write
    // then lands at v2 while the 256 stealth slots stay v1, and the repair path
    // concludes there is nothing to fix.
    await seedV1ChaffOnly();
    await put('secondary', chaffAt({ name: 'argon2id', ...KDF_PARAMS }));
    await put('tertiary', chaffAt({ name: 'argon2id', ...KDF_PARAMS }));

    const era = await deniabilityKdfProfile();
    expect(JSON.stringify({ name: 'argon2id', ...era })).toBe(V1_KDF_FINGERPRINT);
  }, 300_000);

  it('one drifted slot inside the sample loses the vote to the pool', async () => {
    // A sampled slot may hold a REAL hidden wallet rather than chaff, and if it
    // was written by the #2103 build it records v2. First-match-wins would let
    // that single slot decide the era for the whole footprint; the majority
    // vote needs 3 of the 5 sampled slots to be drifted before it flips.
    await seedV1ChaffOnly();
    await put('vault:1', chaffAt({ name: 'argon2id', ...KDF_PARAMS }));

    const era = await deniabilityKdfProfile();
    expect(JSON.stringify({ name: 'argon2id', ...era })).toBe(V1_KDF_FINGERPRINT);
  }, 300_000);

  it('a fresh device with no footprint answers KDF_PARAMS', async () => {
    // The fallback that keeps new installs on v2 — without it, holding the era
    // really would be a permanent v1 sentence rather than a per-device one.
    const era = await deniabilityKdfProfile();
    expect(JSON.stringify({ name: 'argon2id', ...era })).toBe(CURRENT_KDF_FINGERPRINT);
  }, 300_000);
});

describe('H-2 — reveal-time REPAIR toward the footprint era', () => {
  beforeEach(async () => {
    await clearStore();
    try { localStorage.clear(); } catch { /* jsdom */ }
  });

  it('revealHidden REPAIRS a #2103-drifted v2 slot back to the pool era', async () => {
    // The repair path's actual job. Stage a device that ran #2103: a v1 pool,
    // with ONE slot at the current default because a build in that window wrote
    // or revealed it. That slot is the tell — the only v2 blob among 257 — and
    // revealing it should pull it back into line with its neighbours.
    //
    // Note the direction. Under #2103 this test asserted the opposite: that a
    // v1 slot is rekeyed UP to the current profile, which is what created the
    // tell in the first place. Do not "restore" it.
    await createHiddenWallet('placeholder-secret-12345', 128); // provisions the slot salt
    await clearStore();
    await seedV1ChaffOnly();

    const { slotForSecret } = await import('../stealth.js');
    const secret = 'drifted-hidden-secret-abcd';
    const slot = await slotForSecret(secret);
    const mnemonic = generateMnemonic(128);
    const container = makeContainer([{ id: newWalletId(), mnemonic }]);
    // The drifted blob: encrypted at the CURRENT default, sitting in a v1 pool.
    const v2Blob = await encryptVault(serializeContainer(container), secret);
    expect(JSON.stringify(v2Blob.kdf)).toBe(CURRENT_KDF_FINGERPRINT);
    await put(slot, v2Blob);

    const revealed = await tryRevealHidden(secret);
    expect(revealed).not.toBeNull();
    await awaitStealthRekey();

    // Repaired to match the pool, not moved further away from it.
    const after = await get(slot);
    expect(JSON.stringify(after.kdf)).toBe(V1_KDF_FINGERPRINT);

    // The footprint is uniform again — which is the whole point, and is the
    // assertion that would have caught #2103 on day one.
    const store = await dumpStore();
    expect([...kdfFingerprints(store, SLOT_KEYS)]).toEqual([V1_KDF_FINGERPRINT]);

    // Repair preserves the plaintext — the wallet still opens under its secret.
    expect(await tryRevealHidden(secret)).toBe(revealed);
  }, 300_000);

  it('revealHidden leaves an already-uniform slot ALONE (no needless rewrite)', async () => {
    // On a device that never ran #2103 the predicate is false and nothing fires.
    // Worth pinning: a rewrite-on-every-reveal would be a write-time observable
    // (see the module header's WRITE-TIME OBSERVATION limitation) for no gain.
    await createHiddenWallet('placeholder-secret-12345', 128);
    await clearStore();
    await seedV1ChaffOnly();

    const { slotForSecret } = await import('../stealth.js');
    const secret = 'uniform-hidden-secret-abcd';
    const slot = await slotForSecret(secret);
    const container = makeContainer([{ id: newWalletId(), mnemonic: generateMnemonic(128) }]);
    const v1Blob = await encryptVault(serializeContainer(container), secret, V1_PARAMS);
    await put(slot, v1Blob);

    const before = JSON.stringify(await get(slot));
    expect(await tryRevealHidden(secret)).not.toBeNull();
    await awaitStealthRekey();

    // Byte-identical, not merely same-profile: no re-encrypt happened at all.
    expect(JSON.stringify(await get(slot))).toBe(before);
  }, 300_000);

  it('the stealth rekey SETTLES when the slot vanishes inside the window (wipe race)', async () => {
    // Two things at once, and the second is the one that regressed:
    //   1. a panic-wipe landing inside the 250 ms deferred window must not have
    //      its slot re-created by the rekey — reviewer C-1's sibling fix;
    //   2. the fire-and-forget promise must still RESOLVE on that path.
    //
    // (2) was broken: the guard read `if (existing == null) return;`, and that
    // `return` exits the setTimeout callback past the resolve() at the end of
    // the block, so _lastKdfRekey never settled. duress.js's mirror of the same
    // guard resolves explicitly before returning; stealth.js's did not. Nothing
    // in production awaits the hook, so the blast radius was tests — but a test
    // that hangs to timeout instead of failing is the worst shape to leave.
    await createHiddenWallet('placeholder-secret-12345', 128);
    await clearStore();

    const { slotForSecret } = await import('../stealth.js');
    const secret = 'wipe-race-secret-abcd';
    const slot = await slotForSecret(secret);
    const mnemonic = generateMnemonic(128);
    const container = makeContainer([{ id: newWalletId(), mnemonic }]);
    const v1Blob = await encryptVault(serializeContainer(container), secret, V1_PARAMS);
    expect(vaultNeedsKdfMigration(v1Blob)).toBe(true);
    await put(slot, v1Blob);

    expect(await tryRevealHidden(secret)).not.toBeNull();

    // Panic wipe lands before the deferred rekey wakes. Reliable rather than
    // flaky: the callback's own encryptVault() is a full Argon2id derivation at
    // 96 MiB, so this clear is long done by the time it reaches the slot check.
    await clearStore();

    // Race the hook against a deadline. Asserting on the WINNER rather than
    // just awaiting means a never-settling promise fails LOUDLY here instead of
    // hanging until vitest's own timeout, where it reads as an infra problem.
    const outcome = await Promise.race([
      awaitStealthRekey().then(() => 'settled'),
      new Promise((res) => setTimeout(() => res('hung'), 15_000)),
    ]);
    expect(outcome).toBe('settled');

    // C-1's original point still holds: the wiped slot stays wiped.
    expect(await get(slot)).toBeNull();
  }, 300_000);

  it('tryDuressUnlock REPAIRS a #2103-drifted v2 decoy back to the pool era', async () => {
    // Same repair, on the slot where the tell is most damaging: 'secondary' is
    // the duress key by name, so a v2 blob there among 257 v1 ones does not just
    // suggest something is real — it says a duress PIN was configured.
    //
    // This case is also why the era probe reads the stealth pool BEFORE
    // 'secondary' (deniabilityKdfProfile.js PROBE_KEYS). With the old order the
    // drifted decoy would be the first thing read, report v2 as the device era,
    // and the repair would conclude there was nothing to fix.
    await seedV1ChaffOnly();
    const password = 'duress-password-1234';
    const container = makeContainer([{ id: newWalletId(), mnemonic: generateMnemonic(128) }]);
    const v2Blob = await encryptVault(serializeContainer(container), password);
    expect(JSON.stringify(v2Blob.kdf)).toBe(CURRENT_KDF_FINGERPRINT);
    await put('secondary', v2Blob);

    expect(await tryDuressUnlock(password)).not.toBeNull();
    await awaitDuressRekey();

    const after = await get('secondary');
    expect(JSON.stringify(after.kdf)).toBe(V1_KDF_FINGERPRINT);
    // And it still opens under the duress password.
    expect(await tryDuressUnlock(password)).not.toBeNull();
  }, 300_000);

  it('tryPanicUnlock DELIBERATELY does NOT rekey the panic marker (reviewer C-1 on PR #2103)', async () => {
    // The panic path is followed by panicWipeLocal() → deleteVaultDatabase()
    // in WalletProvider.unlock's catch, immediately after tryPanicUnlock
    // returns true. Any deferred rekey (originally 250ms) would openDb()
    // AFTER the wipe, re-creating veyrnox-vault with a lone `tertiary` blob
    // decryptable with the panic PIN — the exact residue panic-wipe exists
    // to prevent. So the panic path is EXCLUDED from opportunistic rekey.
    // Cost: post-migration, the panic marker's kdf profile may lag the
    // primary until the next explicit setPanicVault() call. Comparatively
    // cheap tell (1 blob among 258) vs. residue-after-wipe.
    const password = '12345678';
    const marker = generateMnemonic(128);
    const v1Blob = await encryptVault(padToFixedLen(marker), password, V1_PARAMS);
    await put('tertiary', v1Blob);

    const ok = await tryPanicUnlock(password);
    expect(ok).toBe(true);
    await awaitPanicRekey(); // resolves immediately — no rekey scheduled

    // Marker on disk is UNCHANGED (still v1). The caller will wipe the whole
    // DB in a moment; the tell only exists on disk if wipe doesn't fire —
    // and that is a wipe-path failure, not a rekey-path failure.
    const after = await get('tertiary');
    expect(vaultNeedsKdfMigration(after)).toBe(true);
    expect(JSON.stringify(after.kdf)).not.toBe(CURRENT_KDF_FINGERPRINT);
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

describe('H-2 — the footprint stays uniform (the property Gate 2 lost)', () => {
  beforeEach(async () => {
    await clearStore();
    try { localStorage.clear(); } catch { /* jsdom */ }
  });

  it('a real write into a v1-era pool leaves EXACTLY ONE fingerprint — no distinguisher at all', async () => {
    // This test used to assert the opposite (`uniq.size === 2`), pinning the
    // mixed state Gate 2 produced. Its own comment said that if it ever
    // collapsed to one, the writer path had "regressed to per-device era
    // (breaking it in the unsafe direction)".
    //
    // That framing was backwards, and this is the correction. The mixed state is
    // not a smaller cost than a uniform v1 pool — it is a total loss of the
    // property the pool exists for. In a two-fingerprint pool the MINORITY
    // fingerprint is the real hidden wallet, readable from a dump with no secret
    // by sorting on kdf.memorySize. Uniform-at-v1 costs latency (192 MiB vs 96);
    // mixed costs the whole deniability guarantee. Per-device era is the SAFE
    // direction.
    await seedV1ChaffOnly();
    await createHiddenWallet('gate-2-writer-secret-9999');

    const store = await dumpStore();
    const uniq = new Set(SLOT_KEYS.map((k) => JSON.stringify(store[k].kdf)));
    expect(uniq.size).toBe(1);
    expect(uniq.has(V1_KDF_FINGERPRINT)).toBe(true);
    expect(uniq.has(CURRENT_KDF_FINGERPRINT)).toBe(false);

    // 'secondary' and 'tertiary' share the store and the dump, so they are part
    // of the same uniformity claim — a reader sees all 258 blobs at once.
    await setDuressVault(generateMnemonic(128), 'duress-password-1234');
    await setPanicVault('12345678');
    const full = await dumpStore();
    const all = new Set([...SLOT_KEYS, 'secondary', 'tertiary'].map((k) => JSON.stringify(full[k].kdf)));
    expect(all.size).toBe(1);
    expect(all.has(V1_KDF_FINGERPRINT)).toBe(true);
  }, 300_000);
});
