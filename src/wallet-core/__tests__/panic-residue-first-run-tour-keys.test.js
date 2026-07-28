// wallet-core/__tests__/panic-residue-first-run-tour-keys.test.js
//
// I-3 residue-completeness for the two ORPHANED first-run-tour keys.
//
// FirstRunTour.jsx was deleted by PR #1403 (ECC F-P3-3 reopened). The component
// is gone, but the keys it wrote are not: any device that ran the tour still
// carries 'veyrnox-first-run-tour-armed' and/or 'veyrnox-first-run-tour-seen',
// and nothing reads, writes, or removes them any more.
//
// docs/Feature-Status.md called this "no residual-state hazard". It is one, by
// panic.js's OWN standard: 'veyrnox-seed-verify' is swept precisely because its
// presence proves a real wallet was created here. A surviving
// 'veyrnox-first-run-tour-seen' proves the real Veyrnox app ran on this device
// and completed onboarding — the same class as the funnel markers in
// panic-residue-telemetry-markers.test.js, and the exact thing a panic wipe
// exists to make unprovable.
//
// The keys were NEVER in ALL_RESIDUE_KEYS and match no RESIDUE_KEY_PREFIXES
// entry, so before this fix they survived the wipe AND inspectKeyMaterial()
// reported clean:true over the top of them — an overstated destruction claim
// (I4). Deleting a component does not retire the storage it wrote.

import { describe, it, expect, beforeEach } from 'vitest';
import { panicWipeLocal, inspectKeyMaterial, clearWipeMarker } from '../panic.js';
import { webKeyStore } from '../keystore/web.js';
import { generateMnemonic } from '../mnemonic.js';
import { clearVault } from '../evm/vaultStore.js';

const REAL_PW = 'first-run-tour-residue-pw-1234';

// Written by the deleted src/components/FirstRunTour.jsx (see de8cb829^):
//   TOUR_ARMED_KEY — set on first wallet entry, removed once the tour is consumed
//   TOUR_SEEN_KEY  — set when the tour completes, never removed
// A device can carry either or both depending on where the user stopped.
const TOUR_KEYS = [
  'veyrnox-first-run-tour-armed',
  'veyrnox-first-run-tour-seen',
];

describe('panic wipe — orphaned first-run-tour residue (I-3)', () => {
  beforeEach(async () => {
    try { await clearVault(); } catch { /* noop */ }
    try { await panicWipeLocal(); } catch { /* noop */ }
    try { clearWipeMarker(); } catch { /* noop */ }
    for (const k of TOUR_KEYS) localStorage.removeItem(k);
  });

  it('enumerates both tour keys pre-wipe and refuses to call it clean', async () => {
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

  // The specific pre-fix failure, one key at a time: the wipe ran, removed
  // nothing here, and the report still claimed nothing recoverable remained.
  // Asserted per-key so a fix that lists only one of the two still fails.
  for (const key of TOUR_KEYS) {
    it(`never reports clean while ${key} survives`, async () => {
      await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
      await panicWipeLocal();
      clearWipeMarker();

      localStorage.setItem(key, '1');

      const after = await inspectKeyMaterial();
      expect(after.localStorageResidue).toContain(key);
      expect(after.clean).toBe(false);
    });
  }
});
