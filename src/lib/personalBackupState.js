// lib/personalBackupState.js — Personal Backup Phase 5.
//
// Persists the READ-SIDE evidence the SecurityPosture card needs to score the
// Recovery dimension for the shard flow (spec §9.0.1a Recovery: 30 points).
// Before this module, the recovery-dimension inputs (shareCExported,
// recoveryPassphraseSet, ...) defaulted to false in SecurityPosture, so a
// user who had completed Phases 1-3 still saw 0/30 on Recovery — the whole
// point of the posture card was invisible for the shard cohort.
//
// **Scope note (deliberate).** This ONLY records that a share export completed
// on this device — an on-device claim, not a cross-device recovery guarantee.
// The Phase 2 restore path is what actually proves the shares work; this is a
// UI-only signal for the posture score. "Verified" per spec §9 (shareCVerified
// = 6 pts) is a separate honest gate that requires a real recovery round-trip
// and is NOT flipped here — the export doesn't prove recoverability, and
// silently claiming it would violate I4.
//
// **I3 chokepoints (BOTH writes AND reads gated).** Writes: gated at
// `safeWrite` — a coerced decoy session cannot flip the real user's stored
// export flag (K-2 pattern from lib/consent.js). Reads: ALSO gated at
// `readPersonalBackupState` — unlike consent, these values feed a VISIBLE
// posture score (SecurityPosture Recovery dimension). If reads were ungated,
// a decoy examiner comparing the posture card between sessions could infer
// primary-wallet activity from a Recovery-score delta (Codex P1, 2026-08-09).
// Both gate ONLY in decoy/demo — a real primary session on a shared device
// still sees its own state. This diverges from the lib/consent.js precedent
// (which allows ungated reads) because consent state is not rendered as a
// side-by-side scored comparison; the recovery score is.
//
// **Panic-wipe residue.** All keys below MUST be added to `wallet-core/panic
// .js METADATA_RESIDUE_KEYS`. Their PRESENCE proves a Veyrnox install ran
// through the Personal Backup flow on this device — same class as
// `veyrnox-first-run-tour-seen` and `veyrnox-device-id`. Panic wipe removes
// them; `inspectKeyMaterial().clean` counts on the list too.

import { isDeniabilityOrDemoActive } from '../wallet-core/deniabilitySession';

/**
 * Set once Phase 1 export completes (all 3 shares successfully saved). Presence
 * proves a real export ran on this device.
 * Value: JSON `{ at: number (ms), version: 1 }`. `version` reserved for future
 * schema changes; readers reject unknown versions and treat as absent.
 */
export const PERSONAL_BACKUP_EXPORTED_KEY = 'veyrnox-personal-backup-exported';

/**
 * Set when the user has stored a recovery passphrase-encrypted envelope (Phase 3
 * "encrypt one share" path). Not a passphrase-CACHE — just the boolean fact
 * "user has adopted a recovery passphrase for their cloud share." Feeds the
 * spec §9 `recoveryPassphraseSet` field (8 pts).
 */
export const PERSONAL_BACKUP_PASSPHRASE_KEY = 'veyrnox-personal-backup-passphrase-set';

const SCHEMA_VERSION = 1;

function safeParse(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== SCHEMA_VERSION) return null;
    if (!Number.isFinite(parsed.at) || parsed.at <= 0 || parsed.at > Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeWrite(key, obj) {
  // Two-writer discipline (CLAUDE.md standing rule) — gate at THIS single
  // chokepoint, not at each call site. Any writer that opts around this
  // helper reopens K-2 regressions.
  if (isDeniabilityOrDemoActive()) return;
  try {
    localStorage.setItem(key, JSON.stringify(obj));
  } catch {
    /* quota exceeded etc — non-fatal, UI still works, score just reads 0 */
  }
}

/**
 * Called by RecoveryShareTab after all 3 shares save successfully. Idempotent:
 * repeated calls update `at` but never clear the flag.
 * @param {{ withPassphrase: boolean }} opts
 */
export function markPersonalBackupExported({ withPassphrase }) {
  const now = Date.now();
  safeWrite(PERSONAL_BACKUP_EXPORTED_KEY, { at: now, version: SCHEMA_VERSION });
  if (withPassphrase) {
    safeWrite(PERSONAL_BACKUP_PASSPHRASE_KEY, { at: now, version: SCHEMA_VERSION });
  }
}

/**
 * Read-side facade for SecurityPosture. GATED in decoy/demo — see the module
 * header for why this diverges from lib/consent.js. Returns a conservative
 * `{ exported:false, passphrase:false }` in deniability sessions so a decoy
 * always renders Recovery = 0/30 regardless of the primary's real state.
 * This is the ONE place the read-gate lives; do not scatter the check to
 * consumers.
 * @returns {{ exported: boolean, passphrase: boolean }}
 */
export function readPersonalBackupState() {
  if (isDeniabilityOrDemoActive()) return { exported: false, passphrase: false };
  try {
    const rawExp = localStorage.getItem(PERSONAL_BACKUP_EXPORTED_KEY);
    const rawPass = localStorage.getItem(PERSONAL_BACKUP_PASSPHRASE_KEY);
    return {
      exported: rawExp ? safeParse(rawExp) !== null : false,
      passphrase: rawPass ? safeParse(rawPass) !== null : false,
    };
  } catch {
    return { exported: false, passphrase: false };
  }
}

/**
 * Every key this module writes. Panic wipe must remove all of them. Kept as
 * an exported constant so `wallet-core/panic.js` can import instead of
 * duplicating strings.
 */
export const PERSONAL_BACKUP_RESIDUE_KEYS = Object.freeze([
  PERSONAL_BACKUP_EXPORTED_KEY,
  PERSONAL_BACKUP_PASSPHRASE_KEY,
]);
