// lib/__tests__/hiddenBalance-i3.test.js
//
// M-6: resolveHiddenBalance() performs a live node read (EVM/BTC/SOL) for a
// revealed hidden wallet. The I3 invariant (no egress in a deniability session)
// must be enforced on the EXPORTED function itself — not just on some callers —
// so a future caller can never leak network egress from inside a deniability
// session. This test pins that the function FAILS CLOSED (returns null) when a
// deniability session is active, mirroring the decoyBalance.js pattern.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Control the deniability-session flag per test.
const isDeniabilitySessionActive = vi.fn();
vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilitySessionActive: () => isDeniabilitySessionActive(),
  // Mirror the real helper (issue #1102): fail-closed OR of the session flag
  // and a LIVE read of localStorage['veyrnox-demo']. Reading localStorage live
  // lets the post-import flip test flip the flag AFTER module import.
  isDeniabilityOrDemoActive: () => {
    if (isDeniabilitySessionActive()) return true;
    try {
      return (
        typeof localStorage !== 'undefined' &&
        localStorage.getItem('veyrnox-demo') === '1'
      );
    } catch {
      return true;
    }
  },
}));

// Prove the guard runs BEFORE any node read: no provider read may be called when
// a deniability session is active.
const getBalanceEth = vi.fn(async () => '0.5');
const getBalanceSats = vi.fn(async () => '100000000');
const getBalanceSol = vi.fn(async () => '1');
vi.mock('@/wallet-core/evm/provider', () => ({
  getBalanceEth: (...args) => getBalanceEth(...args),
}));
vi.mock('@/wallet-core/btc/provider', () => ({
  getBalanceSats: (...args) => getBalanceSats(...args),
}));
vi.mock('@/wallet-core/sol/provider', () => ({
  getBalanceSol: (...args) => getBalanceSol(...args),
}));

// Keep DEMO false so the real chain path is the one under test.
vi.mock('@/api/demoClient', () => ({ DEMO: false }));

import { resolveHiddenBalance } from '../hiddenBalance.js';

describe('hiddenBalance I3 guard (M-6)', () => {
  beforeEach(() => {
    isDeniabilitySessionActive.mockReset();
    getBalanceEth.mockClear();
    getBalanceSats.mockClear();
    getBalanceSol.mockClear();
  });

  it('throws and makes NO node read when a deniability session is active', async () => {
    isDeniabilitySessionActive.mockReturnValue(true);
    // Must reject with a real Error instance (not a raw string): the caller in
    // StealthWallets.jsx reads `e?.message`, which is undefined for a raw-string
    // throw and silently mis-classifies the I3 guard as a generic "read failed".
    const err = await resolveHiddenBalance('evm', '0xabc').catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('I3: no egress in deniability session');
    // Fail-closed: the live balance read never happened.
    expect(getBalanceEth).not.toHaveBeenCalled();
    expect(getBalanceSats).not.toHaveBeenCalled();
    expect(getBalanceSol).not.toHaveBeenCalled();
  });

  it('reads the chain normally when NO deniability session is active', async () => {
    isDeniabilitySessionActive.mockReturnValue(false);
    const out = await resolveHiddenBalance('evm', '0xabc');
    expect(out).toEqual({ amount: 0.5, unit: 'ETH', source: 'chain' });
    expect(getBalanceEth).toHaveBeenCalledTimes(1);
  });

  it('throws fail-closed when veyrnox-demo=1 is flipped in localStorage AFTER module import (issue #1102)', async () => {
    // DEMO import from @/api/demoClient is a load-time IIFE snapshot (mocked
    // false at top of file). Guarding only on isDeniabilitySessionActive() and
    // that load-time DEMO leaves a post-import flip window: a caller sets
    // localStorage['veyrnox-demo']='1' after module load, the module still sees
    // DEMO=false + no I3 session, and falls through to a live chain read.
    // isDeniabilityOrDemoActive() reads localStorage LIVE and must catch this.
    isDeniabilitySessionActive.mockReturnValue(false);
    try {
      localStorage.setItem('veyrnox-demo', '1');
      const err = await resolveHiddenBalance('evm', '0xabc').catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('I3: no egress in deniability session');
      expect(getBalanceEth).not.toHaveBeenCalled();
      expect(getBalanceSats).not.toHaveBeenCalled();
      expect(getBalanceSol).not.toHaveBeenCalled();
    } finally {
      localStorage.removeItem('veyrnox-demo');
    }
  });
});
