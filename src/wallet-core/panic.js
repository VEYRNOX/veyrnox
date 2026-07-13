// @ts-nocheck
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
// structure is gone), best-effort DELETES the SEPARATE 'veyrnox-appdata' database
// (app entity rows — wallets list, tx history, watchlists, approvals, address book,
// alerts; NOT key material, but each row NAMES addresses/tx/labels, so a thorough
// wipe removes it too — F-06), and clears the DEMO-only address-residue maps in
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
import { padToFixedLen, stripPad } from './multiVault.js';
// BIO-05: biometric-2FA enabled tell. Imported (not hardcoded) so a rename in
// biometric.js is caught at build time and the wipe list stays in sync.
import { TWOFACTOR_BIOMETRIC_KEY } from '../lib/biometric.js';

// Same database + store as the primary vault (see evm/vaultStore.js), the duress
// decoy ('secondary'), and the stealth pool ('vault:N'). The panic marker sits in
// the SAME store under a neutral key so the artifact does not announce itself.
const DB_NAME = 'veyrnox-vault';
const STORE = 'vault';
// The SEPARATE app-data database (src/api/localClient.js DB_NAME). It holds NO key
// material — only entity rows (wallets list, tx history, watchlists, approvals,
// address book, price alerts) — but every row NAMES addresses / tx hashes / wallet
// labels, so it is forensic residue tying the device to the destroyed wallet set,
// exactly what a panic wipe exists to erase. We delete it best-effort below, as an
// ADDITIVE deletion of an unrelated DB (F-06 residue sweep); we do NOT touch its
// contents structurally or import localClient — panic.js stays decoupled.
const APPDATA_DB_NAME = 'veyrnox-appdata';
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
// a "successful" wipe still proves the stack was here. Kept as plain strings, mirroring
// the demo-residue pattern (deliberately NOT importing the source modules — panic.js
// stays decoupled from the deniability stack it erases); source modules in comments:
//   vx-2c3d4e5f6a7b8091    — LEGACY: the per-device salt written by the now-removed
//                             Option-A deterministic-decoy module (decoyFallback.js,
//                             deleted 2026-06-23). Nothing seeds this anymore; the key
//                             is retained here SOLELY to scrub the salt from devices
//                             onboarded under the old code (was 'veyrnox-pin-decoy-salt')
//   veyrnox-auth-model     — lib/authModel.js (PIN-cohort marker)
//   vx-a1b2c3d4e5f60718   — auditLog.js AUDIT_LOG_PREF_KEY (opaque; audit-log
//                            enabled tell; was 'veyrnox-audit-log')
//   veyrnox-stealth-slot-salt — stealth.js (proves the hidden-wallet pool was
//                               provisioned — the strongest tell in this set; F-02)
//   vx-9f8e7d6c5b4a3021   — auditLog.js AUDIT_DEVICE_SALT_KEY (opaque; per-device
//                            audit-log key-derivation salt; was
//                            'veyrnox-audit-device-salt'; F-03)
//   veyrnox-passkey-unlock    — lib/passkey.js PASSKEY_PREF_KEY (F-05)
//   veyrnox-passkey-cred      — lib/passkey.js PASSKEY_CRED_KEY (F-05)
//   veyrnox-2fa-passkey       — lib/passkey.js TWOFACTOR_PASSKEY_KEY (F-05)
//   veyrnox-biometric-unlock  — lib/biometric.js BIOMETRIC_PREF_KEY (biometric-
//                               unlock-configured tell; the direct sibling of the
//                               passkey prefs above — F-06)
//   veyrnox-pin-attempts      — components/WalletEntry.jsx (PIN-unlock failed-attempt
//                               counter — the runtime tell of the same PIN auth model
//                               'veyrnox-auth-model' marks; F-06)
//   veyrnox-pin-backoff-until — components/WalletEntry.jsx (PIN-unlock lockout
//                               deadline; survives reload, paired with -pin-attempts; F-06)
// The audit-log DATA blob ('quaternary') already dies with clearVaultStore(); this
// removes the surviving enabled-pref and the per-device salt. A test pins these so a
// key rename is caught. ALL_RESIDUE_KEYS is the single list driving BOTH the erase
// (clearLocalAddressResidue) AND the inspection (readLocalAddressResidue →
// inspectKeyMaterial().clean), so adding a key here fixes both at once (closes F-04).
// Legacy pre-rename keys are also wiped so a panic on a device that has not yet
// triggered the migration path (first auditLog access post-upgrade) leaves no
// old-name residue behind.
const DENIABILITY_RESIDUE_KEYS = Object.freeze([
  'vx-2c3d4e5f6a7b8091',       // LEGACY: salt from the removed Option-A decoy module
                               // (decoyFallback.js, deleted); scrub on old-onboarded devices
  'veyrnox-pin-decoy-salt',     // LEGACY pre-rename of the same removed-module salt; wipe both
  'veyrnox-auth-model',
  'vx-a1b2c3d4e5f60718',        // auditLog.js AUDIT_LOG_PREF_KEY (opaque)
  'veyrnox-audit-log',          // legacy pre-rename
  'veyrnox-stealth-slot-salt',
  'vx-9f8e7d6c5b4a3021',        // auditLog.js AUDIT_DEVICE_SALT_KEY (opaque)
  'veyrnox-audit-device-salt',  // legacy pre-rename
  'veyrnox-passkey-unlock',
  'veyrnox-passkey-cred',
  'veyrnox-2fa-passkey',
  'veyrnox-biometric-unlock',
  TWOFACTOR_BIOMETRIC_KEY,       // biometric.js 'veyrnox-2fa-biometric' (biometric-2FA
                                // enabled tell — reveals security posture after wipe; BIO-05)
  'veyrnox-pin-attempts',
  'veyrnox-pin-backoff-until',
  // WebAuthn PRF credential ID — wallet-core/keystore/web.js CRED_KEY. Proves a
  // hardware-KEK-enrolled Veyrnox vault existed on the device; strongest web tell.
  // Must be erased by panic wipe (I3/I4).
  'veyrnox-prf-cred-id',
  // PW-1: session token written by SecurityCenter.jsx / sessionRevocation.js.
  // Correlatable against backend UserSession records — must be wiped (I3/I4).
  'sdw_session_token',
  // M-7 (#753): priceFeed.js LIVE_PRICE_PREF_KEY — the live-USD-prices opt-in pref.
  // Its presence reveals live-price egress was enabled on this device, i.e. that a
  // Veyrnox wallet was used here; a wipe must scrub it too (I3/I4).
  'veyrnox-live-prices',
  'veyrnox-duress-configured',
  'veyrnox-panic-configured',
]);

// NON-SECRET wallet/token METADATA residue (F-06). Unlike the keys above, these do
// NOT betray the coercion-resistance stack — by their own modules' design they are
// independent of duress/stealth and only describe the PRIMARY vault (whose existence
// is already observable). But each NAMES wallets or tokens (so it is forensic residue
// tying the device to the destroyed wallet set), and WalletProvider.panicWipe ALREADY
// clears them via clearAllWalletMeta()/clearAllPortfolios() — one step AFTER
// panicWipeLocal() returns its report, so without these here inspectKeyMaterial().clean
// could read true while they still exist at report time. Listing them makes the panic
// PRIMITIVE erase + account for them itself (so the standalone report is honest, and
// the onboarding-rollback path discardIncompleteWallet clears them too). This is
// wipe-completeness ONLY: it touches no multi-wallet crypto or behaviour, so it does
// not cross the multi-wallet/portfolios audit gate. Kept as plain strings (no import of
// the UI/lib modules — wallet-core stays decoupled); source modules in comments:
//   veyrnox-wallet-meta       — lib/walletMeta.js META_KEY (wallet names/backup-flags/
//                               asset prefs → primary-vault wallet count + names)
//   veyrnox-active-wallet     — lib/walletMeta.js ACTIVE_KEY (active wallet id)
//   veyrnox-portfolios        — lib/portfolios.js PORTFOLIOS_KEY (portfolio names +
//                               wallet→portfolio map)
//   veyrnox-active-portfolio  — lib/portfolios.js ACTIVE_KEY (active portfolio id)
//   veyrnox-spam-overrides    — pages/SpamTokenFilter.jsx OVERRIDES_KEY (names the
//                               tokens the user un-hid from the spam filter)
const METADATA_RESIDUE_KEYS = Object.freeze([
  'veyrnox-wallet-meta',
  'veyrnox-active-wallet',
  'veyrnox-portfolios',
  'veyrnox-active-portfolio',
  'veyrnox-spam-overrides',
]);

// Every localStorage key a wipe must remove + the inspection must account for.
const ALL_RESIDUE_KEYS = Object.freeze([
  ...LOCAL_RESIDUE_KEYS,
  ...DENIABILITY_RESIDUE_KEYS,
  ...METADATA_RESIDUE_KEYS,
]);

// NEXT-OPEN WIPE MARKER (loud post-wipe acknowledgment; owner-approved 2026-06-22).
// After any local wipe we persist this presence-only marker so the NEXT app open can
// LOUDLY tell the user the device was wiped (and the in-session UI can too). This is a
// DELIBERATE next-open deniability tell: the panic-PIN AT-UNLOCK moment stays SILENT
// (it still shows the generic "Incorrect PIN" — no "wiped!" tell under coercion); only
// the next open is loud, so a user whose keys were destroyed is never left silently
// dropped onto the generic "Get Started" onboarding with no sign their funds-bearing
// keys are gone. The value is the literal '1' (presence == wiped) — we do NOT use
// Date.now()/new Date() (restricted in this module). CRITICAL: this key is written
// AFTER the residue clear and is DELIBERATELY NOT in ALL_RESIDUE_KEYS, so the wipe's
// own residue sweep cannot remove it and it survives a relaunch with no vault.
const WIPE_MARKER_KEY = 'veyrnox-wiped';

// Set the next-open wipe marker (presence-only '1'). Internal: called only at the end
// of panicWipeLocal, AFTER the residue sweep, so it survives the wipe.
function setWipeMarker() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(WIPE_MARKER_KEY, '1');
  } catch { /* storage may be unavailable; not key material */ }
}

/** True iff the next-open wipe marker is set (a prior wipe completed). */
export function readWipeMarker() {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(WIPE_MARKER_KEY) != null;
  } catch {
    return false;
  }
}

/** Clear the next-open wipe marker (the user acknowledged the wipe / moved on). */
export function clearWipeMarker() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(WIPE_MARKER_KEY);
  } catch { /* storage may be unavailable; not key material */ }
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
  // H2 (deniability uniformity): pad the marker plaintext to EXACTLY FIXED_LEN so the
  // panic blob's ciphertext length matches the duress ('secondary') blob and a real
  // panic matches a chaff panic (both go through this same path). AES-GCM is
  // length-preserving, so equalising the plaintext equalises the ciphertext. Detection
  // (tryPanicUnlock) only tests decryptability, so the padding is inert to it — but we
  // still strip on decrypt for cleanliness/forward-safety. The marker is not a
  // container, so it uses the string-level padToFixedLen helper (NOT the JSON `pad`
  // field); the container FORMAT is unchanged.
  const blob = await encryptVault(padToFixedLen(marker), panicPassword);
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
    const plaintext = await decryptVault(blob, password); // throws on wrong PIN
    // H2: strip the FIXED_LEN padding before any detection logic. Detection here is
    // purely "did GCM auth succeed" (an exact-match decrypt), so the marker is
    // recognisable after pad+strip; stripPad tolerates legacy unpadded markers
    // (returns them unchanged), so panic still fires for blobs written before H2.
    stripPad(plaintext);
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

// Known browser cookies a wipe must expire. The sidebar component persists a
// 7-day 'sidebar_state' cookie; it survives localStorage/IndexedDB wipes and is a
// forensic tell that the app was recently used. Guarded for Node/test environments.
const BROWSER_COOKIE_KEYS = Object.freeze(['sidebar_state']);

// PW-02: expire known browser cookies so they do not survive the wipe in the cookie
// store. Best-effort — cookies are not key material; setting max-age=0 removes them.
function clearBrowserCookies() {
  try {
    if (typeof document === 'undefined') return;
    for (const name of BROWSER_COOKIE_KEYS) {
      document.cookie = `${name}=; max-age=0; path=/`;
    }
  } catch { /* cookie store may be unavailable; not key material */ }
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

// Best-effort: delete the SEPARATE app-data database ('veyrnox-appdata', see
// src/api/localClient.js). It holds NO key material — only entity rows (wallets
// list, tx history, watchlists, approvals, address book, price alerts) — but each
// row NAMES addresses / tx hashes / wallet labels, so it is forensic residue tying
// the device to the destroyed wallet set (the IndexedDB analogue of the metadata
// tells in ALL_RESIDUE_KEYS). This is an ADDITIVE deletion of an unrelated DB: it
// touches no vault store, no vault crypto, and no key-custody primitive. Guarded
// best-effort exactly like deleteVaultDatabase() — resolves on success, error, OR
// blocked, so a lingering localClient connection (its module-level db handle) can
// pend the delete without hanging the wipe (it completes once that handle closes,
// e.g. on the post-wipe reload). F-06 residue sweep.
function deleteAppDataDatabase() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve(); } };
    let req;
    try {
      req = indexedDB.deleteDatabase(APPDATA_DB_NAME);
    } catch {
      finish();
      return;
    }
    req.onsuccess = finish;
    req.onerror = finish;   // no key material here; deletion is residue hygiene
    // PW-05: on blocked, another connection (localClient.js's module-level handle)
    // holds the DB open. Resolving straight away would claim success while rows are
    // still readable. Attempt to close the blocking connection first so the delete
    // can actually proceed, THEN finish (we still never hang the wipe).
    req.onblocked = () => {
      try { req.result?.close?.(); } catch { /* best-effort */ }
      finish();
    };
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
 *   2. best-effort delete the vault database;
 *   3. best-effort delete the SEPARATE app-data database (veyrnox-appdata) — no key
 *      material, but forensic residue (addresses, tx history, names, alerts);
 *   4. clear the DEMO-only address-residue maps + the deniability/metadata tells;
 *   5. return a post-wipe inspection report proving nothing recoverable remains.
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
  await deleteAppDataDatabase();
  clearLocalAddressResidue();
  clearBrowserCookies(); // PW-02: expire known browser cookies (sidebar_state)
  // Write the next-open wipe marker AFTER the residue sweep (clearLocalAddressResidue
  // only touches ALL_RESIDUE_KEYS, which deliberately excludes WIPE_MARKER_KEY) so it
  // survives the wipe and the next app open can LOUDLY acknowledge the destruction.
  // See WIPE_MARKER_KEY: the panic-PIN at-moment stays silent; only next-open is loud.
  setWipeMarker();
  return inspectKeyMaterial();
}
