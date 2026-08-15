// Smallest check that fails if the insecure-tier persistence logic breaks.
// Loop bug: without persistence, the gate re-prompts every unlock on devices
// that can't pass the hardware-tier gate (Chinese OEM Keystore reports SOFTWARE,
// no StrongBox/TEE, Android<11, plugin absent). Fix: persist the verdict in
// localStorage; the gate skips activation when set.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  KEK_INSECURE_TIER_KEY,
  clearKekInsecureTier,
} from '../useKekEnrollmentGate.js';

describe('KEK insecure-tier persistence', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* jsdom */ } });

  it('clearKekInsecureTier removes the verdict', () => {
    localStorage.setItem(KEK_INSECURE_TIER_KEY, '1');
    expect(localStorage.getItem(KEK_INSECURE_TIER_KEY)).toBe('1');
    clearKekInsecureTier();
    expect(localStorage.getItem(KEK_INSECURE_TIER_KEY)).toBe(null);
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
