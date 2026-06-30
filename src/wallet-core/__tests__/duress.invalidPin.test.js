// wallet-core/__tests__/duress.invalidPin.test.js
//
// Gap (phase 1): tryDuressUnlock's WRONG-PASSWORD path. The success path is
// covered (h2-migration-and-per-set-ap.test.js, deniability-timing.test.js) but
// the security-critical MISS behaviour was not pinned:
//
//   - a wrong password must return null (NEVER throw, NEVER reveal the decoy) —
//     this is what lets WalletProvider.unlock surface the SAME primary error
//     whether or not a duress vault exists (the deniability contract, I4 fail
//     closed / no oracle from this seam).
//   - with NO decoy configured, any password must also return null (no tell that
//     the feature is unused vs. a wrong guess).
//
// Real crypto (vault.js Argon2id+AES-GCM) + fake-indexeddb. We assert the machine
// contract (return value === null, no throw, decoy secret never returned), not copy.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  setDuressVault, tryDuressUnlock, clearDuressVault, hasDuressVault,
} from '../duress.js';
import * as mv from '../multiVault.js';

const DECOY_SEED = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const DURESS_PW = 'duress-pass-1357';

beforeEach(async () => {
  try { await clearDuressVault(); } catch { /* noop */ }
});

describe('tryDuressUnlock — invalid PIN (no oracle)', () => {
  it('returns null (does NOT throw) for a wrong password when a decoy IS configured', async () => {
    await setDuressVault(DECOY_SEED, DURESS_PW);
    expect(await hasDuressVault()).toBe(true);

    const out = await tryDuressUnlock('totally-wrong-password');
    expect(out).toBeNull();
  });

  it('never returns the decoy secret on a wrong password', async () => {
    await setDuressVault(DECOY_SEED, DURESS_PW);

    const out = await tryDuressUnlock('not-the-duress-pw');
    // A miss must not leak the decoy mnemonic in any form: null carries nothing,
    // and in particular is not the decoy payload string.
    expect(out).toBeNull();
    expect(out).not.toBe(DECOY_SEED);
  });

  it('returns null for any password when NO decoy is configured (same as a miss)', async () => {
    expect(await hasDuressVault()).toBe(false);
    expect(await tryDuressUnlock(DURESS_PW)).toBeNull();
    expect(await tryDuressUnlock('anything-at-all')).toBeNull();
  });

  it('still opens the decoy with the CORRECT password (miss path did not break the hit path)', async () => {
    await setDuressVault(DECOY_SEED, DURESS_PW);
    const payload = await tryDuressUnlock(DURESS_PW);
    expect(payload).not.toBeNull();
    expect(mv.parseVault(payload).container.wallets[0].mnemonic).toBe(DECOY_SEED);
  });
});
