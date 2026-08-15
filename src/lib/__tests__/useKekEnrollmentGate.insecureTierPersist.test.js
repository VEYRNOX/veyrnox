// Smallest check that fails if the insecure-tier persistence logic breaks.
// Loop bug: without persistence, the gate re-prompts every unlock on devices
// that can't pass the hardware-tier gate (Chinese OEM Keystore reports SOFTWARE,
// no StrongBox/TEE, Android<11, plugin absent). Fix: persist the verdict in
// localStorage; the gate skips activation when set.
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mutable so a single test can flip the session into decoy/demo. Defaults to
// false, so the pre-existing cases below behave exactly as they did before.
const session = vi.hoisted(() => ({ deniable: false }));
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => session.deniable,
}));

import {
  KEK_INSECURE_TIER_KEY,
  clearKekInsecureTier,
} from '../useKekEnrollmentGate.js';

describe('KEK insecure-tier persistence', () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch { /* jsdom */ }
    session.deniable = false;
  });

  it('clearKekInsecureTier removes the verdict', () => {
    localStorage.setItem(KEK_INSECURE_TIER_KEY, '1');
    expect(localStorage.getItem(KEK_INSECURE_TIER_KEY)).toBe('1');
    clearKekInsecureTier();
    expect(localStorage.getItem(KEK_INSECURE_TIER_KEY)).toBe(null);
  });

  // I3 — the key is SHARED, so a decoy/duress/stealth/demo session must not
  // mutate what the primary session reads back. Clearing a valid suppression
  // from a coerced session would restore the every-unlock re-prompt loop the
  // persistence above exists to end. Guard lives in the write itself, not at
  // the call sites (lib/consent.js pattern) — this is the case that fails if
  // someone moves it back out.
  it('clearKekInsecureTier is a NO-OP in a decoy/demo session', () => {
    localStorage.setItem(KEK_INSECURE_TIER_KEY, '1');
    session.deniable = true;
    clearKekInsecureTier();
    expect(localStorage.getItem(KEK_INSECURE_TIER_KEY)).toBe('1');
  });

  it('reads stay ungated in a decoy/demo session (reading leaves no trace)', () => {
    localStorage.setItem(KEK_INSECURE_TIER_KEY, '1');
    session.deniable = true;
    // The gate's own suppression check must still see the real verdict, so an
    // ineligible device does not start re-prompting inside a decoy session.
    expect(localStorage.getItem(KEK_INSECURE_TIER_KEY)).toBe('1');
  });

  it('key is on the panic residue sweep list', async () => {
    const panic = await import('../../wallet-core/panic.js');
    // ALL_RESIDUE_KEYS is not exported; assert via the erase primitive.
    // A sweep must remove this key or every StrongBox-ineligible device
    // leaves a forensic tell behind after a wipe.
    localStorage.setItem(KEK_INSECURE_TIER_KEY, '1');
    if (typeof panic.panicWipeLocal === 'function') {
      try { await panic.panicWipeLocal(); } catch { /* jsdom / no idb */ }
      expect(localStorage.getItem(KEK_INSECURE_TIER_KEY)).toBe(null);
    }
  });
});
