// @ts-nocheck
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

import { decryptVault, encryptVault, vaultKdfDiffersFrom } from './vault.js';
// H-2 (weekly audit 2026-08-25): a personalised decoy must record the SAME
// Argon2id profile as the chaff already in the store — otherwise setting a
// duress PIN after an at-rest profile change leaves 'secondary' at the new
// params beside a 'tertiary' panic chaff at the old ones, which announces that
// duress was deliberately CONFIGURED rather than left at baseline. All 258
// blobs (256 stealth slots + secondary + tertiary) share one object store and
// are read together in a dump, so the odd one out is the finding.
//
// GATE 2 REVERTED FOR THE WRITE PATH (2026-08-26). #2103 pointed setDuressVault
// at the current KDF_PARAMS, which on any device provisioned before 2026-08-25
// reopened exactly the H-2 tell above — and this is its worst form, because
// unlike a stealth slot the meaning of the odd blob is unambiguous: 'secondary'
// is the duress key, so a v2 'secondary' beside 257 v1 blobs says "this user
// configured a duress PIN". See stealth.js's header for why sweeping the rest
// forward to match is not available.
import { deniabilityKdfProfile, encryptDeniabilityVault, deniabilityKdfProfileWithSource } from './deniabilityKdfProfile.js';
import { makeContainer, serializeContainer, newWalletId } from './multiVault.js';

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
 * H2 (decoy/hidden 2FA parity): the decoy is now wrapped in a FIXED-LENGTH
 * multi-seed container (one wallet) instead of a bare mnemonic, so it can carry its
 * OWN per-set Action-Password record and so its ciphertext length matches the
 * primary set's (deniability — no length tell). `actionPasswordRecord` is the
 * decoy set's serialized verifier, or null when the decoy has no Action Password.
 * The container is padded to FIXED_LEN by serializeContainer, so the persisted
 * blob's length is identical whether or not a record is present.
 *
 * @param {string} decoyMnemonic - a real BIP-39 mnemonic for the decoy wallet
 * @param {string} duressPassword
 * @param {object|null} [actionPasswordRecord] - the decoy set's AP verifier record, if any
 */
export async function setDuressVault(decoyMnemonic, duressPassword, actionPasswordRecord = null) {
  const container = makeContainer(
    [{ id: newWalletId(), mnemonic: decoyMnemonic }],
    actionPasswordRecord ?? undefined,
  );
  const blob = await encryptDeniabilityVault(serializeContainer(container), duressPassword);
  // Mirror vaultStore's guard: refuse anything that is not an encrypted blob.
  if (typeof blob !== 'object' || !blob.ct || !blob.iv || !blob.salt) {
    throw new Error('Refusing to store: not a valid encrypted vault blob');
  }
  const db = await openDb();
  try {
    await /** @type {Promise<void>} */ (new Promise((res, rej) => {
      const r = store(db, 'readwrite').put(blob, DECOY_KEY);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    }));
  } finally {
    db.close();
  }
}

/**
 * Attempt to open the decoy vault with the given password.
 * Returns the decrypted PAYLOAD STRING on success (a multi-seed container JSON
 * after the H2 change, or a legacy bare mnemonic for decoys written before it —
 * parseVault in the caller handles both), or null if there is no decoy vault or
 * the password does not match it. NEVER throws for a wrong password — the caller
 * (WalletProvider.unlock) surfaces the primary error instead, so a miss here is
 * indistinguishable from "no duress vault configured".
 * @param {string} password
 * @returns {Promise<string|null>}
 */
export async function tryDuressUnlock(password) {
  const blob = await loadDecoy();
  if (!blob) {
    // Constant-time guard: run one full Argon2id KDF pass so the absence of a
    // duress vault is timing-indistinguishable from a wrong-password miss.
    // Mirrors stealth.js:tryRevealHidden's dummy decryptVault on no-salt path.
    // H-2: at the DEVICE's recorded era, so the pad costs what decrypting a real
    // decoy on this device costs — at the current default it would under-spend on
    // an installed-base device still holding v1 blobs.
    await encryptDeniabilityVault('__duress_timing_chaff__', password).catch(() => {});
    return null;
  }
  let plaintext;
  try {
    plaintext = await decryptVault(blob, password); // throws on wrong password
  } catch {
    return null;
  }
  // Gate 2 (H-2, owner ruling 2026-08-25): OPPORTUNISTIC REKEY, FIRE-AND-FORGET.
  // If the decoy's recorded profile disagrees with the current one, kick off a
  // re-encrypt at KDF_PARAMS with the SAME password that just decrypted it, but
  // do NOT await it — the H-1 equaliser requires the duress-hit KDF budget to
  // stay identical to the primary-miss budget on the SAME state, and awaiting
  // the rekey's Argon2id derivation would add one observable KDF to duress-hit
  // only, becoming a real-vs-chaff tell exactly where the equaliser hides one.
  // Best-effort: any failure leaves the original blob untouched; correctness is
  // preserved (both writers write to the same key; last write wins).
  // TARGET IS THE FOOTPRINT'S ERA, NOT KDF_PARAMS (changed 2026-08-26) — so this
  // is a REPAIR path, not a migration path. It heals a 'secondary' that an
  // earlier #2103 build wrote at v2 into a v1 footprint; it cannot move the
  // footprint forward, and must not try. Mirrors stealth.js:tryRevealHidden.
  {
    // Deferred to a macrotask so the Argon2id re-derivation runs AFTER the
    // current unlock's timing budget has closed. See stealth.js:tryRevealHidden
    // for the full rationale — the H-1 equaliser holds only if duress-hit costs
    // the same as primary-miss on the same state. The era probe lives inside the
    // callback for the same reason: out here it would land inside that budget.
    _lastKdfRekey = new Promise((resolve) => {
      setTimeout(async () => {
        try {
          // FAIL-SAFE ERA (2026-09-05). `fromPool` is false when the pool could
          // not be read — openDb throwing, or every probe read faulting into
          // null — and NOT only on a genuinely fresh device. The two are
          // indistinguishable from the value alone, and treating an unreadable
          // pool as "the era is the current default" made this repair rewrite an
          // already-uniform slot to v2, leaving it the unique blob in the dump:
          // exactly the #2103 defect this path exists to heal.
          //
          // A repair that cannot see the pool must do nothing. Writers keep
          // defaulting — a fresh device has no era to match — which is why this
          // bit is consumed here and not inside deniabilityKdfProfile().
          const { kdf: era, fromPool } = await deniabilityKdfProfileWithSource();
          const fresh = fromPool && vaultKdfDiffersFrom(blob, era)
            ? await encryptVault(plaintext, password, era)
            : null;
          if (fresh && fresh.ct && fresh.iv && fresh.salt) {
            const db = await openDb();
            try {
              // Reviewer C-1 sibling fix on PR #2103: before writing, verify
              // the DECOY_KEY still exists. If clearDuressVault() or
              // panicWipeLocal() (which calls deleteVaultDatabase and
              // therefore removes DECOY_KEY too) ran inside the 250 ms
              // window, re-inserting the blob would re-create wiped state.
              // Missing → skip. Race window with a legitimate
              // setDuressVault() replacing the blob concurrently is
              // acceptable — that write stamps the same era this repair
              // targets, so a dropped rekey there is a no-op.
              //
              // Skip by NOT writing rather than by returning early, matching
              // stealth.js: the previous `{ db.close(); resolve(); return; }`
              // was correct but closed the db twice (the `finally` below closes
              // it again) and made the resolve()-on-every-path rule something
              // each exit had to remember separately.
              const existing = await /** @type {Promise<any>} */ (new Promise((res, rej) => {
                const rg = store(db, 'readonly').get(DECOY_KEY);
                rg.onsuccess = () => res(rg.result);
                rg.onerror = () => rej(rg.error);
              }));
              if (existing != null) {
                await /** @type {Promise<void>} */ (new Promise((res, rej) => {
                  const r = store(db, 'readwrite').put(fresh, DECOY_KEY);
                  r.onsuccess = () => res();
                  r.onerror = () => rej(r.error);
                }));
              }
            } finally {
              db.close();
            }
          }
        } catch { /* best-effort — duress unlock already returned the payload */ }
        resolve();
      }, 250);
    });
  }
  return plaintext;
}

// Test hook: mirrors stealth.js:_awaitPendingKdfRekey. Fire-and-forget rekey
// keeps the H-1 timing budget; tests reading post-decoy-unlock storage state
// use this to wait deterministically.
let _lastKdfRekey = /** @type {Promise<void>} */ (Promise.resolve());
/** @returns {Promise<void>} */
export function _awaitPendingKdfRekey() { return _lastKdfRekey; }

/** Remove the decoy vault. */
export async function clearDuressVault() {
  const db = await openDb();
  try {
    await /** @type {Promise<void>} */ (new Promise((res, rej) => {
      const r = store(db, 'readwrite').delete(DECOY_KEY);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    }));
  } finally {
    db.close();
  }
}
