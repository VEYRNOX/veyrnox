// wallet-core/__tests__/panic-residue-first-run-tour.test.js
//
// I-3 residue-completeness for the two first-run-tour markers.
//
// src/components/FirstRunTour.jsx writes TOUR_ARMED_KEY via armTour() and
// consumes it into TOUR_SEEN_KEY when the walkthrough finishes. The tour shipped
// in PR #1174 (aca998a2, 2026-07-18), so devices have carried these keys since.
//
// HISTORY — this file was written while the component did not exist. PR #1403
// (de8cb829) deleted FirstRunTour on 2026-07-27; the 2026-07-28 security diff
// found the keys still surviving a panic wipe (PR #1415, this test); PR #1417
// restored the component ~50 min after that fix merged. An earlier version of
// this header therefore called the keys ORPHANED and argued they "cannot grow a
// third variant — the writer is gone". Both are now false and are corrected.
//
// None of it changes what this test pins. The finding was "these keys are a tell
// and the wipe misses them", which held whether or not a writer existed.
//
// Why they belong here rather than being written off as harmless: ALL_RESIDUE_KEYS
// is an explicit allowlist that drives BOTH the erase (clearLocalAddressResidue)
// AND the inspection (readLocalAddressResidue -> inspectKeyMaterial().clean). A key
// missing from it survives a panic wipe AND is reported clean — the exact
// overstatement PR #1344 was written to close for the telemetry markers, whose
// comment in panic.js says it plainly: "Without these, inspectKeyMaterial()
// reported clean:true while they sat in storage, so the post-wipe 'nothing
// recoverable remains' claim was overstated."
//
// 'veyrnox-first-run-tour-seen' is the sharp one: its presence proves a real
// Veyrnox install existed on this device AND completed a walkthrough of the
// coercion stack (duress PIN, stealth wallets, panic wipe, hardware binding).
// That is the same class as 'veyrnox-kek-pin-notice' and 'veyrnox-device-id',
// both of which are swept for exactly that reason.
//
// "Nothing reads them any more" is not an exemption — it is the property EVERY
// key in this list has after a wipe. What makes a key a tell is its PRESENCE.
//
// Exact keys, not a RESIDUE_KEY_PREFIXES entry: that mechanism exists for keys
// "whose exact names are not known at build time" (runtime fingerprints). These
// two are literal constants in FirstRunTour.jsx. A THIRD marker added there would
// not be swept automatically — add it to METADATA_RESIDUE_KEYS and to TOUR_KEYS
// below, and this suite will cover it.

import { describe, it, expect, beforeEach } from 'vitest';
import { panicWipeLocal, inspectKeyMaterial, clearWipeMarker } from '../panic.js';
import { webKeyStore } from '../keystore/web.js';
import { generateMnemonic } from '../mnemonic.js';
import { clearVault } from '../evm/vaultStore.js';

const REAL_PW = 'first-run-tour-residue-pw-1234';

// The two markers written by FirstRunTour.jsx (TOUR_ARMED_KEY / TOUR_SEEN_KEY).
const TOUR_KEYS = [
  'veyrnox-first-run-tour-armed',
  'veyrnox-first-run-tour-seen',
];

describe('panic wipe — first-run-tour residue (I-3)', () => {
  beforeEach(async () => {
    try { await clearVault(); } catch { /* noop */ }
    try { await panicWipeLocal(); } catch { /* noop */ }
    try { clearWipeMarker(); } catch { /* noop */ }
    for (const k of TOUR_KEYS) localStorage.removeItem(k);
  });

  it('enumerates both tour markers pre-wipe and refuses to call it clean', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    for (const k of TOUR_KEYS) localStorage.setItem(k, '1');

    const before = await inspectKeyMaterial();

    for (const k of TOUR_KEYS) expect(before.localStorageResidue).toContain(k);
    expect(before.clean).toBe(false);
  });

  it('panicWipeLocal() clears them and only then reports clean', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    for (const k of TOUR_KEYS) localStorage.setItem(k, '1');

    const report = await panicWipeLocal();

    for (const k of TOUR_KEYS) {
      expect(localStorage.getItem(k)).toBeNull();
      expect(report.localStorageResidue).not.toContain(k);
    }
    expect(report.clean).toBe(true);
    expect((await inspectKeyMaterial()).clean).toBe(true);
  });

  // The specific pre-fix failure, asserted one key at a time so a partial fix
  // cannot pass: the wipe ran, removed nothing here, and the report still
  // claimed nothing recoverable remained.
  it.each(TOUR_KEYS)('never reports clean while %s survives', async (key) => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    await panicWipeLocal();
    clearWipeMarker();

    localStorage.setItem(key, '1');

    const after = await inspectKeyMaterial();
    expect(after.localStorageResidue).toContain(key);
    expect(after.clean).toBe(false);
  });
});
