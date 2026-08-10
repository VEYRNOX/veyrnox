// wallet-core/__tests__/panic-residue-first-receive.test.js
//
// I-3 residue-completeness for the first-receive walkthrough marker
// (Slice C, plan docs/superpowers/plans/2026-08-09-first-receive-card-slice-c.md).
//
// The parent hook `useFirstReceiveShown` sets 'veyrnox-first-receive-shown-fired'
// exactly once per install after the card has been shown, so the walkthrough
// is not re-presented on subsequent unlocks. Same class of tell as the
// first-run-tour markers (see panic-residue-first-run-tour.test.js): its
// PRESENCE proves a real Veyrnox install existed on this device and completed
// the first-receive step. "Nothing reads them any more" is not an exemption
// — what makes a key a tell is its presence.
//
// ALL_RESIDUE_KEYS drives BOTH the erase (clearLocalAddressResidue) AND the
// inspection (inspectKeyMaterial().clean). A key missing from it survives a
// panic wipe AND is reported clean — the exact overstatement PR #1344 closed
// for the telemetry markers.
//
// This is a literal constant, not a runtime fingerprint, so it belongs in
// METADATA_RESIDUE_KEYS, not RESIDUE_KEY_PREFIXES.

import { describe, it, expect, beforeEach } from 'vitest';
import { panicWipeLocal, inspectKeyMaterial, clearWipeMarker } from '../panic.js';
import { webKeyStore } from '../keystore/web.js';
import { generateMnemonic } from '../mnemonic.js';
import { clearVault } from '../evm/vaultStore.js';

const REAL_PW = 'first-receive-residue-pw-1234';

const FIRST_RECEIVE_KEY = 'veyrnox-first-receive-shown-fired';

describe('panic wipe — first-receive residue (I-3)', () => {
  beforeEach(async () => {
    try { await clearVault(); } catch { /* noop */ }
    try { await panicWipeLocal(); } catch { /* noop */ }
    try { clearWipeMarker(); } catch { /* noop */ }
    localStorage.removeItem(FIRST_RECEIVE_KEY);
  });

  it('enumerates the first-receive marker pre-wipe and refuses to call it clean', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    localStorage.setItem(FIRST_RECEIVE_KEY, '1');

    const before = await inspectKeyMaterial();

    expect(before.localStorageResidue).toContain(FIRST_RECEIVE_KEY);
    expect(before.clean).toBe(false);
  });

  it('panicWipeLocal() clears it and only then reports clean', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    localStorage.setItem(FIRST_RECEIVE_KEY, '1');

    const report = await panicWipeLocal();

    expect(localStorage.getItem(FIRST_RECEIVE_KEY)).toBeNull();
    expect(report.localStorageResidue).not.toContain(FIRST_RECEIVE_KEY);
    expect(report.clean).toBe(true);
    expect((await inspectKeyMaterial()).clean).toBe(true);
  });

  it('never reports clean while the first-receive marker survives', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    await panicWipeLocal();
    clearWipeMarker();

    localStorage.setItem(FIRST_RECEIVE_KEY, '1');

    const after = await inspectKeyMaterial();
    expect(after.localStorageResidue).toContain(FIRST_RECEIVE_KEY);
    expect(after.clean).toBe(false);
  });
});
