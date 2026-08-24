// lib/__tests__/fastpathUnlock.test.js
//
// Issue #2019 — opt-in gate for the KEK fast-path DEK cache.
//
// Owner ruling (session 2019, Q3): OFF by default, opt-in via Settings.
// Enabling shows a one-time disclosure card explaining the tradeoff in plain
// language. I3: writes to the toggle key are suppressed in decoy/demo (same
// discipline as lib/consent.js — a coerced tap must NOT be able to flip the
// real user's answer OR leave a persistent tell that the real session ever
// visited Security settings). Reads stay ungated (reading a localStorage key
// leaves no trace).

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import {
  FASTPATH_ENABLED_STORAGE_KEY,
  isFastpathEnabled,
  setFastpathEnabled,
  markFastpathDisclosureSeen,
  hasSeenFastpathDisclosure,
} from '../fastpathUnlock.js';

describe('fastpathUnlock — opt-in gate (Q3)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(false);
  });

  it('exports the storage-key name so panic.js can sweep it (I3 residue)', () => {
    // The panic-residue sweep is keyed on the exact string — this is a
    // second copy of the same constant, so a rename in one file that
    // forgets the other trips this pin.
    expect(FASTPATH_ENABLED_STORAGE_KEY).toBe('veyrnox-fastpath-enabled');
  });

  it('defaults OFF when nothing is stored (Q3: off by default)', () => {
    expect(isFastpathEnabled()).toBe(false);
  });

  it('defaults OFF for any truthy-looking legacy value except the exact enable marker', () => {
    // Defence in depth: only the exact `'1'` reads as enabled. A partial
    // migration/typo leaves fast-path OFF (fail-closed default).
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, 'true');
    expect(isFastpathEnabled()).toBe(false);
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, 'yes');
    expect(isFastpathEnabled()).toBe(false);
  });

  it('setFastpathEnabled(true) flips it on for subsequent reads', () => {
    setFastpathEnabled(true);
    expect(isFastpathEnabled()).toBe(true);
  });

  it('setFastpathEnabled(false) clears the key (residue-cleanest)', () => {
    setFastpathEnabled(true);
    setFastpathEnabled(false);
    expect(isFastpathEnabled()).toBe(false);
    // Removed rather than set to '0' so a wiped device is indistinguishable
    // from one that never enabled it.
    expect(localStorage.getItem(FASTPATH_ENABLED_STORAGE_KEY)).toBeNull();
  });

  it('setFastpathEnabled is a NO-OP in decoy/demo (I3, three-writer trap)', () => {
    // Same discipline as lib/consent.js: a coerced tap in a decoy session
    // must not flip or wipe the real user's answer. Guard lives at the
    // WRITE, not at the read call sites (see consent.js history).
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '1');
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    setFastpathEnabled(false);
    expect(localStorage.getItem(FASTPATH_ENABLED_STORAGE_KEY)).toBe('1');
    setFastpathEnabled(true);
    // still whatever it was before the decoy session
    expect(localStorage.getItem(FASTPATH_ENABLED_STORAGE_KEY)).toBe('1');
  });

  it('reads stay ungated (reading leaves no trace, decoy can still consult)', () => {
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '1');
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    // Reading is safe in decoy — it doesn't write, doesn't reveal (returns
    // a boolean).
    expect(isFastpathEnabled()).toBe(true);
  });
});

describe('fastpathUnlock — disclosure marker (Q3, one-time card)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(false);
  });

  it('has not been seen by default', () => {
    expect(hasSeenFastpathDisclosure()).toBe(false);
  });

  it('markFastpathDisclosureSeen persists across reads', () => {
    markFastpathDisclosureSeen();
    expect(hasSeenFastpathDisclosure()).toBe(true);
  });

  it('markFastpathDisclosureSeen is a NO-OP in decoy/demo (I3)', () => {
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    markFastpathDisclosureSeen();
    expect(hasSeenFastpathDisclosure()).toBe(false);
  });
});
