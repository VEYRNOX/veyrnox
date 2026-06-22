// Tests for the PIN failed-attempt guard (target item 5a): after PIN_WIPE_AFTER
// consecutive wrong-PIN misses, the device must trigger an irreversible local
// PANIC WIPE. Near the limit it warns iOS-style with the remaining count.
//
// This is the pure decision core extracted from WalletEntry.runPinUnlock so the
// security-critical counter→wipe contract is unit-tested directly (the codebase's
// "pure helpers + unit tests" pattern). The component wiring is thin: it persists
// the counter in localStorage, then calls the real provider panicWipe() when this
// helper says to. We assert machine STRUCTURE (shouldWipe / remaining / backoffMs),
// not prose copy, except the warning's interpolated count which is load-bearing.

import { describe, it, expect } from 'vitest';
import {
  PIN_WIPE_AFTER,
  PIN_WIPE_WARN_AT,
  registerFailedPinAttempt,
  pinAttemptWarning,
} from '@/lib/pinAttemptGuard';

describe('pinAttemptGuard — the 10-attempt wipe contract', () => {
  it('exposes a named threshold of 10', () => {
    expect(PIN_WIPE_AFTER).toBe(10);
  });

  it('does NOT wipe before the threshold', () => {
    for (let prev = 0; prev < PIN_WIPE_AFTER - 1; prev++) {
      const out = registerFailedPinAttempt(prev);
      expect(out.attempts).toBe(prev + 1);
      expect(out.shouldWipe).toBe(false);
    }
  });

  it('wipes EXACTLY when the count reaches the threshold (10th consecutive miss)', () => {
    // 9 prior misses + this one == 10 → wipe.
    const out = registerFailedPinAttempt(PIN_WIPE_AFTER - 1);
    expect(out.attempts).toBe(PIN_WIPE_AFTER);
    expect(out.shouldWipe).toBe(true);
  });

  it('still reports shouldWipe if somehow already at/over the threshold (no escape past it)', () => {
    const out = registerFailedPinAttempt(PIN_WIPE_AFTER);
    expect(out.shouldWipe).toBe(true);
  });

  it('keeps the timed backoff but never lets it gate reaching the wipe', () => {
    // backoff exists at the lower tiers...
    expect(registerFailedPinAttempt(2).backoffMs).toBeGreaterThan(0); // attempt 3
    expect(registerFailedPinAttempt(4).backoffMs).toBeGreaterThan(0); // attempt 5
    expect(registerFailedPinAttempt(6).backoffMs).toBeGreaterThan(0); // attempt 7
    // ...and the wiping attempt still wipes regardless of any backoff value.
    expect(registerFailedPinAttempt(PIN_WIPE_AFTER - 1).shouldWipe).toBe(true);
  });
});

describe('pinAttemptGuard — iOS-style warning copy', () => {
  it('does not warn well below the threshold', () => {
    expect(pinAttemptWarning(1)).toBeNull();
    expect(pinAttemptWarning(PIN_WIPE_WARN_AT - 1)).toBeNull();
  });

  it('warns at the warn threshold with the correct remaining count', () => {
    const remaining = PIN_WIPE_AFTER - PIN_WIPE_WARN_AT; // attempts remaining after this many misses
    const msg = pinAttemptWarning(PIN_WIPE_WARN_AT);
    expect(msg).toBeTypeOf('string');
    // The interpolated remaining-count is the load-bearing contract of the warning.
    expect(msg).toContain(String(remaining));
    expect(msg.toLowerCase()).toContain('wiped');
  });

  it('counts down: each further miss shows one fewer attempt remaining', () => {
    const at6 = pinAttemptWarning(6);
    const at7 = pinAttemptWarning(7);
    expect(at6).toContain(String(PIN_WIPE_AFTER - 6)); // 4
    expect(at7).toContain(String(PIN_WIPE_AFTER - 7)); // 3
  });

  it('warns "1 attempt" (singular) on the last attempt before wipe', () => {
    const msg = pinAttemptWarning(PIN_WIPE_AFTER - 1); // 9 → 1 remaining
    expect(msg).toContain('1 attempt');
    expect(msg).not.toContain('1 attempts');
  });
});
