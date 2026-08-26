// wallet-core/deniabilityKdfProfile.js
//
// PER-DEVICE KDF ERA for the deniability footprint.  PROVISIONAL — ⚠️ AUDIT. ⚠️
//
// WHY THIS EXISTS (weekly audit 2026-08-25, H-2). Every deniability blob is
// vault-shaped and records the Argon2id params it was written under, IN
// PLAINTEXT, in its `kdf` field. That is by design — `paramsFromVault` decrypts
// each blob at its OWN recorded params, which is what lets old vaults keep
// opening after the at-rest profile is raised. It also means the `kdf` field is
// visible to anyone who dumps IndexedDB, WITHOUT any secret.
//
// So the deniability layer needs a property the primary vault does not: every
// slot in the footprint — all POOL_SIZE stealth slots plus the duress
// ('secondary') and panic ('tertiary') slots — must report an IDENTICAL `kdf`
// object. Chaff and real alike. If one slot differs, sorting the dump by
// `kdf.memorySize` picks out the real hidden wallet, or reveals that the duress
// slot was deliberately personalised while its twin is untouched chaff.
//
// The generators used to stamp the CURRENT `KDF_PARAMS`, with a comment
// explaining that hardcoding them would let chaff diverge from real blobs. That
// reasoning holds only while chaff and real are written in the SAME era. The v2
// profile change (2026-08-24: 192 MiB/t=3 → 96 MiB/t=6, with
// KDF_PROFILE_V2_MIGRATION_ENABLED still false) broke it: on any device
// provisioned earlier, the existing footprint is frozen at v1 while every NEW
// write lands at v2 — 255 slots at 196608 and exactly one at 98304.
//
// THE FIX (option (b) of the audit's two). Do not stamp the current default;
// stamp the era THIS DEVICE's footprint is already in, read back from the
// footprint itself. A fresh device has nothing to read and gets `KDF_PARAMS`, so
// new installs are all-v2 and self-consistent. An upgraded device keeps writing
// v1 until the whole footprint is rekeyed together (option (a), which needs the
// keystore-side primary rekey in native.js to move at the same time).
//
// NO NEW STORAGE, DELIBERATELY. Recording the era in its own localStorage key
// would be a new always-present artifact to add to panic.js's residue list, and
// a second source of truth that can drift from the blobs it describes. The blobs
// already carry the answer; a wipe erases the question along with them.
//
// HONEST LIMITS:
//   - This RESTORES parity for future writes; it does not HEAL a device that
//     already wrote a mixed footprint under the broken build. Only a rekey of
//     the whole footprint (option (a)) can do that.
//   - Consequently an upgraded device keeps paying the v1 (192 MiB) cost on its
//     deniability slots. That is the stronger KDF, so the tradeoff is latency,
//     not crack-resistance — and uniformity is the load-bearing property here.
//   - PROBE_KEYS is a fixed short list, not a scan: the first blob found with a
//     well-formed `kdf` object wins. Probing the two chaff slots first is
//     deliberate — they are written once at PIN creation and effectively never
//     rewritten, so they are the most faithful record of the device's era.
//
// TESTNET ONLY. Reads local storage and returns parameters; no network, no
// signing, no key material.

import { KDF_PARAMS, assertSaneKdfParams, encryptVault } from './vault.js';

// Same database + store as the primary vault, the duress decoy, the panic marker
// and the stealth pool (see duress.js / panic.js / stealth.js for the rationale
// behind keeping one shared, neutrally-named store). Re-opening by name is plain
// storage plumbing; no vault crypto lives here.
const DB_NAME = 'veyrnox-vault';
const STORE = 'vault';

// Probe order. STEALTH-POOL SLOTS FIRST (changed 2026-08-26), then the duress
// and panic slots, then 'primary' as a last-resort anchor for a device that has
// a wallet but no deniability footprint yet (e.g. the WalletEntry path that
// skips provisionDeniabilityChaff). 'quaternary' (the audit-log blob) is
// deliberately NOT probed: it is rewritten on ordinary use, so it tracks
// recency rather than the device's provisioning era.
//
// WHY THE POOL AND NOT 'secondary' (this order was the other way round until
// #2103 invalidated its premise). The original reasoning was that secondary and
// tertiary "are written once at PIN creation and effectively never rewritten,
// so they are the most faithful record of the device's era". setDuressVault and
// setPanicVault DO rewrite them — and #2103 pointed those writers at the current
// default. So on any device that ran that build and set a duress PIN, 'secondary'
// records v2 while the 256 stealth slots beside it are still v1, and probing it
// first reports the wrong era with total confidence. That poisons every
// subsequent write AND the repair path that is supposed to heal it.
//
// The stealth slots carry no such hazard: ensureStealthPool only ever fills a
// MISSING slot and never rewrites one, so a chaff slot really is written once
// and is the faithful record the old comment wanted.
const PROBE_KEYS = Object.freeze([
  'vault:1', 'vault:2', 'vault:3', 'vault:4', 'vault:5',
  'secondary', 'tertiary', 'primary',
]);

// How many leading PROBE_KEYS are stealth-pool slots. Those are voted on rather
// than first-match-wins: a slot may hold a REAL hidden wallet rather than chaff,
// and if that wallet was written by the #2103 build it records the current
// default instead of the pool's era. One such slot among the sample would
// otherwise steer every future write wrong. Reading 5 and taking the majority
// makes that need 3 of the 5 sampled slots to be #2103-written real wallets,
// which is vanishingly unlikely (a user has a handful of hidden wallets spread
// over 256 slots). The remaining keys stay first-match-wins — by the time we
// reach them there is no pool to vote over.
const POOL_PROBE_COUNT = 5;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getKey(db, key) {
  return new Promise((res, rej) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    r.onsuccess = () => res(r.result ?? null);
    r.onerror = () => rej(r.error);
  });
}

/**
 * One probe: the `kdf` object recorded by the blob at `key`, or null if there is
 * nothing usable there. Null covers absent, unreadable, a 'kek-dek' blob (its
 * kdf is the STRING 'kek-dek' — it derives no Argon2id key, so it records no
 * profile), and a malformed or out-of-range record. The range check is the same
 * `assertSaneKdfParams` the read path applies, so a corrupt or hostile blob
 * cannot steer a new write to an OOM-sized memorySize.
 *
 * @param {IDBDatabase} db
 * @param {string} key
 * @returns {Promise<Record<string, unknown>|null>}
 */
async function readProfile(db, key) {
  let blob;
  try {
    blob = await getKey(db, key);
  } catch {
    return null;
  }
  const kdf = blob && blob.kdf;
  if (!kdf || typeof kdf !== 'object') return null;
  try {
    assertSaneKdfParams(/** @type {any} */ (kdf));
  } catch {
    return null;
  }
  return /** @type {Record<string, unknown>} */ (kdf);
}

/**
 * The Argon2id profile this device's deniability blobs are recorded under, as a
 * `kdf`-shaped object ready to stamp into a new blob. Falls back to the current
 * KDF_PARAMS when nothing readable exists (fresh device, post-panic-wipe, or a
 * storage fault) — the same value the generators used before this module, so the
 * fallback can never be worse than the previous behaviour.
 *
 * A recorded profile is accepted only if it passes the same
 * `assertSaneKdfParams` range check the read path applies, so a corrupt or
 * hostile blob cannot steer a new write to an OOM-sized memorySize.
 *
 * @returns {Promise<Record<string, unknown>>}
 */
export async function deniabilityKdfProfile() {
  let db;
  try {
    db = await openDb();
  } catch {
    return KDF_PARAMS;
  }
  try {
    // Pass 1 — vote over the stealth-pool sample. See POOL_PROBE_COUNT.
    /** @type {Map<string, Record<string, unknown>>} */
    const seen = new Map();
    /** @type {Map<string, number>} */
    const votes = new Map();
    for (const key of PROBE_KEYS.slice(0, POOL_PROBE_COUNT)) {
      const kdf = await readProfile(db, key);
      if (!kdf) continue;
      const fp = JSON.stringify(kdf);
      seen.set(fp, kdf);
      votes.set(fp, (votes.get(fp) ?? 0) + 1);
    }
    let bestFp = null;
    let bestCount = 0;
    for (const [fp, n] of votes) {
      // Strict > keeps the FIRST-probed profile on a tie, which preserves the
      // old first-match-wins behaviour for a 1-1 split rather than picking
      // arbitrarily by Map order.
      if (n > bestCount) { bestFp = fp; bestCount = n; }
    }
    if (bestFp != null) return Object.freeze({ .../** @type {any} */ (seen.get(bestFp)) });

    // Pass 2 — no readable pool (fresh device, wiped, or a storage fault).
    // First match wins among the remaining anchors.
    for (const key of PROBE_KEYS.slice(POOL_PROBE_COUNT)) {
      const kdf = await readProfile(db, key);
      if (kdf) return Object.freeze({ ...kdf });
    }
  } finally {
    try { db.close(); } catch { /* best-effort */ }
  }
  return KDF_PARAMS;
}

/**
 * `encryptVault` for a DENIABILITY slot: identical crypto, but stamped and
 * derived at this device's recorded era rather than the current default, so the
 * new blob is indistinguishable from the chaff around it.
 *
 * Every writer into the shared store's deniability keys routes through here
 * (stealth.js create/move/AP-record, duress.js setDuressVault, panic.js
 * setPanicVault) — that single chokepoint is the point. A writer that calls
 * `encryptVault` directly reintroduces H-2 for its own slot.
 *
 * @param {string} secret
 * @param {string} password
 * @returns {Promise<object>}
 */
export async function encryptDeniabilityVault(secret, password) {
  return encryptVault(secret, password, await deniabilityKdfProfile());
}
