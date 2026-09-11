// wallet-core/__tests__/panic-residue-theft-protection.test.js
//
// I-3 residue-completeness for the Theft Protection opt-in marker (#2517).
//
// src/lib/theftProtection.js writes THEFT_PROTECTION_KEY = 'veyrnox-theft-protection'
// when the user switches the setting on (PR #2498, 29e6c0a9). It shipped without an
// entry in panic.js, so it survived a panic wipe AND inspectKeyMaterial() reported
// clean while it sat in storage.
//
// Why it is a tell: its presence proves a real primary Veyrnox wallet existed on this
// device and that its owner configured an extra unlock factor — the same class as
// 'veyrnox-biometric-unlock' and 'veyrnox-passkey-unlock', which sit beside it in
// DENIABILITY_RESIDUE_KEYS for exactly that reason. It is also not inert after a wipe:
// the gate reads it on the next wallet created or restored on the device, so a stale
// opt-in would silently re-arm Theft Protection on a vault the user never enabled it
// for.
//
// The literal is pinned here rather than imported from lib/theftProtection.js, the same
// way panic.js keeps its residue keys as plain strings (wallet-core stays decoupled
// from the modules it erases). The last test catches a rename of the source constant.

import { describe, it, expect, beforeEach } from 'vitest';
import { panicWipeLocal, inspectKeyMaterial, clearWipeMarker } from '../panic.js';
import { webKeyStore } from '../keystore/web.js';
import { generateMnemonic } from '../mnemonic.js';
import { clearVault } from '../evm/vaultStore.js';
import { THEFT_PROTECTION_KEY } from '@/lib/theftProtection';

const REAL_PW = 'theft-protection-residue-pw-1234';
const KEY = 'veyrnox-theft-protection';

describe('panic wipe — Theft Protection residue (I-3, #2517)', () => {
  beforeEach(async () => {
    try { await clearVault(); } catch { /* noop */ }
    try { await panicWipeLocal(); } catch { /* noop */ }
    try { clearWipeMarker(); } catch { /* noop */ }
    localStorage.removeItem(KEY);
  });

  it('enumerates the marker pre-wipe and refuses to call it clean', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    localStorage.setItem(KEY, '1');

    const before = await inspectKeyMaterial();

    expect(before.localStorageResidue).toContain(KEY);
    expect(before.clean).toBe(false);
  });

  it('panicWipeLocal() clears it and only then reports clean', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    localStorage.setItem(KEY, '1');

    const report = await panicWipeLocal();

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(report.localStorageResidue).not.toContain(KEY);
    expect(report.clean).toBe(true);
    expect((await inspectKeyMaterial()).clean).toBe(true);
  });

  // The specific pre-fix failure: the wipe ran, removed nothing here, and the report
  // still claimed nothing recoverable remained.
  it('never reports clean while the marker survives', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    await panicWipeLocal();
    clearWipeMarker();

    localStorage.setItem(KEY, '1');

    const after = await inspectKeyMaterial();
    expect(after.localStorageResidue).toContain(KEY);
    expect(after.clean).toBe(false);
  });

  it('the pinned literal still matches the writer constant', () => {
    expect(THEFT_PROTECTION_KEY).toBe(KEY);
  });
});
