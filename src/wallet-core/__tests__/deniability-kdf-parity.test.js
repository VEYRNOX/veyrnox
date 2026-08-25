// wallet-core/__tests__/deniability-kdf-parity.test.js
//
// H-2 (weekly audit 2026-08-25): CHAFF ↔ REAL KDF-PARAM PARITY.
//
// Every deniability blob on a device — all 256 stealth slots plus the duress
// ('secondary') and panic ('tertiary') slots — must report an IDENTICAL `kdf`
// object. That field is PLAINTEXT in a storage dump, so any divergence is a
// real-vs-chaff distinguisher that needs no secret: sort the slots by
// `kdf.memorySize` and the odd one out is the real hidden wallet.
//
// The KDF profile v2 change (2026-08-24: 192 MiB/t=3 → 96 MiB/t=6, migration
// flag OFF) broke this on every device provisioned before that date. Chaff and
// real blobs are frozen at write time (`paramsFromVault` reads each blob's own
// `kdf`), while every generator stamped the CURRENT `KDF_PARAMS` — so a v1-era
// pool plus one post-upgrade write is 255 slots at 196608 and exactly one at
// 98304.
//
// These tests write RAW v1-era blobs straight into the shared store to stand in
// for such a device (chaff is random bytes by construction, so a fabricated
// chaff blob is the real article). They then exercise the genuine write paths.
//
// Comparison is on JSON.stringify, not toEqual: the claim is that a raw dump
// cannot pick the real slot out, so field ORDER matters as much as field values.

import { describe, it, expect, beforeEach } from 'vitest';
import { ensureStealthPool, createHiddenWallet } from '../stealth.js';
import { setDuressVault } from '../duress.js';
import { generateMnemonic } from '../mnemonic.js';
import { KDF_PARAMS } from '../vault.js';
import { FIXED_LEN } from '../multiVault.js';

const POOL_SIZE = 256;
const SLOT_KEYS = Array.from({ length: POOL_SIZE }, (_, i) => `vault:${i + 1}`);

// The v1 at-rest profile (192 MiB / t=3, PR #604) exactly as it was recorded on
// disk before v2 — note the ABSENCE of `kdfProfileVersion`, which v2 introduced.
const V1_KDF = Object.freeze({
  name: 'argon2id', parallelism: 1, iterations: 3, memorySize: 196608, hashLength: 32,
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

// A chaff blob at an ARBITRARY recorded profile — what stealth.js/provisionChaff
// wrote on a device of that era. Same { v, kdf, salt, iv, ct } shape and the same
// FIXED_LEN + GCM-tag ciphertext length as a real slot.
function chaffAt(kdf) {
  return {
    v: 1,
    kdf: { ...kdf },
    salt: b64(randomBytes(16)),
    iv: b64(randomBytes(12)),
    ct: b64(randomBytes(FIXED_LEN + 16)),
  };
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

async function deleteBlob(key) {
  const db = await openStore();
  try {
    await new Promise((res, rej) => {
      const r = db.transaction('vault', 'readwrite').objectStore('vault').delete(key);
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

// Stand in for a device provisioned before 2026-08-24: a fully-seeded chaff pool
// plus the two deniability slots provisionDeniabilityChaff() fills at PIN
// creation, all recorded at the v1 profile.
async function seedV1Device() {
  const db = await openStore();
  try {
    for (const key of [...SLOT_KEYS, 'secondary', 'tertiary']) {
      await new Promise((res, rej) => {
        const r = db.transaction('vault', 'readwrite').objectStore('vault').put(chaffAt(V1_KDF), key);
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
      });
    }
  } finally {
    db.close();
  }
}

function kdfFingerprints(store, keys) {
  return new Set(keys.map((k) => JSON.stringify(store[k].kdf)));
}

describe('H-2 — chaff ↔ real KDF-param parity across the v1→v2 profile change', () => {
  beforeEach(async () => {
    await clearStore();
  });

  it('a hidden wallet created on a v1-era device leaves all 256 slots reporting an IDENTICAL kdf', async () => {
    await seedV1Device();

    await createHiddenWallet('kdf-parity-secret-one');

    const store = await dumpStore();
    const slots = Object.keys(store).filter((k) => k.startsWith('vault:'));
    expect(slots.length).toBe(POOL_SIZE);

    // THE deniability property: no slot stands out. Before the fix this set has
    // two members — 255 chaff at 196608 and the one real wallet at 98304.
    const fingerprints = kdfFingerprints(store, slots);
    expect([...fingerprints]).toHaveLength(1);
    // …and the era it settled on is the DEVICE's, not the current default.
    expect(JSON.parse([...fingerprints][0])).toEqual({ ...V1_KDF });
  }, 300_000);

  it('a duress PIN set on a v1-era device does not stamp a fresh profile beside the panic chaff', async () => {
    await seedV1Device();

    await setDuressVault(generateMnemonic(128), 'duress-password-1234');

    const store = await dumpStore();
    // The duress ('secondary') and panic ('tertiary') slots are provisioned
    // TOGETHER as chaff; personalising only one of them must not make it
    // distinguishable from its untouched twin — that is precisely the
    // "is duress deliberately configured?" tell provisionChaff.js exists to hide.
    const fingerprints = kdfFingerprints(store, ['secondary', 'tertiary', 'vault:1']);
    expect([...fingerprints]).toHaveLength(1);
    expect(JSON.parse([...fingerprints][0])).toEqual({ ...V1_KDF });
  }, 300_000);

  it('a FRESH device still writes the current v2 profile everywhere (no global pin to v1)', async () => {
    await ensureStealthPool();
    await createHiddenWallet('kdf-parity-fresh-device');

    const store = await dumpStore();
    const slots = Object.keys(store).filter((k) => k.startsWith('vault:'));
    const fingerprints = kdfFingerprints(store, slots);
    expect([...fingerprints]).toHaveLength(1);
    expect(JSON.parse([...fingerprints][0])).toEqual({ name: 'argon2id', ...KDF_PARAMS });
  }, 300_000);

  it('chaff backfilled into a partially-seeded v1 pool matches the slots already there', async () => {
    await seedV1Device();
    // Simulate a pool whose seeding was interrupted (ensureStealthPool is
    // idempotent and fills only MISSING slots, so the backfill must adopt the
    // era of the slots that survived).
    await deleteBlob('vault:7');

    await ensureStealthPool();

    const store = await dumpStore();
    const slots = Object.keys(store).filter((k) => k.startsWith('vault:'));
    expect(slots.length).toBe(POOL_SIZE);
    expect([...kdfFingerprints(store, slots)]).toHaveLength(1);
  }, 120_000);
});
