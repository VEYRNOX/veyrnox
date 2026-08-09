// wallet-core/__tests__/panic-residue-personal-backup.test.js
//
// I-3 residue-completeness for the two Personal Backup Phase 5 posture-input
// markers.
//
// src/lib/personalBackupState.js writes:
//   'veyrnox-personal-backup-exported'        — set after all 3 shares saved
//   'veyrnox-personal-backup-passphrase-set'  — set when Phase 3 "encrypt one"
//                                                path was used
//
// Both are TELLS. Their PRESENCE proves this device ran through the shard
// export flow at least once (Phase 1) and, for the second key, adopted the
// passphrase-encrypted cloud share (Phase 3). Same class as
// 'veyrnox-first-run-tour-seen' and 'veyrnox-device-id' — swept for the same
// reason. If a wipe leaves them behind, `inspectKeyMaterial().clean` would
// fabricate the "nothing recoverable remains" verdict for a device that still
// discloses "this user completed shard export".
//
// A third marker added to personalBackupState.js needs adding here AND to
// wallet-core/panic.js METADATA_RESIDUE_KEYS.

import { describe, it, expect, beforeEach } from 'vitest';
import { panicWipeLocal, inspectKeyMaterial, clearWipeMarker } from '../panic.js';
import { webKeyStore } from '../keystore/web.js';
import { generateMnemonic } from '../mnemonic.js';
import { clearVault } from '../evm/vaultStore.js';

const REAL_PW = 'personal-backup-residue-pw-1234';

const PERSONAL_BACKUP_KEYS = [
  'veyrnox-personal-backup-exported',
  'veyrnox-personal-backup-passphrase-set',
];

describe('panic wipe — Personal Backup Phase 5 residue (I-3)', () => {
  beforeEach(async () => {
    try { await clearVault(); } catch { /* noop */ }
    try { await panicWipeLocal(); } catch { /* noop */ }
    try { clearWipeMarker(); } catch { /* noop */ }
    for (const k of PERSONAL_BACKUP_KEYS) localStorage.removeItem(k);
  });

  it('enumerates both markers pre-wipe and refuses to call it clean', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    for (const k of PERSONAL_BACKUP_KEYS) localStorage.setItem(k, '{"at":1,"version":1}');

    const before = await inspectKeyMaterial();

    for (const k of PERSONAL_BACKUP_KEYS) expect(before.localStorageResidue).toContain(k);
    expect(before.clean).toBe(false);
  });

  it('panicWipeLocal() clears them and only then reports clean', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    for (const k of PERSONAL_BACKUP_KEYS) localStorage.setItem(k, '{"at":1,"version":1}');

    const report = await panicWipeLocal();

    for (const k of PERSONAL_BACKUP_KEYS) {
      expect(localStorage.getItem(k)).toBeNull();
      expect(report.localStorageResidue).not.toContain(k);
    }
    expect(report.clean).toBe(true);
    expect((await inspectKeyMaterial()).clean).toBe(true);
  });

  it.each(PERSONAL_BACKUP_KEYS)('never reports clean while %s survives', async (key) => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    await panicWipeLocal();
    clearWipeMarker();

    localStorage.setItem(key, '{"at":1,"version":1}');

    const after = await inspectKeyMaterial();
    expect(after.localStorageResidue).toContain(key);
    expect(after.clean).toBe(false);
  });
});
