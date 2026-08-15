// I-3 residue-completeness for the paywall/session-day markers and the sibling
// referral-prompt dismissal marker (branch review 2026-08-15, C-2 + S-1).
//
// ALL_RESIDUE_KEYS is a module-private const, so no test can enumerate it —
// coverage MUST be per-key, which is why this directory carries one dedicated
// panic-residue-*.test.js per key group. This file pins five keys that belong in
// METADATA_RESIDUE_KEYS:
//
//   veyrnox-session-day-count         PaywallNudge.jsx SESSION_COUNT_KEY
//   veyrnox-session-last-day          PaywallNudge.jsx SESSION_LAST_DAY_KEY
//   veyrnox-paywall-nudge-dismissed   PaywallNudge.jsx NUDGE_DISMISSED_KEY
//   veyrnox-backup-nudge-dismissed    BackupPaywallNudge.jsx KEY
//   veyrnox-referral-prompt-dismissed ReferralPrompt.jsx DISMISSED_KEY
//
// "Nothing reads this key any more" is NOT an exemption — that is the property
// EVERY key in the list has after a wipe. What makes a key a tell is its
// PRESENCE. Each of these proves a real Veyrnox install accumulated wallet-use
// days or dismissed a nag on this device, and the referral one is the strongest
// of the set: its prompt only renders on the SendDoneView confirmation screen,
// so the key proves at least one COMPLETED send.
//
// A key missing from the list drives a FALSE clean:true — the wipe leaves the
// tell behind AND inspectKeyMaterial() reports the device as clean. Mirrors
// panic-residue-backup-nag.test.js.

import { describe, it, expect, beforeEach } from 'vitest';
import { panicWipeLocal, inspectKeyMaterial, clearWipeMarker } from '../panic.js';
import { webKeyStore } from '../keystore/web.js';
import { generateMnemonic } from '../mnemonic.js';
import { clearVault } from '../evm/vaultStore.js';

const REAL_PW = 'paywall-nudge-residue-pw-1234';

const LOCAL_KEYS = [
  'veyrnox-session-day-count',
  'veyrnox-session-last-day',
  'veyrnox-paywall-nudge-dismissed',
  'veyrnox-backup-nudge-dismissed',
  'veyrnox-referral-prompt-dismissed',
];

describe('panic wipe — paywall/session-day + referral-prompt residue (I-3)', () => {
  beforeEach(async () => {
    try { await clearVault(); } catch { /* noop */ }
    try { await panicWipeLocal(); } catch { /* noop */ }
    try { clearWipeMarker(); } catch { /* noop */ }
    for (const k of LOCAL_KEYS) localStorage.removeItem(k);
  });

  it('inspectKeyMaterial refuses to call it clean while any of the five keys survives', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    for (const k of LOCAL_KEYS) localStorage.setItem(k, '1');

    const before = await inspectKeyMaterial();
    for (const k of LOCAL_KEYS) expect(before.localStorageResidue).toContain(k);
    expect(before.clean).toBe(false);
  });

  it('each key on its OWN is enough to deny clean', async () => {
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

  it('panicWipeLocal() clears all five keys and then reports clean', async () => {
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
});
