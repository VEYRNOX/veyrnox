// I-3 residue-completeness for the #2640 referral-redeem retry counter.
//
// 'veyrnox-referral-pending-attempts' (lib/referral.js PENDING_ATTEMPTS_KEY)
// counts failed redemption attempts for the pending referral code and is
// cleared alongside it. It sits next to 'veyrnox-referral-pending' in
// METADATA_RESIDUE_KEYS — a key missing from that list drives a FALSE
// clean:true, the same failure class documented in the sibling
// panic-residue-*.test.js files in this directory.

import { describe, it, expect, beforeEach } from 'vitest';
import { panicWipeLocal, inspectKeyMaterial, clearWipeMarker } from '../panic.js';
import { webKeyStore } from '../keystore/web.js';
import { generateMnemonic } from '../mnemonic.js';
import { clearVault } from '../evm/vaultStore.js';

const REAL_PW = 'referral-attempts-residue-pw-1234';
const KEY = 'veyrnox-referral-pending-attempts';

describe('panic wipe — referral pending-attempts residue (I-3, #2640)', () => {
  beforeEach(async () => {
    try { await clearVault(); } catch { /* noop */ }
    try { await panicWipeLocal(); } catch { /* noop */ }
    try { clearWipeMarker(); } catch { /* noop */ }
    localStorage.removeItem(KEY);
  });

  it('inspectKeyMaterial refuses to call it clean while the key survives', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    localStorage.setItem(KEY, '2');

    const before = await inspectKeyMaterial();
    expect(before.localStorageResidue).toContain(KEY);
    expect(before.clean).toBe(false);
  });

  it('panicWipeLocal() clears it and only then reports clean', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    localStorage.setItem(KEY, '2');

    const report = await panicWipeLocal();

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(report.localStorageResidue).not.toContain(KEY);
    expect(report.clean).toBe(true);
    expect((await inspectKeyMaterial()).clean).toBe(true);
  });
});
