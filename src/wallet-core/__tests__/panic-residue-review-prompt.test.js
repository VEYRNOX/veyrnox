// I-3 residue-completeness for the store-review prompt markers (found by the
// 2026-09-05 security diff, second run — the keys landed in 92580cf6 without a
// matching panic.js entry).
//
// ALL_RESIDUE_KEYS is a module-private const, so no test can enumerate it —
// coverage MUST be per-key, which is why this directory carries one dedicated
// panic-residue-*.test.js per key group. This file pins three keys that belong
// in METADATA_RESIDUE_KEYS:
//
//   veyrnox-review-send-count      lib/reviewPrompt.js SEND_COUNT_KEY
//   veyrnox-review-last-asked-ts   lib/reviewPrompt.js LAST_ASKED_KEY
//   veyrnox-review-declined        lib/reviewPrompt.js DECLINED_KEY
//
// "Nothing reads this key any more" is NOT an exemption — that is the property
// EVERY key in the list has after a wipe. What makes a key a tell is its
// PRESENCE. veyrnox-review-send-count goes further than presence: its VALUE is
// a count of completed sends from this device, written by SendCrypto.jsx's
// SendDoneView mount effect. The cooldown timestamp and the declined flag both
// additionally imply the install was old enough to be asked for a review.
//
// A key missing from the list drives a FALSE clean:true — the wipe leaves the
// tell behind AND inspectKeyMaterial() reports the device as clean. Mirrors
// panic-residue-paywall-nudge.test.js, whose referral-prompt key is the closest
// analogue (it too only appears after a completed send).

import { describe, it, expect, beforeEach } from 'vitest';
import { panicWipeLocal, inspectKeyMaterial, clearWipeMarker } from '../panic.js';
import { webKeyStore } from '../keystore/web.js';
import { generateMnemonic } from '../mnemonic.js';
import { clearVault } from '../evm/vaultStore.js';

const REAL_PW = 'review-prompt-residue-pw-1234';

const LOCAL_KEYS = [
  'veyrnox-review-send-count',
  'veyrnox-review-last-asked-ts',
  'veyrnox-review-declined',
];

describe('panic wipe — store-review prompt residue (I-3)', () => {
  beforeEach(async () => {
    try { await clearVault(); } catch { /* noop */ }
    try { await panicWipeLocal(); } catch { /* noop */ }
    try { clearWipeMarker(); } catch { /* noop */ }
    for (const k of LOCAL_KEYS) localStorage.removeItem(k);
  });

  it('inspectKeyMaterial refuses to call it clean while any of the three keys survives', async () => {
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

  it('panicWipeLocal() clears all three keys and then reports clean', async () => {
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

  it('a realistic send-count VALUE is wiped, not just a placeholder', async () => {
    // The other cases set '1' for every key, which is a legitimate value for
    // the declined flag but not for the counter or the timestamp. A wipe keyed
    // on value shape rather than key name would pass those and fail here.
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    localStorage.setItem('veyrnox-review-send-count', '17');
    localStorage.setItem('veyrnox-review-last-asked-ts', String(Date.now()));

    const report = await panicWipeLocal();

    expect(localStorage.getItem('veyrnox-review-send-count')).toBeNull();
    expect(localStorage.getItem('veyrnox-review-last-asked-ts')).toBeNull();
    expect(report.clean).toBe(true);
  });
});
