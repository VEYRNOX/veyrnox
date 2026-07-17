// wallet-core/__tests__/panic-residue-first-unlock-markers.test.js
//
// I-3 residue-completeness test: two "was here" markers written on first primary
// unlock must be destroyed by panicWipeLocal(). Both are set to '1' as one-shot
// per-device flags and their presence proves a real primary unlock happened on
// this device after the last wipe baseline (an adversary dumping localStorage
// post-wipe can prove Veyrnox reached first-unlock).
//
//   - 'veyrnox-2fa-biometric-auto'  — src/lib/biometric.js:160 (PR #1033,
//                                     ensureBiometric2faOnNative one-shot marker)
//   - 'veyrnox-kek-pin-notice'      — src/lib/kekPinNotice.js:17 (PR #1071,
//                                     ensureKekPinNoticeOnNative one-shot toast marker)
//
// Both keys must:
//   (a) be enumerated by readLocalAddressResidue() BEFORE the wipe (so the
//       pre-wipe cleanliness check surfaces them), and
//   (b) be cleared by panicWipeLocal() (so inspectKeyMaterial().clean === true
//       after the wipe).

import { describe, it, expect, beforeEach } from 'vitest';
import { panicWipeLocal, inspectKeyMaterial } from '../panic.js';
import { webKeyStore } from '../keystore/web.js';
import { generateMnemonic } from '../mnemonic.js';
import { clearVault } from '../evm/vaultStore.js';
import { clearWipeMarker } from '../panic.js';

const REAL_PW = 'first-unlock-markers-pw-1234';

describe('panic wipe — first-unlock "was here" markers (I-3 residue)', () => {
  beforeEach(async () => {
    try { await clearVault(); } catch { /* noop */ }
    try { await panicWipeLocal(); } catch { /* noop */ }
    try { clearWipeMarker(); } catch { /* noop */ }
    localStorage.removeItem('veyrnox-2fa-biometric-auto');
    localStorage.removeItem('veyrnox-kek-pin-notice');
  });

  it('inspectKeyMaterial().localStorageResidue enumerates both markers pre-wipe', async () => {
    // Real vault so the wipe still exercises key-store destruction.
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    localStorage.setItem('veyrnox-2fa-biometric-auto', '1');
    localStorage.setItem('veyrnox-kek-pin-notice', '1');

    const before = await inspectKeyMaterial();
    expect(before.localStorageResidue).toContain('veyrnox-2fa-biometric-auto');
    expect(before.localStorageResidue).toContain('veyrnox-kek-pin-notice');
    expect(before.clean).toBe(false);
  });

  it('panicWipeLocal() clears both first-unlock markers and leaves clean=true', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    localStorage.setItem('veyrnox-2fa-biometric-auto', '1');
    localStorage.setItem('veyrnox-kek-pin-notice', '1');

    const report = await panicWipeLocal();

    expect(localStorage.getItem('veyrnox-2fa-biometric-auto')).toBeNull();
    expect(localStorage.getItem('veyrnox-kek-pin-notice')).toBeNull();
    expect(report.localStorageResidue).not.toContain('veyrnox-2fa-biometric-auto');
    expect(report.localStorageResidue).not.toContain('veyrnox-kek-pin-notice');
    expect(report.clean).toBe(true);
    expect((await inspectKeyMaterial()).clean).toBe(true);
  });
});
