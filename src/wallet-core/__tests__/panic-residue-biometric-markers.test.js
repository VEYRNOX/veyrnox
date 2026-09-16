// I-3 residue-completeness for the two biometric markers lib/biometric.js
// writes outside the pref key itself.
//
// ALL_RESIDUE_KEYS is a module-private const, so no test can enumerate it —
// coverage MUST be per-key, which is why this directory carries one dedicated
// panic-residue-*.test.js per key group. This file pins two keys that belong
// in METADATA_RESIDUE_KEYS:
//
//   veyrnox-biometric-pref-v2       lib/biometric.js BIOMETRIC_PREF_MIGRATED_KEY
//   veyrnox-biometric-consent-seen  lib/biometric.js BIOMETRIC_CONSENT_SEEN_KEY
//
// 'veyrnox-biometric-unlock' (the pref VALUE) has been in LOCAL_RESIDUE_KEYS
// since F-06. These two are its neighbours and were never added: one records
// that the one-time legacy-opt-out migration ran, the other that the onboarding
// consent screen was answered. Both are pure markers, which is exactly why they
// were easy to miss — neither holds a secret.
//
// "Nothing reads this key any more" is NOT an exemption, and neither is "it
// only holds '1'". What makes a key a tell is its PRESENCE. Both of these are
// written ONLY by the real session (each writer returns early on
// isDeniabilityOrDemoActive), so surviving a wipe is strictly primary-session
// evidence: the device ran a Veyrnox build, reached onboarding, and answered a
// biometric prompt. veyrnox-biometric-pref-v2 additionally proves the install
// PREDATES the default-ON flip, since the migration only writes where an
// auth-model marker already existed.
//
// A key missing from the list drives a FALSE clean:true — the wipe leaves the
// tell behind AND inspectKeyMaterial() reports the device as clean. Mirrors
// panic-residue-review-prompt.test.js.

import { describe, it, expect, beforeEach } from 'vitest';
import { panicWipeLocal, inspectKeyMaterial, clearWipeMarker } from '../panic.js';
import { webKeyStore } from '../keystore/web.js';
import { generateMnemonic } from '../mnemonic.js';
import { clearVault } from '../evm/vaultStore.js';

const REAL_PW = 'biometric-marker-residue-pw-1234';

const LOCAL_KEYS = [
  'veyrnox-biometric-pref-v2',
  'veyrnox-biometric-consent-seen',
];

describe('panic wipe — biometric marker residue (I-3)', () => {
  beforeEach(async () => {
    try { await clearVault(); } catch { /* noop */ }
    try { await panicWipeLocal(); } catch { /* noop */ }
    try { clearWipeMarker(); } catch { /* noop */ }
    for (const k of LOCAL_KEYS) localStorage.removeItem(k);
  });

  it('inspectKeyMaterial refuses to call it clean while either marker survives', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    for (const k of LOCAL_KEYS) localStorage.setItem(k, '1');

    const before = await inspectKeyMaterial();
    for (const k of LOCAL_KEYS) expect(before.localStorageResidue).toContain(k);
    expect(before.clean).toBe(false);
  });

  it('each marker on its OWN is enough to deny clean', async () => {
    // Guards against a partial list passing because a NEIGHBOUR key is present:
    // set exactly one key at a time so every entry is individually pinned.
    for (const k of LOCAL_KEYS) {
      await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
      localStorage.setItem(k, '1');

      const report = await inspectKeyMaterial();
      expect(report.localStorageResidue, `${k} must be tracked`).toContain(k);
      expect(report.clean, `${k} alone must deny clean`).toBe(false);

      localStorage.removeItem(k);
      try { await clearVault(); } catch { /* noop */ }
      try { await panicWipeLocal(); } catch { /* noop */ }
      try { clearWipeMarker(); } catch { /* noop */ }
    }
  });

  it('panicWipeLocal() clears both markers and then reports clean', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    for (const k of LOCAL_KEYS) localStorage.setItem(k, '1');

    const report = await panicWipeLocal();

    for (const k of LOCAL_KEYS) {
      expect(localStorage.getItem(k)).toBeNull();
      expect(report.localStorageResidue).not.toContain(k);
    }
    expect(report.clean).toBe(true);
    expect((await inspectKeyMaterial()).clean).toBe(true);
  });

  it('wipes the markers alongside the pref key they sit next to', async () => {
    // The three travel together on a real device: biometric.js writes the pref
    // and the migration marker from the same function. A sweep that took only
    // the pref (the one key that was already listed) would pass every case
    // above that sets the markers alone, and fail here.
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    localStorage.setItem('veyrnox-biometric-unlock', '0');
    localStorage.setItem('veyrnox-biometric-pref-v2', '1');
    localStorage.setItem('veyrnox-biometric-consent-seen', '1');

    const report = await panicWipeLocal();

    expect(localStorage.getItem('veyrnox-biometric-unlock')).toBeNull();
    expect(localStorage.getItem('veyrnox-biometric-pref-v2')).toBeNull();
    expect(localStorage.getItem('veyrnox-biometric-consent-seen')).toBeNull();
    expect(report.clean).toBe(true);
  });
});
