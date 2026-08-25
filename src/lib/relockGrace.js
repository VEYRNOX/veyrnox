// @ts-nocheck
// lib/relockGrace.js — configurable grace window that defers WalletProvider
// lock() on brief screen-off events. Owner ruling (branch
// claude/unlock-grace-window):
//   - Default OFF (0 s grace) — behaviour unchanged unless the user opts in.
//   - Allowed values: 0, 10s, 30s, 60s, 5 min. Nothing else.
//   - Grace applies ONLY to reason='screen-off'. Every other lock cause
//     (duress/panic/deniability/RASP-WARN/explicit user lock/app switched to
//     another app) MUST call forceLockNow — never scheduleLock.
//   - I3: decoy/demo sessions always lock immediately AND never write the
//     setting. Same three-writer discipline as lib/consent.js and
//     lib/fastpathUnlock.js — guarded at the WRITE and at the READ, since the
//     read result gates a security-relevant deferral.
//   - I4: any error in the scheduling path (missing setTimeout, thrown
//     handler) locks immediately.
//
// Panic-wipe: RELOCK_GRACE_STORAGE_KEY + RELOCK_GRACE_DISCLOSED_KEY are
// listed in wallet-core/panic.js METADATA_RESIDUE_KEYS so ALL_RESIDUE_KEYS
// both erases them AND accounts for them in inspectKeyMaterial(). A rename
// here MUST update panic.js in the same commit (regression pinned by
// panic-residue-grace.test.js).

import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

/** Storage key mirrored in wallet-core/panic.js METADATA_RESIDUE_KEYS. */
export const RELOCK_GRACE_STORAGE_KEY = 'veyrnox-relock-grace-ms';
/** One-time "I understand this widens the OS-lock window" disclosure marker. */
export const RELOCK_GRACE_DISCLOSED_KEY = 'veyrnox-relock-grace-disclosed';

/**
 * Allowed durations in ms. 0 = today's immediate-lock behaviour (default).
 * The UI renders exactly these five choices; the setter fail-closes any
 * value not in this list to 0 so a typo/rogue writer cannot smuggle a
 * longer grace than the owner ruling.
 */
export const RELOCK_GRACE_OPTIONS_MS = Object.freeze([
  0,
  10_000,
  30_000,
  60_000,
  300_000,
]);

const ALLOWED = new Set(RELOCK_GRACE_OPTIONS_MS);

// Module-level pending timer. There is exactly ONE per app process — a repeat
// scheduleLock while pending is idempotent (does not stack).
let pendingLockTimer = null;

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
 * Configured grace window in ms. Returns 0 (immediate) when:
 *   - nothing is stored;
 *   - the stored value is not in the allowlist (fail-closed);
 *   - the session is a decoy/demo (I3 — decoy must never DEFER a lock,
 *     because a delayed lock is itself a state signal to a coercing
 *     attacker who knows the real session's setting).
 */
export function getRelockGraceMs() {
  if (isDeniabilityOrDemoActive()) return 0;
  const raw = safeGet(RELOCK_GRACE_STORAGE_KEY);
  if (raw == null) return 0;
  const n = Number(raw);
  return ALLOWED.has(n) ? n : 0;
}

/**
 * Persist an allowed grace duration. NO-OP in decoy/demo (I3) and NO-OP
 * for any value not in RELOCK_GRACE_OPTIONS_MS (owner-approved list).
 * Writing 0 removes the key so a wiped device is indistinguishable from
 * one that never opted in.
 */
export function setRelockGraceMs(ms) {
  if (isDeniabilityOrDemoActive()) return;
  if (typeof ms !== 'number' || !ALLOWED.has(ms)) return;
  if (ms === 0) safeRemove(RELOCK_GRACE_STORAGE_KEY);
  else safeSet(RELOCK_GRACE_STORAGE_KEY, String(ms));
}

/** Whether the one-time disclosure card has been acknowledged. Read-only. */
export function hasSeenRelockGraceDisclosure() {
  return safeGet(RELOCK_GRACE_DISCLOSED_KEY) === '1';
}

/** Record disclosure acknowledgement. NO-OP in decoy/demo (I3). */
export function markRelockGraceDisclosureSeen() {
  if (isDeniabilityOrDemoActive()) return;
  safeSet(RELOCK_GRACE_DISCLOSED_KEY, '1');
}

/**
 * Cancel any pending deferred lock. Called on screen-on / app foreground —
 * safe to call when nothing is pending.
 */
export function cancelPendingLock() {
  if (pendingLockTimer != null) {
    try { clearTimeout(pendingLockTimer); } catch { /* ignore */ }
    pendingLockTimer = null;
  }
}

/**
 * Fire lock() NOW, cancelling any pending grace. This is the ONLY entry
 * point used by duress / panic / deniability-activation / RASP-WARN
 * escalation / explicit user lock / app-switched-to-another-app —
 * everything that must not benefit from the grace deferral. `reason` is
 * accepted for callers/audit-log symmetry but is not consulted here.
 */
export function forceLockNow(_reason, lockFn) {
  cancelPendingLock();
  try { lockFn(); } catch { /* fail-closed — caller handles logging */ }
}

/**
 * Schedule a lock. Grace ONLY applies when reason === 'screen-off' AND a
 * grace window is configured AND the session is real (I3). Everything else
 * locks immediately. Repeat calls while a timer is pending are idempotent.
 *
 * I4 fail-closed: if setTimeout itself throws (or is unavailable), lock now.
 */
export function scheduleLock(reason, lockFn) {
  // I3: decoy/demo sessions always lock immediately. getRelockGraceMs()
  // already returns 0 in that case; this early return is defence in depth.
  if (isDeniabilityOrDemoActive()) { lockFn(); return; }
  if (reason !== 'screen-off') { lockFn(); return; }

  const graceMs = getRelockGraceMs();
  if (graceMs <= 0) { lockFn(); return; }

  // Already scheduled — idempotent.
  if (pendingLockTimer != null) return;

  try {
    pendingLockTimer = setTimeout(() => {
      pendingLockTimer = null;
      try { lockFn(); } catch { /* fail-closed */ }
    }, graceMs);
  } catch {
    // I4: scheduling failed → lock now rather than silently drop.
    pendingLockTimer = null;
    try { lockFn(); } catch { /* ignore */ }
  }
}

/** Test-only: reset the module-level pending timer between cases. */
export function __resetRelockGraceForTests() {
  cancelPendingLock();
}
