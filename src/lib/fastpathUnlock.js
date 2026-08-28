// @ts-nocheck
// lib/fastpathUnlock.js — tri-state gate + disclosure marker for the KEK
// fast-path DEK cache (issue #2019, docs/kek-fast-path-design.md).
//
// Owner rulings this file encodes:
//   Q3 (REVERSED this session) — DEFAULT-ON with a MANDATORY first-run
//        disclosure card. Informed consent preserved via the disclosure
//        chokepoint: no fast-path benefit (populate warm, biometric button,
//        Settings toggle showing ON) activates before the user has seen the
//        card and made a choice. Previously "opt-in, off by default".
//   I3 — decoy/demo sessions must NOT flip the real user's answer OR leave a
//        persistent tell that the real session ever visited Security.
//        Guarded at the WRITE (setter / migration), NOT at the read call
//        sites — same three-writer trap discipline as lib/consent.js.
//
// Tri-state storage:
//   key === '1'      → explicit ON
//   key === '0'      → explicit OFF (must be distinguishable from absent so
//                      the migration below does not silently re-enable a user
//                      who chose OFF before the default flip)
//   key absent       → NOT YET CHOSEN → treated as ON (default-on)
//
// Migration: pre-#2051 explicit-OFF installs used remove() as the setter, so
// their key is absent and would default-on after the flip. migrateFastpathState
// promotes "disclosure seen + key absent" → explicit '0', honouring their
// prior OFF through the default flip. Idempotent + I3-guarded; called at
// module init.
//
// Panic-wipe: FASTPATH_ENABLED_STORAGE_KEY + FASTPATH_DISCLOSURE_SEEN_KEY are
// both listed in wallet-core/panic.js METADATA_RESIDUE_KEYS so ALL_RESIDUE_KEYS
// erases AND accounts for them in inspectKeyMaterial(). A rename here MUST
// update panic.js in the same commit (regression pinned by
// panic-residue-fastpath.test.js).

import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { isBiometricUnlockEnabled, setBiometricUnlockEnabled } from '@/lib/biometric';

/** Storage key mirrored in wallet-core/panic.js METADATA_RESIDUE_KEYS. */
export const FASTPATH_ENABLED_STORAGE_KEY = 'veyrnox-fastpath-enabled';

/** Marker asserting the disclosure card was shown at least once. */
export const FASTPATH_DISCLOSURE_SEEN_KEY = 'veyrnox-fastpath-disclosure-seen';

const ON = '1';
const OFF = '0';

function safeGet(key) {
  try { return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null; }
  catch { return null; }
}

function safeSet(key, value) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value); }
  catch { /* ignore */ }
}

/**
 * Whether the fast-path is currently enabled. Tri-state: only the exact
 * stored value '0' disables. Absent OR anything unrecognised → default-on.
 * Read-only, ungated (a bare read leaves no trace).
 */
export function isFastpathEnabled() {
  return safeGet(FASTPATH_ENABLED_STORAGE_KEY) !== OFF;
}

/**
 * Whether the user has ever made an EXPLICIT choice (either ON or OFF), as
 * opposed to the not-yet-chosen default-on state. Needed by the first-run
 * card gate + the migration below. Read-only, ungated.
 */
export function hasFastpathBeenExplicitlySet() {
  const v = safeGet(FASTPATH_ENABLED_STORAGE_KEY);
  return v === ON || v === OFF;
}

/**
 * Flip the toggle. NO-OP in decoy/demo — a coerced tap must not modify the
 * real user's answer (I3). Writes '0' rather than remove() for false so the
 * "explicit OFF" and "not yet chosen" states stay distinguishable through the
 * migration below.
 */
export function setFastpathEnabled(enabled) {
  if (isDeniabilityOrDemoActive()) return;
  safeSet(FASTPATH_ENABLED_STORAGE_KEY, enabled ? ON : OFF);
}

/**
 * Whether the one-time disclosure card has been acknowledged. Read-only.
 */
export function hasSeenFastpathDisclosure() {
  return safeGet(FASTPATH_DISCLOSURE_SEEN_KEY) === ON;
}

/**
 * Record that the disclosure card was shown to the user. NO-OP in
 * decoy/demo (I3, same discipline as setFastpathEnabled above).
 */
export function markFastpathDisclosureSeen() {
  if (isDeniabilityOrDemoActive()) return;
  safeSet(FASTPATH_DISCLOSURE_SEEN_KEY, ON);
}

/**
 * One-shot migration for the default-ON reversal. Called at module init.
 *
 * Pre-reversal installs that explicitly turned the toggle OFF had the old
 * setter do localStorage.removeItem() — so their key is absent. Under the new
 * default-ON semantics, absent = default-on, and they would be silently
 * re-enabled through the flip. If the disclosure marker is set (proving they
 * went through the old opt-in flow), promote absent → explicit '0'.
 *
 * Genuine fresh installs (no disclosure marker) are left alone — they get the
 * default-on experience and see the new first-run card.
 *
 * Idempotent, I3-guarded (a decoy session must not migrate anything).
 */
export function migrateFastpathState() {
  if (isDeniabilityOrDemoActive()) return;
  if (!hasFastpathBeenExplicitlySet() && hasSeenFastpathDisclosure()) {
    safeSet(FASTPATH_ENABLED_STORAGE_KEY, OFF);
  }
  // #2037 follow-up — repair the "Fast Unlock ON, Biometric Unlock OFF"
  // state a user could reach before the two toggles were linked. Both
  // preferences flip together on enable now, so a fresh install cannot
  // land there; existing installs get flipped forward here. Pure
  // preference flip (Shape A) — the actual password cache warms on the
  // next successful PIN unlock via the pref-gated path in
  // WalletProvider.unlock(). Asymmetric: fastpath OFF does NOT touch the
  // biometric-unlock pref (they are independent user-facing features).
  if (isFastpathEnabled() && !isBiometricUnlockEnabled()) {
    setBiometricUnlockEnabled(true);
  }
}

/**
 * Enable Fast Unlock AND Biometric Unlock in one call (#2037 follow-up).
 * FastpathToggle's enable path routes through here so a user cannot end
 * up with Fast Unlock on while Biometric Unlock is off — the exact state
 * that produced the user-reported "Biometric unlock didn't work" failure.
 * Pure preference flip on both; both setters are individually I3-guarded,
 * this helper additionally short-circuits at the top for clarity.
 */
export function enableFastpathAndBiometricUnlock() {
  if (isDeniabilityOrDemoActive()) return;
  setFastpathEnabled(true);
  setBiometricUnlockEnabled(true);
  // The wrapped-DEK cache populate path (populateFastpathBestEffort in
  // wallet-core/keystore/native.js) gates on hasSeenFastpathDisclosure() as
  // the informed-consent chokepoint from the default-ON reversal. Any UI
  // path that reaches this helper HAS asked the user, so mark the disclosure
  // seen here — otherwise the cache never warms and every unlock falls back
  // to the slow-path Argon2 KDF (~1.5s), silently defeating the whole point.
  //
  // Regression from the FastUnlockFirstRunCard removal (#2128) → BiometricConsent
  // migration (#2129): the old card called markFastpathDisclosureSeen() at its
  // click site; the new consent screen forgot, so on-device unlocks measured
  // ~5s post-tap instead of the expected ~200ms fast-path.
  markFastpathDisclosureSeen();
}

// Run the migration at import time so any consumer of isFastpathEnabled sees
// the corrected state before its first read. Cheap: bounded to two reads +
// zero-or-one write, all I3-guarded.
try { migrateFastpathState(); } catch { /* best-effort */ }

/**
 * Pure helper — decide whether the "one-time setup — faster next time" hint
 * should render alongside the PIN unlock busy state. All three inputs must be
 * present: (1) Android platform (fastpath is Android-only), (2) opt-in ON,
 * and (3) the wrapped-DEK cache is empty (a slow-path populate is about to
 * run and fill it, so subsequent unlocks can take the fast path).
 *
 * @param {{ platform: string, enabled: boolean, existingCacheValue: any }} args
 * @returns {boolean}
 */
export function shouldShowFastpathWarmingHint({ platform, enabled, existingCacheValue }) {
  if (platform !== 'android') return false;
  if (!enabled) return false;
  if (existingCacheValue == null || existingCacheValue === '') return true;
  return false;
}
