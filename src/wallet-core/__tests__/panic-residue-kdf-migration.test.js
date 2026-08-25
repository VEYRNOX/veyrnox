// wallet-core/__tests__/panic-residue-kdf-migration.test.js
//
// I-3 residue-completeness for the two KDF v1→v2 migration nudge markers
// introduced with the owner-ruled flag flip 2026-08-25.
//
// keystore/kdfMigrationGuard.js + components/onboarding/KdfMigrationSharesNudge.jsx
// write:
//   'veyrnox-kdf-migration-pending-shares-warning' — set when a v1 blob was
//                                                    about to rekey but the
//                                                    user had active Personal
//                                                    Backup shares
//   'veyrnox-kdf-nudge-dismissed'                  — set when the user taps
//                                                    "Not now" on the nudge
//
// Both are TELLS with the same class as 'veyrnox-personal-backup-exported'
// and 'veyrnox-first-run-tour-seen': their PRESENCE proves a real Veyrnox
// install existed here. Panic wipe must clear them so
// `inspectKeyMaterial().clean` cannot lie.

import { describe, it, expect, beforeEach } from 'vitest';
import { panicWipeLocal, inspectKeyMaterial, clearWipeMarker } from '../panic.js';
import { webKeyStore } from '../keystore/web.js';
import { generateMnemonic } from '../mnemonic.js';
import { clearVault } from '../evm/vaultStore.js';

const REAL_PW = 'kdf-migration-residue-pw-1234';

const KDF_MIGRATION_KEYS = [
  'veyrnox-kdf-migration-pending-shares-warning',
  'veyrnox-kdf-nudge-dismissed',
];

describe('panic wipe — KDF migration nudge residue (I-3)', () => {
  beforeEach(async () => {
    try { await clearVault(); } catch { /* noop */ }
    try { await panicWipeLocal(); } catch { /* noop */ }
    try { clearWipeMarker(); } catch { /* noop */ }
    for (const k of KDF_MIGRATION_KEYS) localStorage.removeItem(k);
  });

  it('enumerates both markers pre-wipe and refuses to call it clean', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    for (const k of KDF_MIGRATION_KEYS) localStorage.setItem(k, '1');

    const before = await inspectKeyMaterial();

    for (const k of KDF_MIGRATION_KEYS) expect(before.localStorageResidue).toContain(k);
    expect(before.clean).toBe(false);
  });

  it('panicWipeLocal() clears them and only then reports clean', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    for (const k of KDF_MIGRATION_KEYS) localStorage.setItem(k, '1');

    const report = await panicWipeLocal();

    for (const k of KDF_MIGRATION_KEYS) {
      expect(localStorage.getItem(k)).toBeNull();
      expect(report.localStorageResidue).not.toContain(k);
    }
    expect(report.clean).toBe(true);
    expect((await inspectKeyMaterial()).clean).toBe(true);
  });

  it.each(KDF_MIGRATION_KEYS)('never reports clean while %s survives', async (key) => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    await panicWipeLocal();
    clearWipeMarker();

    localStorage.setItem(key, '1');

    const after = await inspectKeyMaterial();
    expect(after.localStorageResidue).toContain(key);
    expect(after.clean).toBe(false);
  });
});
