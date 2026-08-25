// lib/pinAttemptGuard.js
//
// The PIN failed-attempt decision core (target item 5a). Pure functions — no React,
// no storage, no crypto — so the security-critical counter→wipe contract is
// unit-tested directly (the codebase's "pure helpers + unit tests" pattern). The
// component (WalletEntry.runPinUnlock) owns the side effects: it persists the count
// in localStorage (so a reload can't reset it) and, when this helper says to, calls
// the REAL provider panicWipe({ confirmed: true }) — the irreversible local wipe in
// wallet-core/panic.js. This module only decides; it never wipes.
//
// THREAT MODEL / HONEST LIMIT (for the audit): the counter lives in localStorage,
// which a determined attacker with the seized device could clear out-of-band to
// dodge the wipe — this is a SOFTWARE attempt-limit, not hardware-enforced
// tamper-proof attempt counting (no Secure Enclave attempt sealing on this
// platform). It raises the cost of online/over-the-shoulder guessing and gives the
// owner an auto-destruct on a lost/stolen device; it is NOT a substitute for the
// Argon2id offline cost or for planned hardware binding. Accepted software limit.
//
// A wrong PIN THROWS (Part 1: the Option-A decoy fallback was removed). A SUCCESSFUL
// unlock — real PIN, a duress PIN (→ decoy), or a panic PIN (→ its own wipe) — does
// NOT throw, so it never reaches this guard; the caller resets the counter to 0 on
// success. Genuine infra/biometric-gate failures are classified out by the caller
// and must NOT be passed here (don't count an infra error toward the wipe).

// Hard stop: after this many CONSECUTIVE wrong-PIN misses, panic-wipe the device.
export const PIN_WIPE_AFTER = 10;

// Start the iOS-style "N attempts before this device is wiped" warning once the
// user has missed this many times (i.e. they are within PIN_WIPE_AFTER - PIN_WIPE_WARN_AT
// of the wipe). 6 → warn for the final four attempts.
export const PIN_WIPE_WARN_AT = 6;

// Timed backoff tiers (unchanged from the prior VULN-8 rate-limit): a soft delay on
// top of Argon2id. The wipe is the HARD stop and is independent of this — backoff
// must never prevent reaching attempt 10. It DELAYS the tenth attempt; it never
// suppresses it, because the lockout is checked BEFORE an attempt is spent and the
// counter survives the wait (the caller acts on shouldWipe for whatever attempt does
// run).
//
// M-7 (audit 2026-08-25): these tiers existed and were unit-tested from the day they
// landed, but nothing in production ever read the value — runPinUnlock destructured
// `backoffMs` away, so the 5-minute lockout did not exist at runtime. The helpers
// below are what the caller needs to actually enforce it: WalletEntry persists
// `Date.now() + backoffMs` and refuses a submission while the deadline is running.
export function pinBackoffMs(attempts) {
  if (attempts >= 7) return 5 * 60 * 1000;
  if (attempts >= 5) return 30 * 1000;
  if (attempts >= 3) return 5 * 1000;
  return 0;
}

// The longest lockout the tiers can produce. Also the CEILING applied to a persisted
// deadline: that deadline lives in localStorage, so corruption or tampering could set
// it years out. Honouring such a value locks the OWNER out of their own wallet with
// no recovery — data loss wearing a security costume. Clamping keeps the real control
// intact (an attacker still cannot shorten a live lockout) while bounding the damage.
export const PIN_BACKOFF_MAX_MS = 5 * 60 * 1000;

/**
 * How much of a persisted lockout deadline is still running, clamped to
 * [0, PIN_BACKOFF_MAX_MS]. Absent/garbage/past deadlines are simply "not locked out"
 * — the deadline is a DELAY, not the attempt limit, so an unreadable one must not
 * become an unbounded lock (the wipe counter is the control that fails closed).
 *
 * @param {number|null|undefined} untilTs  epoch ms the lockout ends
 * @param {number} [now]
 * @returns {number} remaining ms (0 when not locked out)
 */
export function pinBackoffRemainingMs(untilTs, now = Date.now()) {
  const until = Number(untilTs);
  if (!Number.isFinite(until)) return 0;
  const remaining = until - now;
  if (!(remaining > 0)) return 0;
  return Math.min(remaining, PIN_BACKOFF_MAX_MS);
}

/**
 * The honest lockout sentence, or null when there is nothing left to wait. Rounds UP
 * so the message can never promise an earlier retry than the gate will actually
 * allow (a message that under-states the wait reads as a broken button).
 *
 * @param {number} remainingMs
 * @returns {string|null}
 */
export function pinLockoutMessage(remainingMs) {
  const secs = Math.ceil(Math.max(0, Number(remainingMs) || 0) / 1000);
  if (secs <= 0) return null;
  if (secs < 60) {
    return `Too many incorrect PINs. Try again in ${secs} second${secs === 1 ? '' : 's'}.`;
  }
  const mins = Math.ceil(secs / 60);
  return `Too many incorrect PINs. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`;
}

// ── SESSION FLOOR (M-9, audit 2026-08-25) ────────────────────────────────────
// Deliberately STATEFUL, in a module whose header promises purity — so here is the
// reason it earns the exception.
//
// The attempt counter and the lockout deadline live in localStorage, and BOTH access
// paths swallowed their exception with no fallback. Under an unwritable store every
// miss read 0 and wrote nothing: unlimited attempts, shouldWipe never true, no signal
// anywhere. That is a fail-OPEN in the one control that makes the wrong-PIN oracle
// survivable.
//
// This is a session-scoped high-water mark the caller max()es the stored value
// against, so a failed write cannot reset progress WITHIN a session. State it
// plainly: it is NOT persistence. A reload, a tab close or an app restart clears it,
// which is exactly the bypass the disclosed threat model already covers (a determined
// attacker with the seized device can clear the key out-of-band anyway). What it
// removes is the SILENT version of that bypass — hence storageDegraded, which the
// caller surfaces to the user rather than pretending a durable limit exists.
let sessionFloor = { attempts: 0, backoffUntil: 0, storageDegraded: false };

/** @returns {{ attempts: number, backoffUntil: number, storageDegraded: boolean }} */
export function pinSessionFloor() {
  return { ...sessionFloor };
}

/**
 * Raise the floor. MONOTONIC by construction: a lower attempts/backoffUntil is
 * ignored and storageDegraded latches, so no caller ordering can walk the floor
 * back down. Only clearPinSessionFloor() lowers it.
 *
 * @param {{ attempts?: number, backoffUntil?: number, storageDegraded?: boolean }} patch
 */
export function raisePinSessionFloor(patch = {}) {
  const attempts = Number(patch.attempts);
  const backoffUntil = Number(patch.backoffUntil);
  sessionFloor = {
    attempts: Number.isFinite(attempts) ? Math.max(sessionFloor.attempts, attempts) : sessionFloor.attempts,
    backoffUntil: Number.isFinite(backoffUntil)
      ? Math.max(sessionFloor.backoffUntil, backoffUntil)
      : sessionFloor.backoffUntil,
    storageDegraded: sessionFloor.storageDegraded || patch.storageDegraded === true,
  };
  return pinSessionFloor();
}

/** Reset the floor. Called on a SUCCESSFUL unlock, alongside clearing the stored keys. */
export function clearPinSessionFloor() {
  sessionFloor = { attempts: 0, backoffUntil: 0, storageDegraded: false };
}

// Shown alongside the incorrect-PIN error when the store could not be written. Says
// what is true and nothing more: the limit still applies, but only for this session.
export const PIN_COUNTER_DEGRADED_NOTE =
  "This device couldn't save the attempt count, so the limit only holds until the app closes.";

/**
 * Register one wrong-PIN miss on top of `prevAttempts` and return the resulting
 * decision. Pure: the caller persists `attempts` and acts on `shouldWipe`.
 *
 * @param {number} prevAttempts  consecutive misses BEFORE this one (>= 0)
 * @returns {{ attempts: number, shouldWipe: boolean, backoffMs: number }}
 */
export function registerFailedPinAttempt(prevAttempts) {
  const prev = Number.isFinite(prevAttempts) && prevAttempts > 0 ? Math.floor(prevAttempts) : 0;
  const attempts = prev + 1;
  return {
    attempts,
    // >= (not ===) so a tampered/over-count count can never slip PAST the threshold
    // un-wiped. Fail closed toward the wipe at/after the limit.
    shouldWipe: attempts >= PIN_WIPE_AFTER,
    backoffMs: pinBackoffMs(attempts),
  };
}

/**
 * The iOS-style inline warning for `attempts` consecutive misses, or null when the
 * user is not yet close enough to warn. Honest + calm: it states how many attempts
 * remain before THIS DEVICE is wiped, with correct singular/plural.
 *
 * @param {number} attempts  consecutive misses so far (>= 0)
 * @returns {string|null}
 */
export function pinAttemptWarning(attempts) {
  const a = Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 0;
  if (a < PIN_WIPE_WARN_AT) return null;
  const remaining = Math.max(0, PIN_WIPE_AFTER - a);
  const noun = remaining === 1 ? 'attempt' : 'attempts';
  return `Incorrect PIN. ${remaining} ${noun} before this device is wiped.`;
}
