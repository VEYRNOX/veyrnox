// lib/__tests__/duressPin.wrongAttempt.test.js
//
// Phase-1 gap: the WRONG-PIN -> increment-counter contract of the unlock router.
// The existing duressPin.test.js "rejects wrong PIN" scenario asserts only
// `wrongPin !== realPin` (tautological — it never calls routeUnlockByPin), and the
// counter is only exercised incidentally inside the "wipes at 10" loop. This pins
// the per-attempt behaviour directly:
//
//   - ONE wrong PIN increments 'duress-wrong-attempts' by EXACTLY 1 and throws
//     "PIN incorrect" WITHOUT wipeRequired (well below the 10 threshold). I4.
//   - consecutive wrong PINs accumulate (no reset between misses).
//   - a CORRECT PIN clears the counter (a near-miss streak doesn't strand the user
//     one wrong guess from a wipe after they finally get it right).
//   - a FAKE (duress) PIN hit ALSO clears the counter (a surrendered-decoy unlock
//     is a success, not a miss).
//
// Pure routing layer (lib/duressPin.js); hasDuressVault is mocked. We assert the
// machine contract (counter value, thrown flags), not prose.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/wallet-core/duress', () => ({
  hasDuressVault: vi.fn(async () => false),
}));

import { hasDuressVault } from '@/wallet-core/duress';
import {
  routeUnlockByPin, shouldWipeVault, resetH2State,
} from '@/lib/duressPin';

const counter = () => parseInt(localStorage.getItem('duress-wrong-attempts') || '0', 10);

beforeEach(() => {
  resetH2State();
  vi.clearAllMocks();
  hasDuressVault.mockResolvedValue(false);
});

describe('duressPin — wrong-PIN attempt counter', () => {
  it('increments the counter by exactly 1 on a single wrong PIN (and does not wipe)', async () => {
    expect(counter()).toBe(0);

    await expect(routeUnlockByPin('999999', '111111')).rejects.toThrow(/PIN incorrect/);

    expect(counter()).toBe(1);
    expect(shouldWipeVault()).toBe(false);
  });

  it('does NOT set wipeRequired on an early wrong attempt', async () => {
    let err;
    try { await routeUnlockByPin('000000', '111111'); } catch (e) { err = e; }
    expect(err).toBeTruthy();
    expect(err.wipeRequired).not.toBe(true);
  });

  it('accumulates consecutive wrong PINs without resetting', async () => {
    for (let i = 1; i <= 3; i++) {
      try { await routeUnlockByPin('999999', '111111'); } catch { /* expected */ }
      expect(counter()).toBe(i);
    }
  });

  it('a CORRECT PIN clears the accumulated wrong-attempt counter', async () => {
    try { await routeUnlockByPin('999999', '111111'); } catch { /* miss */ }
    try { await routeUnlockByPin('888888', '111111'); } catch { /* miss */ }
    expect(counter()).toBe(2);

    const ok = await routeUnlockByPin('111111', '111111');
    expect(ok.wallet).toBe('real');
    expect(counter()).toBe(0);
  });

  it('a FAKE (duress) PIN hit also clears the counter — a decoy unlock is a success', async () => {
    hasDuressVault.mockResolvedValue(true);
    localStorage.setItem('duress-fake-pin', '222222');

    try { await routeUnlockByPin('999999', '111111'); } catch { /* miss */ }
    expect(counter()).toBe(1);

    const decoy = await routeUnlockByPin('222222', '111111');
    expect(decoy.isDecoy).toBe(true);
    expect(counter()).toBe(0);
  });
});
