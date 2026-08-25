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

// Probe order. Deniability slots first — they are the blobs that MUST agree with
// each other. 'primary' is the last-resort anchor for a device that has a wallet
// but no deniability footprint yet (e.g. the WalletEntry path that skips
// provisionDeniabilityChaff), so the first chaff written there still matches the
// era of the vault beside it. 'quaternary' (the audit-log blob) is deliberately
// NOT probed: it is rewritten on ordinary use, so it tracks recency rather than
// the device's provisioning era.
const PROBE_KEYS = Object.freeze(['secondary', 'tertiary', 'vault:1', 'primary']);

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
    for (const key of PROBE_KEYS) {
      let blob;
      try {
        blob = await getKey(db, key);
      } catch {
        continue;
      }
      // Absent, or a 'kek-dek' blob (kdf is the STRING 'kek-dek' — it derives no
      // Argon2id key, so it records no profile).
      const kdf = blob && blob.kdf;
      if (!kdf || typeof kdf !== 'object') continue;
      try {
        assertSaneKdfParams(/** @type {any} */ (kdf));
      } catch {
        continue; // malformed/out-of-range record — keep looking
      }
      return Object.freeze({ ...kdf });
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
