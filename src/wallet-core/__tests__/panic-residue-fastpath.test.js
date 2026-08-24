// wallet-core/__tests__/panic-residue-fastpath.test.js
//
// Issue #2019 — I3 residue-completeness for the fast-path opt-in toggle.
//
// The Settings toggle "Fast unlock — uses Face ID/fingerprint without PIN" is
// stored under `veyrnox-fastpath-enabled` in localStorage (see
// lib/fastpathUnlock.js). Presence of this key AFTER a panic wipe proves a
// real Veyrnox install existed on this device AND had the fast-path enabled
// — exactly the tell class as `veyrnox-first-run-tour-seen` /
// `veyrnox-device-id`, and swept for the same reason:
// ALL_RESIDUE_KEYS in panic.js drives both the erase AND inspectKeyMaterial().clean,
// so a missing entry means the wipe leaves it AND still reports clean.
//
// Structural mirror of panic-residue-first-run-tour.test.js — see its comment
// for the "presence is the tell" discipline.

import { describe, it, expect, beforeEach } from 'vitest';
import { panicWipeLocal, inspectKeyMaterial, clearWipeMarker } from '../panic.js';
import { webKeyStore } from '../keystore/web.js';
import { generateMnemonic } from '../mnemonic.js';
import { clearVault } from '../evm/vaultStore.js';

const REAL_PW = 'fastpath-residue-pw-1234';
const FASTPATH_KEY = 'veyrnox-fastpath-enabled';
const DISCLOSURE_KEY = 'veyrnox-fastpath-disclosure-seen';

describe('panic wipe — fast-path opt-in residue (I-3)', () => {
  beforeEach(async () => {
    try { await clearVault(); } catch { /* noop */ }
    try { await panicWipeLocal(); } catch { /* noop */ }
    try { clearWipeMarker(); } catch { /* noop */ }
    localStorage.removeItem(FASTPATH_KEY);
    localStorage.removeItem(DISCLOSURE_KEY);
  });

  it('enumerates both fast-path markers pre-wipe and refuses to call them clean', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    localStorage.setItem(FASTPATH_KEY, '1');
    localStorage.setItem(DISCLOSURE_KEY, '1');

    const before = await inspectKeyMaterial();
    expect(before.localStorageResidue).toContain(FASTPATH_KEY);
    expect(before.localStorageResidue).toContain(DISCLOSURE_KEY);
    expect(before.clean).toBe(false);
  });

  it('panicWipeLocal() clears both markers and only then reports clean', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    localStorage.setItem(FASTPATH_KEY, '1');
    localStorage.setItem(DISCLOSURE_KEY, '1');

    const report = await panicWipeLocal();

    expect(localStorage.getItem(FASTPATH_KEY)).toBeNull();
    expect(localStorage.getItem(DISCLOSURE_KEY)).toBeNull();
    expect(report.localStorageResidue).not.toContain(FASTPATH_KEY);
    expect(report.localStorageResidue).not.toContain(DISCLOSURE_KEY);
    expect(report.clean).toBe(true);
    expect((await inspectKeyMaterial()).clean).toBe(true);
  });

  it('never reports clean while the fast-path toggle marker survives', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    await panicWipeLocal();
    clearWipeMarker();

    localStorage.setItem(FASTPATH_KEY, '1');

    const after = await inspectKeyMaterial();
    expect(after.localStorageResidue).toContain(FASTPATH_KEY);
    expect(after.clean).toBe(false);
  });

  it('never reports clean while the disclosure marker alone survives', async () => {
    // Tripwire: a future edit that removes DISCLOSURE_KEY from
    // METADATA_RESIDUE_KEYS ships green today because only FASTPATH_KEY was
    // being exercised. Panic wipe MUST NOT leave the disclosure marker as a
    // tell of a real install having seen the Security screen.
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    await panicWipeLocal();
    clearWipeMarker();

    localStorage.setItem(DISCLOSURE_KEY, '1');

    const after = await inspectKeyMaterial();
    expect(after.localStorageResidue).toContain(DISCLOSURE_KEY);
    expect(after.clean).toBe(false);
  });
});
