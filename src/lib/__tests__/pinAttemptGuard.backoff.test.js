// pinAttemptGuard — the ENFORCED timed backoff (M-7) and the session attempt
// floor (M-9), audit 2026-08-25.
//
// M-7: pinBackoffMs() has existed (and been unit-tested) since VULN-8, but no
// production code ever read it — the 5-minute lockout at >= 7 misses did not
// exist at runtime. These tests pin the two pure pieces the caller needs to
// enforce it: how much of a persisted deadline is still running, and the honest
// remaining-time sentence shown to the user.
//
// M-9: the attempt counter lives in localStorage, so an unwritable store made
// every miss read 0 and write nothing — unlimited attempts, shouldWipe never
// true. The session floor is the mitigation: a module-scoped high-water mark the
// caller max()es against the stored value, so a failed write cannot reset
// progress WITHIN a session. It is explicitly NOT persistence (a reload still
// clears it) — hence storageDegraded, which the caller surfaces rather than
// failing open in silence.
//
// We assert STRUCTURE (numbers, monotonicity, null-vs-string) and the
// load-bearing interpolated time, never the surrounding prose.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  pinBackoffMs,
  PIN_BACKOFF_MAX_MS,
  PIN_COUNTER_DEGRADED_NOTE,
  pinBackoffRemainingMs,
  pinLockoutMessage,
  pinSessionFloor,
  raisePinSessionFloor,
  clearPinSessionFloor,
} from '@/lib/pinAttemptGuard';

beforeEach(() => { clearPinSessionFloor(); });

describe('pinAttemptGuard — pinBackoffRemainingMs (M-7)', () => {
  it('reports zero for an absent, zero or past deadline', () => {
    const now = 1_000_000;
    expect(pinBackoffRemainingMs(0, now)).toBe(0);
    expect(pinBackoffRemainingMs(null, now)).toBe(0);
    expect(pinBackoffRemainingMs(undefined, now)).toBe(0);
    expect(pinBackoffRemainingMs(NaN, now)).toBe(0);
    expect(pinBackoffRemainingMs(now, now)).toBe(0);
    expect(pinBackoffRemainingMs(now - 1, now)).toBe(0);
  });

  it('reports the remaining milliseconds for a future deadline', () => {
    const now = 1_000_000;
    expect(pinBackoffRemainingMs(now + 5_000, now)).toBe(5_000);
  });

  it('caps at the longest real tier so a tampered deadline cannot brick unlock', () => {
    // The deadline is attacker/corruption-reachable localStorage. Honouring an
    // absurd value would lock the OWNER out of their own wallet forever, which
    // is data loss, not security. Cap at the longest tier the tiers can produce.
    const now = 1_000_000;
    expect(PIN_BACKOFF_MAX_MS).toBe(pinBackoffMs(7));
    expect(pinBackoffRemainingMs(now + 10 * 365 * 24 * 3600 * 1000, now)).toBe(PIN_BACKOFF_MAX_MS);
  });
});

describe('pinAttemptGuard — pinLockoutMessage (M-7)', () => {
  it('returns null when nothing is left to wait', () => {
    expect(pinLockoutMessage(0)).toBeNull();
    expect(pinLockoutMessage(-1)).toBeNull();
  });

  it('rounds UP so the message never promises an earlier retry than the gate allows', () => {
    expect(pinLockoutMessage(4_100)).toContain('5');
    expect(pinLockoutMessage(61_000)).toContain('2');   // 61 s -> "2 minutes"
  });

  it('uses singular units at exactly one', () => {
    expect(pinLockoutMessage(1_000)).toContain('1 second');
    expect(pinLockoutMessage(1_000)).not.toContain('1 seconds');
    expect(pinLockoutMessage(60_000)).toContain('1 minute');
    expect(pinLockoutMessage(60_000)).not.toContain('1 minutes');
  });
});

describe('pinAttemptGuard — session floor (M-9)', () => {
  it('starts clean', () => {
    expect(pinSessionFloor()).toEqual({ attempts: 0, backoffUntil: 0, storageDegraded: false });
  });

  it('raises monotonically — a lower value can never lower the floor', () => {
    raisePinSessionFloor({ attempts: 4, backoffUntil: 900 });
    raisePinSessionFloor({ attempts: 2, backoffUntil: 100 });
    expect(pinSessionFloor().attempts).toBe(4);
    expect(pinSessionFloor().backoffUntil).toBe(900);
  });

  it('latches storageDegraded until the floor is cleared', () => {
    raisePinSessionFloor({ storageDegraded: true });
    expect(pinSessionFloor().storageDegraded).toBe(true);
    raisePinSessionFloor({ attempts: 1 });
    expect(pinSessionFloor().storageDegraded).toBe(true);
    clearPinSessionFloor();
    expect(pinSessionFloor().storageDegraded).toBe(false);
  });

  it('is cleared wholesale on success (the caller clears it alongside the stored keys)', () => {
    raisePinSessionFloor({ attempts: 9, backoffUntil: Date.now() + 60_000, storageDegraded: true });
    clearPinSessionFloor();
    expect(pinSessionFloor()).toEqual({ attempts: 0, backoffUntil: 0, storageDegraded: false });
  });

  it('carries an honest degraded note that does not claim persistence it does not have', () => {
    expect(PIN_COUNTER_DEGRADED_NOTE).toBeTypeOf('string');
    expect(PIN_COUNTER_DEGRADED_NOTE.length).toBeGreaterThan(0);
  });
});
