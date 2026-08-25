// wallet-core/keystore/kdfMigrationGuard.js
//
// Personal Backup guard for the KDF profile v1 → v2 silent-migration flag
// flip (owner-ruled 2026-08-25). See vault.js head comment on
// KDF_PROFILE_V2_MIGRATION_ENABLED for the ruling and coupling.
//
// The migration in keystore/native.js `_unlockInner` re-encrypts a v1 blob
// under the current v2 profile on a successful slow-path unlock. The rekey
// rotates the Argon2id-derived key material; any 2-of-3 Shamir shares the
// user has already exported via Personal Backup (lib/personalBackupState.js)
// are invalidated by the write. Silent invalidation is silent user-data
// loss, so this helper decides at the last synchronous moment whether the
// rekey may proceed.
//
// Design:
//   - Synchronous localStorage read — no biometric prompt, no async plugin
//     call, safe on the hot unlock path.
//   - FAIL-CLOSED: if the check throws for any reason (Safari private-mode
//     throwing on getItem, storage disabled, etc), DEFER the migration.
//     Unknown share state must never rekey behind the user's back.
//   - NOT I3-gated. Unlike lib/personalBackupState.readPersonalBackupState,
//     which returns { exported:false } in decoy/demo so a decoy examiner
//     cannot infer primary-wallet activity from a Recovery-score delta, this
//     helper is driving a REAL VAULT MUTATION. A decoy session running with
//     I3-blinded shares state would consult a false negative and rekey the
//     wrong vault. The read is direct so the mutation decision is honest.
//     The MARKER write (WARNING_KEY) fires only when we're already deferring
//     — never in a decoy path that legitimately rekeys nothing.

/** localStorage key set by keystore/native.js Personal Backup shard-export
 * flow (lib/personalBackupState.js PERSONAL_BACKUP_EXPORTED_KEY). Presence
 * means the user has exported shares that the KDF-profile rekey would
 * invalidate. */
export const PERSONAL_BACKUP_EXPORTED_KEY = 'veyrnox-personal-backup-exported';

/** Marker key read by components/onboarding/KdfMigrationSharesNudge.jsx to
 * decide whether to render the "regenerate your shares" card. Written by
 * `deferKdfMigrationForShares` when the migration is skipped. Panic-wipe
 * sweeps this key (see wallet-core/panic.js METADATA_RESIDUE_KEYS). */
export const NUDGE_PENDING_KEY = 'veyrnox-kdf-migration-pending-shares-warning';

/** Marker key written by the nudge card when the user taps "Not now" — the
 * card stays dismissed until a panic-wipe clears the marker. Also swept by
 * METADATA_RESIDUE_KEYS. */
export const NUDGE_DISMISSED_KEY = 'veyrnox-kdf-nudge-dismissed';

/**
 * Fail-closed check. Returns `true` when the KDF-profile rekey MUST be
 * deferred — either the user has active shares, or the localStorage read
 * threw and we cannot tell. Returns `false` only when we have positively
 * confirmed no shares exist.
 * @returns {boolean}
 */
export function shouldDeferKdfMigrationForShares() {
  try {
    return localStorage.getItem(PERSONAL_BACKUP_EXPORTED_KEY) !== null;
  } catch {
    return true; // unknown → DEFER (I4 fail-closed)
  }
}

/**
 * Write the marker the nudge card reads. Best-effort — a quota/storage
 * failure at the write is non-fatal (the migration is still deferred, the
 * nudge just won't fire on this device). Idempotent.
 */
export function markKdfMigrationPendingSharesWarning() {
  try {
    localStorage.setItem(NUDGE_PENDING_KEY, '1');
  } catch { /* non-fatal */ }
}
