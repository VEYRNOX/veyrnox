// H-3 / P1-B — shouldAutoCacheTypedPin must NOT re-cache the REAL PIN while a duress
// PIN is configured.
//
// THE INVARIANT: while a duress PIN is configured, primary biometric unlock must never
// cache the REAL pin. Otherwise the next successful real-PIN unlock (WalletEntry
// runPinUnlock) silently re-arms "Face ID opens the REAL wallet" and re-creates H-3,
// even after setDuressPin disarmed it.
//
// HISTORY (why this guard is keyed the way it is): the ORIGINAL duress guard was
// deleted in 88c921c7 / PR #714 because it asked `hasDuressVault()`, and PIN-cohort
// chaff provisioning writes a blob into the duress slot on EVERY device — so it was
// always true and auto-caching never fired at all. The signal used here is different:
// `veyrnox-duress-configured`, written ONLY when the user deliberately saves an
// Emergency PIN and removed when they remove it. It discriminates real configuration
// from chaff, so it does NOT reintroduce the PR #714 bug (pinned below).
//
// FAIL CLOSED (I4): the parameter must be EXPLICITLY false to permit caching. An
// absent/unknown signal is treated as "duress may be configured" → no cache.

import { describe, it, expect } from 'vitest';
import { shouldAutoCacheTypedPin } from '@/lib/authModel';

describe('shouldAutoCacheTypedPin — duress-configured guard (H-3 P1-B)', () => {
  it('permits the sanctioned primary Face-ID flow when NO duress PIN is configured', () => {
    // This is the exact case PR #714 fixed — chaff must NOT block it.
    expect(shouldAutoCacheTypedPin({
      biometricEnabled: true, alreadyCached: false, duressConfigured: false,
    })).toBe(true);
  });

  it('BLOCKS the auto-cache while a duress PIN is configured (the H-3 re-arm hole)', () => {
    expect(shouldAutoCacheTypedPin({
      biometricEnabled: true, alreadyCached: false, duressConfigured: true,
    })).toBe(false);
  });

  it('FAILS CLOSED when the duress signal is absent/unknown', () => {
    expect(shouldAutoCacheTypedPin({ biometricEnabled: true, alreadyCached: false })).toBe(false);
    expect(shouldAutoCacheTypedPin({
      biometricEnabled: true, alreadyCached: false, duressConfigured: undefined,
    })).toBe(false);
  });

  it('keeps the pre-existing guards load-bearing', () => {
    expect(shouldAutoCacheTypedPin({
      biometricEnabled: false, alreadyCached: false, duressConfigured: false,
    })).toBe(false);
    expect(shouldAutoCacheTypedPin({
      biometricEnabled: true, alreadyCached: true, duressConfigured: false,
    })).toBe(false);
  });
});
