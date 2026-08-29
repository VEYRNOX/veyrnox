// lib/__tests__/fastpathUnlock.test.js
//
// Issue #2019 — tri-state opt-in gate for the KEK fast-path DEK cache.
//
// Owner ruling — REVERSED this session: default-ON with a mandatory first-run
// disclosure card (was: default-OFF opt-in). Informed consent is preserved via
// the disclosure chokepoint: no fast-path benefit (populate warm, biometric
// button) activates before the user has seen the card and chosen.
//
// Tri-state semantics:
//   - key === '1'      → explicit ON  (enabled)
//   - key === '0'      → explicit OFF (disabled)
//   - key absent       → NOT YET CHOSEN, treated as ON (default-on)
//
// isFastpathEnabled() returns true iff the stored value is NOT '0'.
// hasFastpathBeenExplicitlySet() distinguishes "chose OFF" from "unset".
// setFastpathEnabled(false) writes '0' (not remove) so we don't collapse the
// two absent-key meanings.
//
// Init migration: pre-#2051 explicit-OFF installs (old setter did `remove`) get
// upgraded to explicit '0' iff hasSeenFastpathDisclosure() proves they saw the
// old disclosure — honours their prior choice through the default flip.
//
// I3: writes to BOTH keys are suppressed in decoy/demo (same discipline as
// lib/consent.js). Reads stay ungated (a bare read leaves no trace).

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import {
  isBiometricUnlockEnabled,
  BIOMETRIC_PREF_KEY,
} from '@/lib/biometric';
import {
  FASTPATH_ENABLED_STORAGE_KEY,
  FASTPATH_DISCLOSURE_SEEN_KEY,
  isFastpathEnabled,
  setFastpathEnabled,
  hasFastpathBeenExplicitlySet,
  markFastpathDisclosureSeen,
  hasSeenFastpathDisclosure,
  migrateFastpathState,
  shouldShowFastpathWarmingHint,
  enableFastpathAndBiometricUnlock,
} from '../fastpathUnlock.js';

describe('fastpathUnlock — tri-state opt-in gate (default-ON, session reversal)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(false);
  });

  it('exports the storage-key name so panic.js can sweep it (I3 residue)', () => {
    expect(FASTPATH_ENABLED_STORAGE_KEY).toBe('veyrnox-fastpath-enabled');
    expect(FASTPATH_DISCLOSURE_SEEN_KEY).toBe('veyrnox-fastpath-disclosure-seen');
  });

  it('defaults ON when nothing is stored (default-on flip)', () => {
    expect(isFastpathEnabled()).toBe(true);
  });

  it('explicit "1" reads as ON', () => {
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '1');
    expect(isFastpathEnabled()).toBe(true);
  });

  it('explicit "0" reads as OFF (only value that disables)', () => {
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '0');
    expect(isFastpathEnabled()).toBe(false);
  });

  it('any other stored value reads as ON (default-on for unknown/legacy)', () => {
    // Under default-on semantics the only value that disables is exactly '0'.
    // A garbled value falls through to default-on — that is the correct
    // behaviour under this reversal (previously we fail-closed OFF).
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, 'true');
    expect(isFastpathEnabled()).toBe(true);
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, 'yes');
    expect(isFastpathEnabled()).toBe(true);
  });

  it('hasFastpathBeenExplicitlySet — true iff key is "0" or "1"', () => {
    expect(hasFastpathBeenExplicitlySet()).toBe(false);
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '1');
    expect(hasFastpathBeenExplicitlySet()).toBe(true);
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '0');
    expect(hasFastpathBeenExplicitlySet()).toBe(true);
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, 'garbled');
    expect(hasFastpathBeenExplicitlySet()).toBe(false);
  });

  it('setFastpathEnabled(true) writes exactly "1"', () => {
    setFastpathEnabled(true);
    expect(localStorage.getItem(FASTPATH_ENABLED_STORAGE_KEY)).toBe('1');
    expect(isFastpathEnabled()).toBe(true);
  });

  it('setFastpathEnabled(false) writes exactly "0" — NOT remove', () => {
    // Tri-state critical: "explicit OFF" and "not yet chosen" must be
    // distinguishable. A remove() would collapse them and the migration path
    // would silently re-enable an opted-out user.
    setFastpathEnabled(true);
    setFastpathEnabled(false);
    expect(localStorage.getItem(FASTPATH_ENABLED_STORAGE_KEY)).toBe('0');
    expect(isFastpathEnabled()).toBe(false);
    expect(hasFastpathBeenExplicitlySet()).toBe(true);
  });

  it('setFastpathEnabled is a NO-OP in decoy/demo (I3, three-writer trap)', () => {
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '1');
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    setFastpathEnabled(false);
    expect(localStorage.getItem(FASTPATH_ENABLED_STORAGE_KEY)).toBe('1');
    setFastpathEnabled(true);
    expect(localStorage.getItem(FASTPATH_ENABLED_STORAGE_KEY)).toBe('1');
  });

  it('reads stay ungated (decoy can consult without a write)', () => {
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '1');
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    expect(isFastpathEnabled()).toBe(true);
  });
});

describe('fastpathUnlock — disclosure marker', () => {
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

describe('fastpathUnlock — migration (pre-reversal explicit-OFF honoured)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(false);
  });

  it('migrates "disclosure seen + key absent" → explicit "0" (honours prior OFF)', () => {
    // Pre-#2051 explicit-OFF users had the old setter do remove(). After the
    // default-on flip, absent key = default-on → they would be silently
    // re-enabled. If the disclosure was seen (proving they went through the
    // old opt-in flow), treat the absent key as "user chose OFF".
    localStorage.setItem(FASTPATH_DISCLOSURE_SEEN_KEY, '1');
    expect(localStorage.getItem(FASTPATH_ENABLED_STORAGE_KEY)).toBeNull();

    migrateFastpathState();

    expect(localStorage.getItem(FASTPATH_ENABLED_STORAGE_KEY)).toBe('0');
    expect(isFastpathEnabled()).toBe(false);
  });

  it('does NOT migrate when disclosure has never been seen (genuine fresh install)', () => {
    migrateFastpathState();
    expect(localStorage.getItem(FASTPATH_ENABLED_STORAGE_KEY)).toBeNull();
    expect(isFastpathEnabled()).toBe(true); // default-on
  });

  it('does NOT overwrite an already-explicit value', () => {
    localStorage.setItem(FASTPATH_DISCLOSURE_SEEN_KEY, '1');
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '1');
    migrateFastpathState();
    expect(localStorage.getItem(FASTPATH_ENABLED_STORAGE_KEY)).toBe('1');
  });

  it('is idempotent — running twice does not flip a migrated value', () => {
    localStorage.setItem(FASTPATH_DISCLOSURE_SEEN_KEY, '1');
    migrateFastpathState();
    migrateFastpathState();
    expect(localStorage.getItem(FASTPATH_ENABLED_STORAGE_KEY)).toBe('0');
  });

  it('is a NO-OP in decoy/demo (I3 — a coerced session must not migrate real state)', () => {
    localStorage.setItem(FASTPATH_DISCLOSURE_SEEN_KEY, '1');
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    migrateFastpathState();
    expect(localStorage.getItem(FASTPATH_ENABLED_STORAGE_KEY)).toBeNull();
  });
});

describe('fastpathUnlock — linked biometric-unlock enablement (#2037 follow-up)', () => {
  // User-reported bug: Fast Unlock ON + Biometric Unlock OFF made the
  // "Unlock with fingerprint" button fail. Enabling Fast Unlock must ALSO
  // enable Biometric Unlock (pure preference flip — Shape A). The password
  // cache warms on the next successful PIN unlock via the pref-gated path
  // in WalletProvider.unlock().
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(false);
  });

  it('enableFastpathAndBiometricUnlock() flips BOTH prefs to ON', () => {
    enableFastpathAndBiometricUnlock();
    expect(isFastpathEnabled()).toBe(true);
    expect(localStorage.getItem(FASTPATH_ENABLED_STORAGE_KEY)).toBe('1');
    expect(isBiometricUnlockEnabled()).toBe(true);
    expect(localStorage.getItem(BIOMETRIC_PREF_KEY)).toBe('1');
  });

  it('enableFastpathAndBiometricUnlock is a NO-OP in decoy/demo (I3, both writers)', () => {
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    enableFastpathAndBiometricUnlock();
    expect(localStorage.getItem(FASTPATH_ENABLED_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(BIOMETRIC_PREF_KEY)).toBeNull();
  });

  it('migration: pre-follow-up state (fastpath ON + biometric OFF) is repaired', () => {
    // The buggy state existing users may be in — Fast Unlock explicitly on
    // but Biometric Unlock never enabled. Migration flips biometric-unlock
    // ON so the next PIN unlock warms the password cache.
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '1');
    localStorage.setItem(FASTPATH_DISCLOSURE_SEEN_KEY, '1');
    expect(isBiometricUnlockEnabled()).toBe(false);
    migrateFastpathState();
    expect(isBiometricUnlockEnabled()).toBe(true);
  });

  it('migration: default-on (key absent) + disclosure seen does NOT touch biometric-unlock', () => {
    // Absent key + disclosure seen → the pre-#2051 explicit-OFF migration
    // writes '0' and Fast Unlock ends up OFF; biometric-unlock must remain
    // untouched (asymmetric disable — do not enable biometric here).
    localStorage.setItem(FASTPATH_DISCLOSURE_SEEN_KEY, '1');
    migrateFastpathState();
    expect(isFastpathEnabled()).toBe(false);
    expect(localStorage.getItem(BIOMETRIC_PREF_KEY)).toBeNull();
  });

  it('migration: fastpath OFF ("0") does NOT enable biometric-unlock', () => {
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '0');
    migrateFastpathState();
    expect(localStorage.getItem(BIOMETRIC_PREF_KEY)).toBeNull();
  });

  it('migration: biometric-unlock already ON is idempotent', () => {
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '1');
    localStorage.setItem(BIOMETRIC_PREF_KEY, '1');
    migrateFastpathState();
    expect(localStorage.getItem(BIOMETRIC_PREF_KEY)).toBe('1');
  });

  it('migration: NO-OP in decoy/demo (I3)', () => {
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '1');
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    migrateFastpathState();
    expect(localStorage.getItem(BIOMETRIC_PREF_KEY)).toBeNull();
  });
});

describe('fastpathUnlock — shouldShowFastpathWarmingHint (first-unlock hint)', () => {
  const base = { platform: 'android', enabled: true, existingCacheValue: null };

  it('all conditions met → true', () => {
    expect(shouldShowFastpathWarmingHint(base)).toBe(true);
  });

  it('non-android platform → false', () => {
    expect(shouldShowFastpathWarmingHint({ ...base, platform: 'ios' })).toBe(false);
    expect(shouldShowFastpathWarmingHint({ ...base, platform: 'web' })).toBe(false);
  });

  it('opt-in OFF → false', () => {
    expect(shouldShowFastpathWarmingHint({ ...base, enabled: false })).toBe(false);
  });

  it('cache already populated → false (no one-time setup left to do)', () => {
    expect(shouldShowFastpathWarmingHint({ ...base, existingCacheValue: '{"v":1}' })).toBe(false);
    expect(shouldShowFastpathWarmingHint({ ...base, existingCacheValue: 'x' })).toBe(false);
  });

  it('cache "empty" allows null, undefined, and empty string', () => {
    expect(shouldShowFastpathWarmingHint({ ...base, existingCacheValue: undefined })).toBe(true);
    expect(shouldShowFastpathWarmingHint({ ...base, existingCacheValue: '' })).toBe(true);
    expect(shouldShowFastpathWarmingHint({ ...base, existingCacheValue: null })).toBe(true);
  });
});
