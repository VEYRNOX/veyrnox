// I-3 residue-completeness for the three backup-nag markers (Slice G+H §1).
//
// Mirrors panic-residue-first-run-tour.test.js: the 2 localStorage keys
// (veyrnox-backup-state-v1, veyrnox-backup-nag-v1) belong in
// METADATA_RESIDUE_KEYS; veyrnox-backup-nag-session-skip belongs in
// SESSION_RESIDUE_KEYS. A key missing from either drives a false clean:true.

import { describe, it, expect, beforeEach } from 'vitest';
import { panicWipeLocal, inspectKeyMaterial, clearWipeMarker } from '../panic.js';
import { webKeyStore } from '../keystore/web.js';
import { generateMnemonic } from '../mnemonic.js';
import { clearVault } from '../evm/vaultStore.js';

const REAL_PW = 'backup-nag-residue-pw-1234';

const LOCAL_KEYS = [
  'veyrnox-backup-state-v1',
  'veyrnox-backup-nag-v1',
];
const SESSION_KEYS = [
  'veyrnox-backup-nag-session-skip',
];

describe('panic wipe — backup-nag residue (I-3)', () => {
  beforeEach(async () => {
    try { await clearVault(); } catch { /* noop */ }
    try { await panicWipeLocal(); } catch { /* noop */ }
    try { clearWipeMarker(); } catch { /* noop */ }
    for (const k of LOCAL_KEYS) localStorage.removeItem(k);
    for (const k of SESSION_KEYS) sessionStorage.removeItem(k);
  });

  it('inspectKeyMaterial refuses to call it clean while any backup-nag key survives', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    for (const k of LOCAL_KEYS) localStorage.setItem(k, '1');
    for (const k of SESSION_KEYS) sessionStorage.setItem(k, '1');

    const before = await inspectKeyMaterial();
    for (const k of LOCAL_KEYS) expect(before.localStorageResidue).toContain(k);
    for (const k of SESSION_KEYS) expect(before.sessionStorageResidue).toContain(k);
    expect(before.clean).toBe(false);
  });

  it('panicWipeLocal() clears all three backup-nag keys and then reports clean', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    for (const k of LOCAL_KEYS) localStorage.setItem(k, '1');
    for (const k of SESSION_KEYS) sessionStorage.setItem(k, '1');

    const report = await panicWipeLocal();

    for (const k of LOCAL_KEYS) {
      expect(localStorage.getItem(k)).toBeNull();
      expect(report.localStorageResidue).not.toContain(k);
    }
    for (const k of SESSION_KEYS) {
      expect(sessionStorage.getItem(k)).toBeNull();
      expect(report.sessionStorageResidue).not.toContain(k);
    }
    expect(report.clean).toBe(true);
    expect((await inspectKeyMaterial()).clean).toBe(true);
  });
});
