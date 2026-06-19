// wallet-core/panic.js
//
// PANIC WIPE  (S3 — Direction-C individual security).  PROVISIONAL.
// ⚠️ DESTRUCTIVE + SAFETY-CRITICAL — FLAGGED FOR SPECIFIC AUDIT SCRUTINY. ⚠️
//
// GOAL — give a user under threat a way to RAPIDLY and IRREVERSIBLY destroy the
// LOCAL device copy of all wallet key material, so that nothing on the device is
// recoverable. This destroys the encrypted vault AND every deniability artifact
// (the duress decoy and the entire stealth/hidden-wallet pool) in one shot. It
// is the destructive counterpart to the (non-destructive) duress + stealth
// features: where those HIDE keys, this DESTROYS them.
//
// ───────────────────────────────────────────────────────────────────────────
// WHAT THIS DESTROYS  (and what it does NOT)
// ───────────────────────────────────────────────────────────────────────────
// DESTROYS — everything in the SAME 'veyrnox-vault' / 'vault' IndexedDB store
// that the rest of the wallet uses for at-rest key material:
//   - the PRIMARY encrypted vault ('primary');
//   - the DURESS decoy vault     ('secondary', see duress.js);
//   - the entire STEALTH pool    ('vault:1'..'vault:N', real + chaff, stealth.js);
//   - the PANIC marker itself    ('tertiary', see below);
//   - and any other entry in that store — we clear() the WHOLE store, so a
//     future-added key cannot silently survive a wipe.
// It then best-effort DELETES the database entirely (so even the empty store
// structure is gone), and clears the DEMO-only address-residue maps in
// localStorage (decoy/hidden demo balances — not key material, but they name
// addresses, so a thorough wipe removes them too).
//
// DOES NOT DESTROY — and we DO NOT CLAIM IT DOES:
//   - A SEED BACKUP THE USER HOLDS ELSEWHERE. Panic wipe destroys the LOCAL
//     device copy only. If the user wrote the recovery phrase on paper, saved it
//     to a password manager, or has it on another device, the wallet is STILL
//     RECOVERABLE from that backup. This is INTENDED: wipe protects the DEVICE,
//     not the seed. State this plainly to the user (the page UI does).
//   - ON-CHAIN STATE. Addresses, balances, and transaction history remain public
//     on the blockchain forever; wiping the device cannot touch them.
//   - FORENSIC MEDIA RECOVERY. JavaScript / IndexedDB cannot guarantee secure
//     erasure of the underlying flash storage (wear-levelling, copy-on-write,
//     snapshots, swap). We delete the logical records; we do NOT claim
//     cryptographic media sanitisation. The strongest control is that the data
//     was only ever stored as ciphertext — a recovered blob is still gated by
//     Argon2id + AES-GCM and the (now unknowable, never-stored) password.
//
// ───────────────────────────────────────────────────────────────────────────
// TRIGGER + MISFIRE PROTECTION  (a misfire loses the user's funds — get it right)
// ───────────────────────────────────────────────────────────────────────────
// This module provides the destruction primitive and a PANIC-PIN MARKER. The two
// triggers are wired in WalletProvider / the PanicWipe page:
//
//   1. PANIC PIN AT UNLOCK (primary, duress-appropriate). The user sets a
//      dedicated panic PIN. Entered at the SAME unlock prompt as every other
//      secret, it fires the wipe with NO confirmation dialog — under genuine
//      duress a "are you sure?" prompt is a liability (a coercer can cancel it,
//      and it signals what is happening). Misfire protection: the marker is a
//      real AES-GCM blob, so the wipe fires ONLY on an exact decrypt success — a
//      wrong password can never accidentally trigger it; it is checked only AFTER
//      the primary unlock fails, so the user's REAL password never wipes; and it
//      requires a deliberate ≥6-char PIN the user chose specifically to destroy.
//      TRADEOFF (documented, accepted for the threat model): no confirmation
//      means a user who fat-fingers EXACTLY their panic PIN at unlock loses the
//      local copy. We mitigate with the length floor and the "set it to something
//      you'd never type by accident" guidance, and accept the residual risk
//      because duress-usability requires no dialog.
//
//   2. IN-APP GUARDED ACTION (deliberate, non-duress decommissioning). A button
//      behind a type-to-confirm ("WIPE") + an explicit acknowledgement checkbox,
//      for a user calmly retiring/selling a device. Here a confirmation IS
//      appropriate (no coercion), so this path is hard to fire by accident.
//
// TESTNET ONLY. This module never touches networks, providers, or signing — it
// only manages a marker blob and deletes local storage. It cannot move funds.
//
// NOTE ON SCOPE: like duress.js / stealth.js, this re-opens the shared
// IndexedDB by NAME (plain storage plumbing). It does NOT import or modify the
// vault crypto internals (vault.js / vaultStore.js / signing.js); it reuses
// encryptVault/decryptVault verbatim for the panic marker.

import { encryptVault, decryptVault } from './vault.js';
import { generateMnemonic } from './mnemonic.js';

// Same database + store as the primary vault (see evm/vaultStore.js), the duress
// decoy ('secondary'), and the stealth pool ('vault:N'). The panic marker sits in
// the SAME store under a neutral key so the artifact does not announce itself.
const DB_NAME = 'veyrnox-vault';
const STORE = 'vault';
// Neutral, non-incriminating key (follows 'primary'/'secondary'); a forensic dump
// sees one more vault-shaped blob, not a key literally named "panic". The marker
// is byte-shaped like every other vault blob, so it does not stand out.
const PANIC_KEY = 'tertiary';

// Minimum panic-PIN length. Higher than duress's 4-char floor: this is
// destructive, so we make accidental entry meaningfully harder.
const MIN_PANIC_LEN = 6;

// DEMO-only address-residue maps in localStorage (decoyBalance.js /
// hiddenBalance.js). NOT key material, but they name decoy/hidden addresses, so a
// thorough wipe clears them too. Kept here as plain strings to avoid coupling.
const LOCAL_RESIDUE_KEYS = Object.freeze([
  'veyrnox-decoy-demo-balances',
  'veyrnox-hidden-demo-balances',
  // VULN-5 fix: biometricUnlock.js previously persisted the plaintext vault
  // password here in demo mode. The demoStore path now uses an in-memory variable
  // instead, so this key will normally be absent — but include it in the wipe
  // list so any residue from older app versions is cleared on panic.
  'veyrnox-bio-unlock-secret',
]);

// DENIABILITY TELLS in localStorage that a wipe MUST also destroy (internal audit
// C-1; extended per AI-review F-02/F-03/F-05, 2026-06-19). These are not key
// material, but each is a forensic artifact that betrays the coercion-resistance
// stack was in use — exactly what a panic wipe exists to erase. Leaving them means
// a "successful" wipe still proves the stack was here (and the decoy salt + a
// coerced PIN reproduces the deterministic decoy). Kept as plain strings, mirroring
// the demo-residue pattern (deliberately NOT importing the source modules — panic.js
// stays decoupled from the deniability stack it erases); source modules in comments:
//   veyrnox-pin-decoy-salt    — decoyFallback.js (seed of the deterministic decoy)
//   veyrnox-auth-model        — lib/authModel.js (PIN-cohort marker)
//   veyrnox-audit-log         — auditLog.js AUDIT_LOG_PREF_KEY (audit-log enabled tell)
//   veyrnox-stealth-slot-salt — stealth.js (proves the hidden-wallet pool was
//                               provisioned — the strongest tell in this set; F-02)
//   veyrnox-audit-device-salt — auditLog.js (per-device audit-log key-derivation
//                               salt; tell the audit feature was configured; F-03)
//   veyrnox-passkey-unlock    — lib/passkey.js PASSKEY_PREF_KEY (F-05)
//   veyrnox-passkey-cred      — lib/passkey.js PASSKEY_CRED_KEY (F-05)
//   veyrnox-2fa-passkey       — lib/passkey.js TWOFACTOR_PASSKEY_KEY (F-05)
// The audit-log DATA blob ('quaternary') already dies with clearVaultStore(); this
// removes the surviving enabled-pref and the per-device salt. A test pins these so a
// key rename is caught. ALL_RESIDUE_KEYS is the single list driving BOTH the erase
// (clearLocalAddressResidue) AND the inspection (readLocalAddressResidue →
// inspectKeyMaterial().clean), so adding a key here fixes both at once (closes F-04).
const DENIABILITY_RESIDUE_KEYS = Object.freeze([
  'veyrnox-pin-decoy-salt',
  'veyrnox-auth-model',
  'veyrnox-audit-log',
  'veyrnox-stealth-slot-salt',
  'veyrnox-audit-device-salt',
  'veyrnox-passkey-unlock',
  'veyrnox-passkey-cred',
  'veyrnox-2fa-passkey',
]);

// Every localStorage key a wipe must remove + the inspection must account for.
const ALL_RESIDUE_KEYS = Object.freeze([...LOCAL_RESIDUE_KEYS, ...DENIABILITY_RESIDUE_KEYS]);

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

function getKey(db, key) {
  return new Promise((res, rej) => {
    const r = store(db, 'readonly').get(key);
    r.onsuccess = () => res(r.result ?? null);
    r.onerror = () => rej(r.error);
  });
}

/** Whether a panic PIN is currently configured (a marker blob exists). */
export async function hasPanicVault() {
  const db = await openDb();
  try {
    return (await getKey(db, PANIC_KEY)) !== null;
  } finally {
    db.close();
  }
}

/**
 * Configure (or replace) the panic PIN. We never store the PIN; instead we store
 * a real AES-GCM blob encrypting a THROWAWAY mnemonic under the PIN. The plaintext
 * is never used — `tryPanicUnlock` only tests whether the PIN can DECRYPT it (GCM
 * auth ⇒ success iff the PIN matches). The blob is byte-shaped exactly like the
 * primary/decoy/stealth vaults, so the marker is not a feature tell. Never
 * persists plaintext.
 *
 * The panic PIN MUST differ from the primary password and any duress PIN — if it
 * matched one of those, that path would win at unlock and the wipe would never
 * fire. We cannot check those (we never hold them in plaintext), so the caller
 * warns the user; documented in the page UI.
 *
 * @param {string} panicPassword
 */
export async function setPanicVault(panicPassword) {
  if (typeof panicPassword !== 'string' || panicPassword.length < MIN_PANIC_LEN) {
    throw new Error(`Panic/wipe PIN must be at least ${MIN_PANIC_LEN} characters`);
  }
  const marker = generateMnemonic(128); // throwaway; only its decryptability matters
  const blob = await encryptVault(marker, panicPassword);
  // Mirror vaultStore's guard: refuse anything that is not an encrypted blob.
  if (typeof blob !== 'object' || !blob.ct || !blob.iv || !blob.salt) {
    throw new Error('Refusing to store: not a valid encrypted vault blob');
  }
  const db = await openDb();
  try {
    await new Promise((res, rej) => {
      const r = store(db, 'readwrite').put(blob, PANIC_KEY);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  } finally {
    db.close();
  }
}

/** Remove the panic PIN marker WITHOUT wiping anything else. */
export async function clearPanicVault() {
  const db = await openDb();
  try {
    await new Promise((res, rej) => {
      const r = store(db, 'readwrite').delete(PANIC_KEY);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Test whether `password` is the configured panic PIN. Returns true on an exact
 * decrypt of the marker, false otherwise (no marker, wrong password). NEVER
 * throws — like tryDuressUnlock/tryRevealHidden, a miss is silent so the unlock
 * prompt gives no tell. The decrypted plaintext is discarded; only success/fail
 * matters.
 *
 * TIMING NOTE (documented limit, mirrors duress.js): when a panic PIN IS
 * configured this runs one KDF; when it is NOT, it returns immediately (no
 * marker). So the PRESENCE of a panic PIN — not its value — is in principle
 * timeable at the prompt. Accepted for testnet/provisional; flagged for audit.
 *
 * @param {string} password
 * @returns {Promise<boolean>}
 */
export async function tryPanicUnlock(password) {
  if (typeof password !== 'string' || password.length === 0) return false;
  const db = await openDb();
  let blob;
  try {
    blob = await getKey(db, PANIC_KEY);
  } finally {
    db.close();
  }
  if (!blob) return false;
  try {
    await decryptVault(blob, password); // throws on wrong PIN
    return true;
  } catch {
    return false;
  }
}

// Clear every residue key in localStorage — the DEMO address maps AND the
// deniability tells (C-1). Guarded for non-browser/test environments.
function clearLocalAddressResidue() {
  try {
    if (typeof localStorage === 'undefined') return;
    for (const k of ALL_RESIDUE_KEYS) localStorage.removeItem(k);
  } catch { /* storage may be unavailable; not key material */ }
}

// Which residue keys (demo maps + deniability tells) still exist in localStorage
// (for the report). A non-empty result means the wipe was incomplete.
function readLocalAddressResidue() {
  try {
    if (typeof localStorage === 'undefined') return [];
    return ALL_RESIDUE_KEYS.filter((k) => localStorage.getItem(k) != null);
  } catch {
    return [];
  }
}

// Remove EVERY entry in the vault store — the guaranteed key-material kill. Using
// clear() (not per-key deletes) means primary, secondary, the panic marker, all
// stealth slots, AND any future-added key are removed; nothing can silently
// survive a wipe.
async function clearVaultStore() {
  const db = await openDb();
  try {
    await new Promise((res, rej) => {
      const r = store(db, 'readwrite').clear();
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  } finally {
    db.close();
  }
}

// Best-effort: delete the whole database so even the empty store structure is
// gone. Resolves on success, error, OR blocked — a lingering connection must not
// hang the wipe, and the store was already cleared above regardless.
function deleteVaultDatabase() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve(); } };
    let req;
    try {
      req = indexedDB.deleteDatabase(DB_NAME);
    } catch {
      finish();
      return;
    }
    req.onsuccess = finish;
    req.onerror = finish;   // store already cleared; deletion is belt-and-braces
    req.onblocked = finish; // do not hang on a lingering connection
  });
}

/**
 * NON-DESTRUCTIVE inspection of what local key material currently exists. Used
 * BEFORE a wipe (to show what is there) and AFTER (to prove nothing recoverable
 * remains). Re-opens the store (recreating an empty one if the DB was deleted)
 * and enumerates its keys, plus the DEMO residue maps. `clean` is true when no
 * vault blob and no residue map remain.
 *
 * @returns {Promise<{ indexedDbKeys: string[], vaultBlobCount: number, localStorageResidue: string[], clean: boolean }>}
 */
export async function inspectKeyMaterial() {
  const db = await openDb();
  let keys;
  try {
    keys = await new Promise((res, rej) => {
      const r = store(db, 'readonly').getAllKeys();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    });
  } finally {
    db.close();
  }
  const residue = readLocalAddressResidue();
  return {
    indexedDbKeys: keys,
    vaultBlobCount: keys.length,
    localStorageResidue: residue,
    clean: keys.length === 0 && residue.length === 0,
  };
}

/**
 * THE DESTRUCTION PRIMITIVE. Irreversibly destroy all LOCAL key material:
 *   1. clear() the entire vault store (primary + duress + stealth pool + panic
 *      marker + anything else);
 *   2. best-effort delete the database;
 *   3. clear the DEMO-only address-residue maps;
 *   4. return a post-wipe inspection report proving nothing recoverable remains.
 *
 * On NATIVE (M2b) the primary vault is hardware-backed and lives outside this
 * IndexedDB; WalletProvider.panicWipe ALSO calls keyStore.clearVault() to destroy
 * that copy. This function owns the web/IndexedDB seam (where duress + stealth
 * always live, even on native today).
 *
 * @returns {Promise<{ indexedDbKeys: string[], vaultBlobCount: number, localStorageResidue: string[], clean: boolean }>}
 */
export async function panicWipeLocal() {
  await clearVaultStore();
  await deleteVaultDatabase();
  clearLocalAddressResidue();
  return inspectKeyMaterial();
}
