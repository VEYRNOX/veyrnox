// @ts-nocheck
// lib/fastpathUnlock.js — opt-in gate + disclosure marker for the KEK
// fast-path DEK cache (issue #2019, docs/kek-fast-path-design.md).
//
// Owner rulings this file encodes:
//   Q3 — OFF by default. New Settings toggle "Fast unlock — uses Face ID/
//        fingerprint without PIN". Enabling shows a one-time disclosure card.
//        Toggle lives in Security settings.
//   I3 — decoy/demo sessions must NOT flip the real user's answer OR leave a
//        persistent tell that the real session ever visited Security.
//        Guarded at the WRITE (setter), NOT at the read call sites — same
//        three-writer trap discipline as lib/consent.js (see its 2026-07-27
//        history in CLAUDE.md; consent had three writers, one landed
//        unguarded).
//
// Panic-wipe: FASTPATH_ENABLED_STORAGE_KEY is listed in
// wallet-core/panic.js METADATA_RESIDUE_KEYS so ALL_RESIDUE_KEYS both erases
// it AND accounts for it in inspectKeyMaterial(). A rename here MUST update
// panic.js in the same commit (regression pinned by
// panic-residue-fastpath.test.js).

import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

/** Storage key mirrored in wallet-core/panic.js METADATA_RESIDUE_KEYS. */
export const FASTPATH_ENABLED_STORAGE_KEY = 'veyrnox-fastpath-enabled';

/** Marker asserting the disclosure card was shown at least once. */
export const FASTPATH_DISCLOSURE_SEEN_KEY = 'veyrnox-fastpath-disclosure-seen';

// Exact enable marker. Reads default OFF for anything else so a partial
// migration or typo cannot silently enable the fast-path (fail-closed
// default, per I4 and Q3 "off by default").
const ENABLE_MARK = '1';

function safeGet(key) {
  try { return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null; }
  catch { return null; }
}

function safeSet(key, value) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value); }
  catch { /* ignore */ }
}

function safeRemove(key) {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(key); }
  catch { /* ignore */ }
}

/**
 * Whether the user has opted in to the fast unlock path.
 * Read-only, ungated (reading a localStorage key leaves no trace).
 */
export function isFastpathEnabled() {
  return safeGet(FASTPATH_ENABLED_STORAGE_KEY) === ENABLE_MARK;
}

/**
 * Flip the opt-in toggle. NO-OP in decoy/demo — a coerced tap must not be
 * able to modify the real user's answer (I3).
 */
export function setFastpathEnabled(enabled) {
  if (isDeniabilityOrDemoActive()) return;
  if (enabled) safeSet(FASTPATH_ENABLED_STORAGE_KEY, ENABLE_MARK);
  else safeRemove(FASTPATH_ENABLED_STORAGE_KEY);
}

/**
 * Whether the one-time disclosure card has been acknowledged. Read-only.
 */
export function hasSeenFastpathDisclosure() {
  return safeGet(FASTPATH_DISCLOSURE_SEEN_KEY) === ENABLE_MARK;
}

/**
 * Record that the disclosure card was shown to the user. NO-OP in
 * decoy/demo (I3, same discipline as setFastpathEnabled above).
 */
export function markFastpathDisclosureSeen() {
  if (isDeniabilityOrDemoActive()) return;
  safeSet(FASTPATH_DISCLOSURE_SEEN_KEY, ENABLE_MARK);
}
