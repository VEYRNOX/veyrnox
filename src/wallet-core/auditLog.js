// wallet-core/auditLog.js
//
// LOCAL AUDIT LOG  (S4 — opt-in, deniability-safe activity record).  PROVISIONAL.
//
// GOAL — give a user who WANTS one a private, local-only record of a few benign
// wallet actions (a settings change, a completed send, an approval grant/revoke),
// so they can review "what did I do, and when?" after the fact. It is strictly
// OPT-IN and OFF by default: a user who never turns it on leaves ZERO audit
// artifact behind — which is itself a deniability property (see below).
//
// ───────────────────────────────────────────────────────────────────────────
// WHY THIS MODULE IS SHAPED THE WAY IT IS  (deniability is the hard constraint)
// ───────────────────────────────────────────────────────────────────────────
// This wallet's whole threat model is built around DENIABILITY — duress decoys,
// stealth/hidden wallets, panic wipe. A naive "activity log" is a direct threat
// to all of that: a plaintext log, or a log stored under a tell-tale key, or a
// log that records "revealed hidden wallet" / "entered duress" would HAND a
// coercer exactly the evidence the rest of the app works to deny. So this module
// is constrained on three axes:
//
//   1. NO PLAINTEXT, NO TELL-TALE ARTIFACT. Entries are serialised to JSON and
//      stored as a SINGLE AES-GCM blob via vault.js's encryptVault — byte-shaped
//      identically to every other vault blob ({ v, kdf, salt, iv, ct }, same
//      Argon2id params). It lives in the SAME 'veyrnox-vault'/'vault' IndexedDB
//      store as the primary vault, the duress decoy, the stealth pool, and the
//      panic marker, under the neutral key 'quaternary' (continuing the
//      primary/secondary/tertiary sequence in panic.js). A forensic dump sees one
//      more vault-shaped blob, not a key named "audit". Because it is one of the
//      vault blobs, PANIC WIPE destroys it for free (clear() of the whole store).
//
//   2. OFF BY DEFAULT, ABSENCE = OFF. The enable switch is a single localStorage
//      pref ('veyrnox-audit-log') mirroring lib/biometric.js / lib/session.js:
//      stored as "1" (on) / absent (off). When OFF, record() is a strict no-op
//      that writes NOTHING — a non-user has no 'quaternary' blob at all.
//
//   3. HARD DENYLIST IN CODE — the most important property. record() refuses, in
//      code, to log anything relating to duress, stealth/hidden wallets, panic,
//      decoy, or seed identity, AND it only accepts a fixed allowlist of benign
//      event TYPES. Each entry is { type, ts } — a timestamp and an allowlisted
//      type, NOTHING ELSE: no amounts, recipients, addresses, or which
//      wallet/seed. This does not rely on callers being careful: a future
//      careless caller that tries to log a deniability-sensitive event is refused
//      by this function, silently. The denylist is enforced even against the
//      allowlist, so a later edit that adds a sensitive term to the allowlist
//      still cannot get it past the deny check.
//
// SCOPE: like duress.js / stealth.js / panic.js, this re-opens the shared
// IndexedDB by NAME (plain storage plumbing) and reuses encryptVault/decryptVault
// VERBATIM. It does NOT import or modify the vault crypto internals
// (vault.js / vaultStore.js) — and it is NOT yet wired into any call site; this
// PR delivers the primitive + tests only.

import { encryptVault, decryptVault } from './vault.js';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

// Same database + store as the primary vault (evm/vaultStore.js), the duress
// decoy ('secondary'), the stealth pool ('vault:N'), and the panic marker
// ('tertiary'). The audit blob sits in the SAME store under a neutral key so the
// artifact does not announce itself, and so panic.js's clear()-the-whole-store
// wipe destroys it along with everything else.
const DB_NAME = 'veyrnox-vault';
const STORE = 'vault';
// Neutral, non-incriminating key (continues 'primary'/'secondary'/'tertiary'); a
// forensic dump sees one more vault-shaped blob, not a key literally named
// "audit". The blob is byte-shaped like every other vault blob, so it does not
// stand out.
const AUDIT_KEY = 'quaternary';

// localStorage enable pref. Mirrors lib/biometric.js (BIOMETRIC_PREF_KEY) and
// lib/session.js conventions: stored as "1" (on) / ABSENT (off). Absence = OFF is
// deliberate — a fresh device, and any user who never opts in, leaves no trace.
export const AUDIT_LOG_PREF_KEY = 'veyrnox-audit-log';

// HKDF domain-separation label for the audit-log key. Bumping this rotates the
// key (and orphans any prior blob) — there is none in the wild (feature never
// shipped enabled/surfaced), so v1 is the first and only version.
const AUDIT_HKDF_INFO = 'veyrnox-audit-v1';

/**
 * Derive the audit-log encryption secret from the primary mnemonic.
 * HKDF-SHA256 gives domain separation (this key cannot collide with any other
 * use of the raw seed) and a high-entropy input; the raw mnemonic never crosses
 * the auditLog read/write API. Returns 32 bytes as a hex string, fed to
 * encryptVault/decryptVault exactly where the password used to go.
 * @param {string} primaryMnemonic the unlocked primary set's first-wallet seed
 * @returns {string} 64-char hex secret
 */
export function deriveAuditSecret(primaryMnemonic) {
  if (typeof primaryMnemonic !== 'string' || primaryMnemonic.length === 0) {
    throw new Error('deriveAuditSecret requires a non-empty mnemonic');
  }
  const ikm = utf8ToBytes(primaryMnemonic);
  return bytesToHex(hkdf(sha256, ikm, undefined /* salt */, AUDIT_HKDF_INFO, 32));
}

/**
 * The single gate that decides whether — and under what key — an audit event may
 * be recorded this session. Returns null (record NOTHING) in a decoy/hidden
 * session (the D1–D7 multi-set storage shape is audit-gated, so logging runs in
 * the primary session ONLY) or when no mnemonic is resident. Otherwise returns
 * the derived secret. Pure + side-effect-free so it is unit-testable without a
 * React render harness.
 * @param {{isDecoy:boolean, isHidden:boolean, primaryMnemonic:string|null|undefined}} session
 * @returns {string|null}
 */
export function auditSecretForSession({ isDecoy, isHidden, primaryMnemonic }) {
  if (isDecoy || isHidden) return null;
  if (typeof primaryMnemonic !== 'string' || primaryMnemonic.length === 0) return null;
  return deriveAuditSecret(primaryMnemonic);
}

// Ring-buffer cap. Oldest entries are dropped once the log exceeds this — the log
// is a recent-activity aid, not an unbounded history, and a bounded log keeps the
// single blob small.
const MAX_ENTRIES = 100;

// STRICT ALLOWLIST of loggable event types. ONLY these may ever be recorded; any
// other type is silently ignored. Every entry that lands is { type, ts } — the
// type drawn from this list and nothing else. These are deliberately benign,
// non-deniability-sensitive actions.
export const ALLOWED_EVENT_TYPES = Object.freeze([
  'settings_changed',
  'approval_revoked',
  'send_completed',
]);
// 'approval_granted' is deliberately ABSENT. The app never grants ERC-20
// allowances — approve(spender, amount) is HONEST-DISABLED across wallet-core
// (evm/approvals.js only revokes-to-zero; evm/token-send.js withholds approve;
// notify/events.js exposes no approval emitter). The audit log declares no event
// it cannot honestly produce. If an audited grant flow is ever added, add it back
// here as part of that change.

// HARD DENYLIST (defence in depth, enforced IN CODE). Any event type containing
// one of these substrings is REFUSED even if some future edit mistakenly adds it
// to the allowlist. This is the property the deniability claim rests on: it must
// be impossible for a careless caller — or a careless future maintainer — to log
// an event that names or implies duress, a stealth/hidden wallet, panic, a decoy,
// or seed identity. Matched case-insensitively as substrings so e.g.
// 'hidden_wallet_revealed', 'duress_unlock', 'panic_armed', 'decoy_opened',
// 'seed_exported' are all caught.
const DENY_TERMS = Object.freeze([
  'duress',
  'stealth',
  'hidden',
  'panic',
  'decoy',
  'seed',
  'mnemonic',
]);

// ---- IndexedDB plumbing (mirrors panic.js openDb/store/getKey verbatim) ----

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

function putKey(db, key, value) {
  return new Promise((res, rej) => {
    const r = store(db, 'readwrite').put(value, key);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

// ---- Enable switch (opt-in, OFF by default) ----

/** @returns {boolean} whether the user has opted into the local audit log. */
export function isAuditLogEnabled() {
  try {
    return localStorage.getItem(AUDIT_LOG_PREF_KEY) === '1';
  } catch {
    // storage unavailable — treat as OFF (fail closed: no log).
    return false;
  }
}

/** Persist the opt-in preference. OFF is stored as ABSENCE of the key. */
export function setAuditLogEnabled(on) {
  try {
    if (on) localStorage.setItem(AUDIT_LOG_PREF_KEY, '1');
    else localStorage.removeItem(AUDIT_LOG_PREF_KEY);
  } catch {
    /* storage unavailable — preference is best-effort, non-fatal. */
  }
}

// ---- Event-type gate (allowlist + hard denylist) ----

/**
 * Whether a type names/implies a deniability-sensitive concept and must be
 * refused regardless of the allowlist. Case-insensitive substring match.
 */
function isDeniedType(type) {
  if (typeof type !== 'string') return true; // non-strings are not loggable
  const t = type.toLowerCase();
  return DENY_TERMS.some((term) => t.includes(term));
}

/**
 * The single gate every event passes through. An event is loggable ONLY if it is
 * a non-denylisted string that is also in the strict allowlist. The deny check
 * runs FIRST and independently, so it still bites even if a sensitive term is
 * ever (mistakenly) added to ALLOWED_EVENT_TYPES.
 * @returns {boolean}
 */
function isLoggableType(type) {
  if (isDeniedType(type)) return false;
  return ALLOWED_EVENT_TYPES.includes(type);
}

// ---- Read / write the encrypted log blob ----

// Decrypt the stored blob (if any) back to the entries array. A missing blob is
// an empty log. A blob that fails to parse is treated as empty rather than
// throwing — we never want a corrupt log to break a recording write — but a
// genuine wrong-secret decrypt error from decryptVault is allowed to propagate
// (the caller is in an unlocked session and holds the real audit secret).
async function readEntries(db, auditSecret) {
  const blob = await getKey(db, AUDIT_KEY);
  if (!blob) return [];
  const json = await decryptVault(blob, auditSecret); // throws on wrong secret
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Record an audit event. NO-OP unless the user has opted in. Accepts ONLY an
 * allowlisted, non-denylisted event type; anything else is SILENTLY IGNORED (no
 * throw) — a careless caller cannot make this log a deniability-sensitive event.
 * On success appends { type, ts } and re-encrypts the whole log as a single
 * vault-shaped blob, ring-buffered to the most recent MAX_ENTRIES.
 *
 * Requires the HKDF-derived audit secret (the caller derives it during an unlocked
 * session via deriveAuditSecret / auditSecretForSession); nothing is ever persisted
 * in plaintext.
 *
 * @param {string} type        one of ALLOWED_EVENT_TYPES
 * @param {string} auditSecret the HKDF-derived audit key (see deriveAuditSecret)
 * @returns {Promise<void>}
 */
export async function recordAuditEvent(type, auditSecret) {
  // OFF by default: write NOTHING. A non-user leaves zero audit artifact.
  if (!isAuditLogEnabled()) return;
  // Allowlist + hard denylist. A rejected event is silently dropped, never thrown
  // and never written — including every duress/stealth/hidden/panic/decoy/seed
  // event, even if such a type were mistakenly allowlisted.
  if (!isLoggableType(type)) return;
  if (typeof auditSecret !== 'string' || auditSecret.length === 0) return;

  const db = await openDb();
  try {
    const entries = await readEntries(db, auditSecret);
    // { type, ts } ONLY — no amounts, recipients, addresses, or which-wallet/seed.
    entries.push({ type, ts: Date.now() });
    // Ring buffer: keep only the most recent MAX_ENTRIES, oldest dropped.
    const trimmed = entries.slice(-MAX_ENTRIES);
    const blob = await encryptVault(JSON.stringify(trimmed), auditSecret);
    // Mirror vaultStore/panic's guard: refuse anything that is not an encrypted
    // blob (so a future change to encryptVault cannot silently store plaintext).
    if (typeof blob !== 'object' || !blob.ct || !blob.iv || !blob.salt) {
      throw new Error('Refusing to store: not a valid encrypted vault blob');
    }
    await putKey(db, AUDIT_KEY, blob);
  } finally {
    db.close();
  }
}

/**
 * Decrypt and return the audit log entries (oldest-first). Returns [] when the
 * log is empty or has never been written. Only works while unlocked — it needs
 * the audit secret to decrypt; a wrong secret makes decryptVault throw (same
 * behaviour as every other vault read).
 *
 * @param {string} auditSecret the HKDF-derived audit key (see deriveAuditSecret)
 * @returns {Promise<Array<{ type: string, ts: number }>>}
 */
export async function readAuditLog(auditSecret) {
  const db = await openDb();
  try {
    return await readEntries(db, auditSecret);
  } finally {
    db.close();
  }
}

/**
 * Delete the audit log blob WITHOUT touching anything else in the store — the
 * exact dual of panic.js's clearPanicVault (a per-key delete, not a wipe). Used
 * when the user opts out, or to clear history.
 * @returns {Promise<void>}
 */
export async function clearAuditLog() {
  const db = await openDb();
  try {
    await new Promise((res, rej) => {
      const r = store(db, 'readwrite').delete(AUDIT_KEY);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  } finally {
    db.close();
  }
}
