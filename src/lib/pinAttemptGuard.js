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
// must never prevent reaching attempt 10 (the caller checks shouldWipe regardless of
// any remaining backoff window).
export function pinBackoffMs(attempts) {
  if (attempts >= 7) return 5 * 60 * 1000;
  if (attempts >= 5) return 30 * 1000;
  if (attempts >= 3) return 5 * 1000;
  return 0;
}

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
