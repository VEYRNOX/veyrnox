// @ts-nocheck
// wallet-core/evm/vaultStore.js
//
// Local-first persistence for the ENCRYPTED vault blob (IndexedDB).
//
// SECURITY RATIONALE
//   - Only ciphertext from vault.js is ever written. Plaintext seeds/keys
//     are NEVER persisted. The store holds exactly what a malicious backend
//     would: an opaque blob it cannot decrypt.
//   - IndexedDB (not localStorage) because it stores structured/binary data
//     cleanly and is less casually scraped by injected page scripts.
//   - Backend sync is intentionally OUT of scope for this slice. If added
//     later, the SAME encrypted blob is pushed to storage the server cannot
//     decrypt — no new plaintext exposure.

const DB_NAME = 'veyrnox-vault';
const STORE = 'vault';
const KEY = 'primary'; // single-vault slice; extend to multiple if needed

function openDb() {
  // DISCLOSURE (L-5, 2026-07-12): Safari on iOS/iPadOS syncs IndexedDB to iCloud
  // Drive by default. There is no Web API to opt a specific database out of this
  // sync. The vault stored here is AES-256-GCM ciphertext, so iCloud possession
  // alone does not break the cipher. Residual risks: broadened attack surface
  // (vault reachable on other devices signed into the same Apple ID) and possible
  // vault restoration on a replacement device after a wipe. Mitigation is the
  // existing cipher strength; users on Safari/iOS should be aware of this behaviour.
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

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

/** Persist the encrypted vault blob (the object returned by encryptVault). */
export async function saveVault(vaultBlob) {
  // Guard: refuse to store anything that looks like plaintext key material.
  if (typeof vaultBlob !== 'object' || !vaultBlob.ct || !vaultBlob.iv || !vaultBlob.salt) {
    throw new Error('Refusing to store: not a valid encrypted vault blob');
  }
  const db = await openDb();
  await /** @type {Promise<void>} */ (new Promise((res, rej) => {
    const r = tx(db, 'readwrite').put(vaultBlob, KEY);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  }));
  db.close();
}

export async function loadVault() {
  const db = await openDb();
  const out = await new Promise((res, rej) => {
    const r = tx(db, 'readonly').get(KEY);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => rej(r.error);
  });
  db.close();
  return out;
}

export async function hasVault() {
  return (await loadVault()) !== null;
}

export async function clearVault() {
  const db = await openDb();
  await /** @type {Promise<void>} */ (new Promise((res, rej) => {
    const r = tx(db, 'readwrite').delete(KEY);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  }));
  db.close();
}
