// lib/restoreBackupFile.js
//
// R2 FACADE for the encrypted-backup restore primitives.
//
// UI components (src/components/*) cannot import R0/R1 crypto-core directly —
// enforced by eslint/rules/ring-import-lint (an XSS payload one hop from the keys is
// the threat). The shared RestoreFromFile component lives in src/components, so it
// reaches the vault-backup restore functions + the lock suppressor through this thin
// src/lib facade — the same ring-boundary pattern useKekEnrollmentGate uses for the
// keystore.
//
// This file holds NO logic and NO key material: it is pure re-exports so the crypto
// and file-format handling stay in wallet-core/vaultBackup (the audited path) and are
// never reimplemented at the UI layer.

export {
  parseBackupFile,
  decryptPasswordSeal,
  decryptPinSeal,
  finalisePinRestore,
} from '@/wallet-core/vaultBackup';

// withLockSuppressed wraps the Android system document-picker call so the picker
// Activity's pause event does not auto-lock the wallet mid-restore.
export { withLockSuppressed } from '@/wallet-core/keystore';
