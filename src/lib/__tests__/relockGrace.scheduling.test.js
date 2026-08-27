// lib/__tests__/relockGrace.scheduling.test.js
//
// Configurable grace window that defers lock() on brief screen-off events.
// Owner ruling: default OFF (0 s), user opts in with 10 s / 30 s / 60 s / 5 min.
// Screen-off is the ONLY reason that gets grace; everything else
// (duress/panic/deniability/RASP-WARN/explicit user lock/app-switch) locks now.
// I3: decoy/demo sessions ALWAYS lock immediately AND never write the setting.
// I4: any error in the scheduling path locks immediately.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import {
  RELOCK_GRACE_STORAGE_KEY,
  RELOCK_GRACE_OPTIONS_MS,
  getRelockGraceMs,
  setRelockGraceMs,
  scheduleLock,
  cancelPendingLock,
  forceLockNow,
  __resetRelockGraceForTests,
} from '../relockGrace.js';

describe('relockGrace — persistence + defaults', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(false);
    __resetRelockGraceForTests();
  });

  it('exports the storage key so panic.js can sweep it (I3 residue)', () => {
    expect(RELOCK_GRACE_STORAGE_KEY).toBe('veyrnox-relock-grace-ms');
  });

  it('exports the allowed durations (Immediate + 10s/30s/60s/5min)', () => {
    expect(RELOCK_GRACE_OPTIONS_MS).toEqual([0, 10_000, 30_000, 60_000, 300_000]);
  });

  it('defaults to 0 (immediate re-lock) when nothing is stored', () => {
    expect(getRelockGraceMs()).toBe(0);
  });

  it('setRelockGraceMs persists an allowed value', () => {
    setRelockGraceMs(10_000);
    expect(getRelockGraceMs()).toBe(10_000);
  });

  it('rejects values outside the allowlist (fail-closed: read back as 0)', () => {
    setRelockGraceMs(999_999);
    expect(getRelockGraceMs()).toBe(0);
    setRelockGraceMs(-1);
    expect(getRelockGraceMs()).toBe(0);
    setRelockGraceMs('10s');
    expect(getRelockGraceMs()).toBe(0);
  });

  it('setRelockGraceMs is a NO-OP in decoy/demo (I3)', () => {
    setRelockGraceMs(30_000);
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    setRelockGraceMs(300_000);
    // read from storage directly to bypass any getter I3-suppression
    expect(localStorage.getItem(RELOCK_GRACE_STORAGE_KEY)).toBe('30000');
  });

  it('getRelockGraceMs reads 0 in decoy/demo regardless of stored value (I3)', () => {
    setRelockGraceMs(60_000);
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    expect(getRelockGraceMs()).toBe(0);
  });
});

describe('relockGrace — scheduleLock / cancelPendingLock / forceLockNow', () => {
  let lock;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(false);
    __resetRelockGraceForTests();
    lock = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('grace=0 → scheduleLock("screen-off") locks immediately', () => {
    scheduleLock('screen-off', lock);
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('grace=10s → scheduleLock("screen-off") defers; cancel before expiry keeps unlocked', () => {
    setRelockGraceMs(10_000);
    scheduleLock('screen-off', lock);
    expect(lock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(9_999);
    cancelPendingLock();
    vi.advanceTimersByTime(60_000);
    expect(lock).not.toHaveBeenCalled();
  });

  it('grace=10s → scheduleLock("screen-off") fires lock after expiry with no cancel', () => {
    setRelockGraceMs(10_000);
    scheduleLock('screen-off', lock);
    vi.advanceTimersByTime(10_000);
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('any non-screen-off reason locks immediately (no timer scheduled)', () => {
    setRelockGraceMs(60_000);
    scheduleLock('foreground-lost', lock);
    expect(lock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(lock).toHaveBeenCalledTimes(1); // still just one
  });

  it('forceLockNow("duress") fires lock immediately AND cancels any pending grace', () => {
    setRelockGraceMs(60_000);
    scheduleLock('screen-off', lock);
    expect(lock).not.toHaveBeenCalled();
    forceLockNow('duress', lock);
    expect(lock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(120_000);
    expect(lock).toHaveBeenCalledTimes(1); // pending grace was cancelled
  });

  it('forceLockNow("panic") fires lock immediately AND cancels any pending grace', () => {
    setRelockGraceMs(60_000);
    scheduleLock('screen-off', lock);
    forceLockNow('panic', lock);
    vi.advanceTimersByTime(120_000);
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('decoy/demo: ALL paths lock immediately, no timer, no write to setting', () => {
    setRelockGraceMs(60_000);
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);

    scheduleLock('screen-off', lock);
    expect(lock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(120_000);
    expect(lock).toHaveBeenCalledTimes(1); // no deferred fire

    setRelockGraceMs(300_000);
    expect(localStorage.getItem('veyrnox-relock-grace-ms')).toBe('60000');
  });

  it('a repeat scheduleLock while one is pending does not stack (idempotent)', () => {
    setRelockGraceMs(10_000);
    scheduleLock('screen-off', lock);
    scheduleLock('screen-off', lock);
    scheduleLock('screen-off', lock);
    vi.advanceTimersByTime(10_000);
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('I4 fail-closed: if the timer scheduling throws, lock() fires immediately', () => {
    setRelockGraceMs(10_000);
    const orig = globalThis.setTimeout;
    // @ts-ignore
    globalThis.setTimeout = () => { throw new Error('setTimeout unavailable'); };
    try {
      scheduleLock('screen-off', lock);
      expect(lock).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.setTimeout = orig;
    }
  });
});
