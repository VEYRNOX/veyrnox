// wallet-core/provisionChaff.js
//
// ALWAYS-PROVISION the deniability slots. PROVISIONAL — ⚠️ FLAGGED FOR AUDIT. ⚠️
//
// Single-mode deniability requires every PIN device to be structurally identical
// regardless of what the user personalized: the storage footprint must NOT reveal
// whether a duress/panic credential was set. (Timing is already constant — see
// deniabilityUnlock.js.) So at PIN creation we silently provision a CHAFF blob in
// both the duress ('secondary') and panic ('tertiary') slots.
//
// The chaff is a VAULT-SHAPED RANDOM BLOB. Nobody holds a secret for it, so it is
// genuinely unopenable; a non-enrolled PIN never matches it and is rejected with an
// explicit "Incorrect PIN" error (v2 model — the Option-A deterministic decoy was
// removed, commit d27e816), exactly as it would past a real duress blob. We stamp the
// CURRENT KDF params + fixed-length ciphertext shape, so decrypting the chaff later
// spends the SAME Argon2id work as decrypting a real deniability blob. This avoids
// paying two extra 192 MiB Argon2 encryptions during onboarding — the Firebase/Test Lab
// failure path — while preserving the on-disk shape and unlock-path cost profile.
//
// Idempotent and never-overwrite (mirrors stealth.js ensureStealthPool): it writes
// ONLY into an empty slot, so a personalized credential is never clobbered and a
// slot that failed to provision earlier is backfilled on the next call.
//
// TESTNET ONLY. No network/provider/signing — only local encrypt + store.

import { FIXED_LEN } from './multiVault.js';
import { KDF_PARAMS } from './vault.js';
import { hasDuressVault } from './duress.js';
import { hasPanicVault } from './panic.js';

const DB_NAME = 'veyrnox-vault';
const STORE = 'vault';
const DURESS_KEY = 'secondary';
const PANIC_KEY = 'tertiary';
const GCM_TAG_LEN = 16;

function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

function b64(u8) {
  let s = '';
  for (const x of u8) s += String.fromCharCode(x);
  return btoa(s);
}

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

function store(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function makeChaffBlob() {
  return {
    v: 1,
    kdf: { name: 'argon2id', ...KDF_PARAMS },
    salt: b64(randomBytes(16)),
    iv: b64(randomBytes(12)),
    ct: b64(randomBytes(FIXED_LEN + GCM_TAG_LEN)),
  };
}

async function putBlob(key, blob) {
  const db = await openDb();
  try {
    await /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
      const req = store(db, 'readwrite').put(blob, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }));
  } finally {
    db.close();
  }
}

/**
 * Ensure both deniability slots hold a blob, provisioning chaff into any empty
 * slot. Idempotent; never overwrites an existing (chaff or personalized) blob.
 * strength=128 matches setDuressPin's default so chaff and personalized duress
 * blobs carry the same kind of 12-word-mnemonic plaintext.
 *
 * H2: the duress chaff goes through setDuressVault, which now wraps the mnemonic in
 * a FIXED-LENGTH multi-seed container (padded to FIXED_LEN). A personalized duress
 * blob is wrapped the SAME way, so chaff and real duress blobs remain ciphertext-
 * length-identical — the load-bearing deniability property. The panic chaff goes
 * through setPanicVault, which now pads the throwaway marker to the SAME FIXED_LEN
 * plaintext (H2 part B) — so chaff panic and real panic are ciphertext-length-
 * identical, AND the panic ('tertiary') blob is length-identical to the duress
 * ('secondary') blob. Chaff matches its own slot's real shape via the identical path.
 * @returns {Promise<void>}
 */
export async function provisionDeniabilityChaff() {
  if (!(await hasDuressVault())) {
    await putBlob(DURESS_KEY, makeChaffBlob());
  }
  if (!(await hasPanicVault())) {
    await putBlob(PANIC_KEY, makeChaffBlob());
  }
}
