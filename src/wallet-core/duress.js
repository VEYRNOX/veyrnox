// wallet-core/duress.js
//
// DURESS / DECOY VAULT  (S3 — individual security).  PROVISIONAL.
//
// GOAL — plausible deniability under coercion. The user sets a SECONDARY
// "duress" password. Entered at the NORMAL unlock prompt (the same field as the
// real password), it opens a DECOY wallet instead of the real one. Under duress
// the user surrenders the duress password; the attacker sees a genuine but
// low-value wallet and cannot tell that a real wallet is also present.
//
// HOW THE DECOY IS REPRESENTED  — a REAL, SEPARATELY-ENCRYPTED VAULT, not a
// synthetic "fake balance" UI. The decoy is its own BIP-39 mnemonic, encrypted
// with the SAME crypto as the primary vault (encryptVault / decryptVault =
// Argon2id + AES-256-GCM, vault.js, UNCHANGED). Rationale:
//   - No parallel secret-handling path and no new crypto: we REUSE vault.js
//     verbatim — the decoy blob is byte-for-byte the same shape as the primary.
//   - The decoy session is indistinguishable from an ordinary empty wallet
//     because it IS one: real derived addresses, genuinely-empty testnet
//     history. There is NO "you are in decoy mode" branch in the wallet UI for
//     an observer to notice — the wallet simply shows whatever vault unlocked.
//   - An attacker who decrypts the decoy learns nothing about the primary; the
//     two ciphertext blobs are independent AES-GCM blobs, neither labelled
//     "real" or "decoy".
//
// UNLOCK ROUTING — this module is consulted ONLY from WalletProvider.unlock,
// and ONLY AFTER the primary keyStore.unlock() attempt has FAILED.
// tryDuressUnlock() returns the decoy mnemonic on a match and null otherwise;
// WalletProvider re-throws the ORIGINAL primary-unlock error on a miss, so the
// failure message / behaviour is identical whether or not a duress vault was
// ever configured. The real unlock flow (keyStore + vault.js) is untouched.
//
// STORAGE — the decoy blob lives in the SAME IndexedDB database and object store
// as the primary vault ('veyrnox-vault' / 'vault'), under a DIFFERENT key. The
// existing vaultStore.js comments already anticipate this ("single-vault slice;
// extend to multiple if needed"). Keeping both blobs in one store — rather than
// a database literally named "duress" — avoids the most blatant storage tell.
// vaultStore.js itself is NOT imported or modified; we only re-open the same
// IndexedDB by name, which is plain storage plumbing, not vault crypto.
//
// HONEST LIMITATIONS  (threat model — provisional, flagged for audit):
//   - STORAGE-LEVEL DENIABILITY IS PARTIAL. A forensic attacker with raw device
//     access can observe that TWO encrypted blobs exist in the store and infer
//     the feature may be in use. This is NOT VeraCrypt-style hidden-volume
//     steganography. What this delivers is RUNTIME deniability — identical UI,
//     error text, and work-per-attempt at the unlock prompt. True hidden-volume
//     storage is out of scope and explicitly flagged.
//   - TIMING. With a decoy configured, a failed guess does 2 KDF runs (primary
//     miss + decoy miss) and so does a successful duress unlock (primary miss +
//     decoy hit) — those two are indistinguishable, which is the property that
//     matters to a coercer. With NO decoy configured a failed guess does 1 KDF
//     run, so the presence (not the contents) of the feature could in principle
//     be timed. Acceptable for testnet/provisional; documented here.
//   - NATIVE. The decoy blob is persisted via web IndexedDB. On native the
//     PRIMARY vault is hardware-backed (M2b); a hardware-backed decoy slot is
//     not wired yet, so the duress decoy is a web/demo feature today. Flagged.
//
// TESTNET ONLY. This module never touches networks, providers, or signing — it
// only encrypts, stores, and decrypts a decoy mnemonic locally. It cannot move
// funds and adds no mainnet surface.

import { encryptVault, decryptVault } from './vault.js';

// Same database + store as the primary vault (see vaultStore.js). The decoy
// occupies a separate KEY within that store. Re-opening by name is storage
// plumbing only; the vault crypto in vault.js is reused unchanged.
const DB_NAME = 'veyrnox-vault';
const STORE = 'vault';
// Intentionally neutral, non-incriminating key (not "duress"/"decoy") so the
// persisted artifact does not itself announce the feature. See header.
const DECOY_KEY = 'secondary';

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

// NOTE: every DB open below MUST close in a `finally` (mirrors panic.js). A
// leaked open connection blocks indexedDB.deleteDatabase during the fail-closed
// onboarding rollback (discardIncompleteWallet -> panicWipeLocal), so a write
// failure here must never leave a connection open.
async function loadDecoy() {
  const db = await openDb();
  try {
    return await new Promise((res, rej) => {
      const r = store(db, 'readonly').get(DECOY_KEY);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    });
  } finally {
    db.close();
  }
}

/** Whether a decoy (duress) vault is currently configured. */
export async function hasDuressVault() {
  return (await loadDecoy()) !== null;
}

/**
 * Create/replace the decoy vault. Encrypts the decoy mnemonic with the duress
 * password using the SAME crypto as the primary vault and persists the
 * resulting ciphertext blob. Never persists plaintext.
 * @param {string} decoyMnemonic - a real BIP-39 mnemonic for the decoy wallet
 * @param {string} duressPassword
 */
export async function setDuressVault(decoyMnemonic, duressPassword) {
  const blob = await encryptVault(decoyMnemonic, duressPassword);
  // Mirror vaultStore's guard: refuse anything that is not an encrypted blob.
  if (typeof blob !== 'object' || !blob.ct || !blob.iv || !blob.salt) {
    throw new Error('Refusing to store: not a valid encrypted vault blob');
  }
  const db = await openDb();
  try {
    await new Promise((res, rej) => {
      const r = store(db, 'readwrite').put(blob, DECOY_KEY);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Attempt to open the decoy vault with the given password.
 * Returns the decoy mnemonic on success, or null if there is no decoy vault or
 * the password does not match it. NEVER throws for a wrong password — the caller
 * (WalletProvider.unlock) surfaces the primary error instead, so a miss here is
 * indistinguishable from "no duress vault configured".
 * @param {string} password
 * @returns {Promise<string|null>}
 */
export async function tryDuressUnlock(password) {
  const blob = await loadDecoy();
  if (!blob) return null;
  try {
    return await decryptVault(blob, password); // throws on wrong password
  } catch {
    return null;
  }
}

/** Remove the decoy vault. */
export async function clearDuressVault() {
  const db = await openDb();
  try {
    await new Promise((res, rej) => {
      const r = store(db, 'readwrite').delete(DECOY_KEY);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  } finally {
    db.close();
  }
}
