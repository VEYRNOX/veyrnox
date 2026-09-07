// src/lib/__tests__/unlockTimingEqualizer.m4Ordering.test.jsx
//
// Audit 2026-09-07 M-4 — the equalizer must be equal in TIME-TO-VISIBLE-OUTCOME,
// not merely in KDF count.
//
// THE DEFECT. The miss path ran `await captureVerifierSafe(password)` BEFORE
// throwing, while the success path sets unlocked state and spends the same
// capture afterwards (React flushes the pending render at that first yield, so
// the dashboard paints while Argon2id runs). Equal count, unequal observable: the
// failure appeared one whole Argon2id later than the success did. At 96 MiB / t=6
// that is the same order of magnitude H-1 exists to flatten, and a shoulder-
// surfing attacker's stopwatch stops at the SCREEN, not at promise resolution.
//
// WHY A NEW FILE RATHER THAN EXTENDING unlockTimingEqualizer.h1.test.jsx: that
// suite mocks `captureVerifierSafe` to `async () => null`, so the fifth
// derivation never enters its argon2id ledger at all. Its success/miss count
// parity therefore holds whether or not the equalizing call exists — verified by
// deleting the call and watching it stay green. It pins the four REAL KDFs well;
// it simply cannot see this one. That is not a criticism of it, it is the reason
// M-4 survived two audits: the test that looked like it covered this could not.
//
// WHAT THIS PINS INSTEAD, deterministically and with no wall-clock measurement:
//   1. ORDERING — with the capture held open, unlock() still rejects. If the call
//      is awaited again, the rejection cannot arrive until the capture settles,
//      and the test times out / fails.
//   2. PARITY — the capture is still INVOKED on the miss path, so making it
//      fire-and-forget did not quietly delete the equalizing work.
// Both are mutation-checked; see the note at the foot of this file.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

// A capture we can hold open, so "did the throw wait for this?" is a fact rather
// than a stopwatch reading.
const capture = vi.hoisted(() => {
  let release;
  const gate = new Promise((r) => { release = r; });
  return { fn: vi.fn(() => gate.then(() => null)), release: () => release(), calls: () => capture.fn.mock.calls.length };
});

vi.mock('@/wallet-core/credentialVerifier', () => ({
  captureVerifierSafe: (...a) => capture.fn(...a),
  verifyCredential: vi.fn(async () => false),
  verifyCredentialDetailed: vi.fn(async () => ({ ok: false, reason: 'mocked' })),
  createCredentialVerifier: vi.fn(async () => null),
}));

const PRIMARY_PW = 'correct-horse-battery-staple-pin';

vi.mock('@/wallet-core/keystore', () => {
  const PRIMARY = 'correct-horse-battery-staple-pin';
  const MNEMONIC =
    'legal winner thank year wave sausage worth useful legal winner thank yellow';
  const ks = {
    async hasVault() { return true; },
    async hasVaultKekWrap() { return false; },
    async unlock(password) {
      if (password === PRIMARY) return MNEMONIC;
      throw new Error('wrong password');
    },
    async saveVaultContents() {},
    getHardwareFactor: async () => new Uint8Array(32),
    async createVault() {},
    async changePassword() {},
    lock() {},
    async clearVault() {},
    setLockHook() {},
    downgradeFromHardwareWrap: async () => {},
  };
  return {
    getKeyStore: () => ks,
    webKeyStore: ks,
    withLockSuppressed: (fn) => Promise.resolve().then(fn),
  };
});

import { clearDuressVault } from '@/wallet-core/duress';
import { clearPanicVault } from '@/wallet-core/panic';
import { wipeStealthPool, ensureStealthPool } from '@/wallet-core/stealth';
import { WalletProvider, useWallet } from '@/lib/WalletProvider';

let ctx;
function Capture() { ctx = useWallet(); return null; }

beforeEach(async () => {
  try { localStorage.clear(); } catch { /* shimmed */ }
  await wipeStealthPool();
  await clearDuressVault();
  await clearPanicVault();
  capture.fn.mockClear();
  await act(async () => {
    render(<WalletProvider><Capture /></WalletProvider>);
  });
  await ensureStealthPool();
});
afterEach(() => { capture.release(); cleanup(); });

describe('unlock equalizer — the miss surfaces BEFORE the equalizing KDF (audit M-4)', () => {
  it('rejects while the verifier capture is still outstanding', async () => {
    // The capture never settles during this test. If the miss path awaits it, the
    // rejection cannot arrive and this fails; the whole point is that it does.
    let rejected = false;
    await act(async () => {
      await ctx.unlock('totally-wrong-guess-0000').catch(() => { rejected = true; });
    });
    expect(rejected).toBe(true);
  });

  it('still SPENDS the equalizing capture on the miss path', async () => {
    // Ordering without parity would be a regression, not a fix: dropping the call
    // would make a miss cheaper than a hit and hand back the timing oracle H-1
    // removed. `void` keeps the work, it only stops awaiting it.
    await act(async () => {
      await ctx.unlock('totally-wrong-guess-0000').catch(() => {});
    });
    expect(capture.fn).toHaveBeenCalled();
  });

  it('passes the entered credential to the equalizing capture, not a placeholder', async () => {
    // A capture invoked with the wrong input would spend a KDF of the right shape
    // but not the right cost profile on a legacy-param device.
    await act(async () => {
      await ctx.unlock('totally-wrong-guess-0000').catch(() => {});
    });
    expect(capture.fn.mock.calls.at(-1)?.[0]).toBe('totally-wrong-guess-0000');
  });

  it('the success path is unaffected — it unlocks with the capture still open', async () => {
    // Bidirectional. Success has always spent its capture after the visible
    // outcome; if that ever changed to an await, this would hang here too.
    await act(async () => {
      await ctx.unlock(PRIMARY_PW);
    });
    expect(ctx.isUnlocked).toBe(true);
  });
});

// MUTATION-CHECKED 2026-09-07, both directions:
//   `void captureVerifierSafe(password)` → `await captureVerifierSafe(password)`
//        reds the ordering case (the rejection never arrives).
//   delete the call entirely
//        reds the parity + argument cases, ordering stays green.
// Re-run both if you touch the miss branch. A green run here with the `await`
// restored would mean the gate is no longer being held open.
