// wallet-core/__tests__/panic-residue-grace.test.js
//
// Configurable re-lock grace window (screen-off deferral). Two localStorage
// keys — the duration setting and the disclosure marker — MUST be swept by
// panicWipeLocal AND accounted for in inspectKeyMaterial().clean, or a wipe
// leaves a forensic tell that a real Veyrnox install existed here AND had a
// non-default grace configured.
//
// Structural mirror of panic-residue-fastpath.test.js.

import { describe, it, expect, beforeEach } from 'vitest';
import { panicWipeLocal, inspectKeyMaterial, clearWipeMarker } from '../panic.js';
import { webKeyStore } from '../keystore/web.js';
import { generateMnemonic } from '../mnemonic.js';
import { clearVault } from '../evm/vaultStore.js';

const REAL_PW = 'grace-residue-pw-1234';
const GRACE_KEY = 'veyrnox-relock-grace-ms';
const DISCLOSURE_KEY = 'veyrnox-relock-grace-disclosed';

describe('panic wipe — relock-grace residue (I3)', () => {
  beforeEach(async () => {
    try { await clearVault(); } catch { /* noop */ }
    try { await panicWipeLocal(); } catch { /* noop */ }
    try { clearWipeMarker(); } catch { /* noop */ }
    localStorage.removeItem(GRACE_KEY);
    localStorage.removeItem(DISCLOSURE_KEY);
  });

  it('enumerates both markers pre-wipe and refuses to call them clean', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    localStorage.setItem(GRACE_KEY, '30000');
    localStorage.setItem(DISCLOSURE_KEY, '1');

    const before = await inspectKeyMaterial();
    expect(before.localStorageResidue).toContain(GRACE_KEY);
    expect(before.localStorageResidue).toContain(DISCLOSURE_KEY);
    expect(before.clean).toBe(false);
  });

  it('panicWipeLocal() clears both markers and only then reports clean', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    localStorage.setItem(GRACE_KEY, '60000');
    localStorage.setItem(DISCLOSURE_KEY, '1');

    const report = await panicWipeLocal();

    expect(localStorage.getItem(GRACE_KEY)).toBeNull();
    expect(localStorage.getItem(DISCLOSURE_KEY)).toBeNull();
    expect(report.localStorageResidue).not.toContain(GRACE_KEY);
    expect(report.localStorageResidue).not.toContain(DISCLOSURE_KEY);
    expect(report.clean).toBe(true);
    expect((await inspectKeyMaterial()).clean).toBe(true);
  });
});
