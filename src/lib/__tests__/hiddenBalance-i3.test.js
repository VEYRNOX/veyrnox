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
// #1102: now uses isDeniabilityOrDemoActive
const isDeniabilityOrDemoActive = vi.fn();
vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: () => isDeniabilityOrDemoActive(),
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
    isDeniabilityOrDemoActive.mockReset();
    getBalanceEth.mockClear();
    getBalanceSats.mockClear();
    getBalanceSol.mockClear();
  });

  it('throws and makes NO node read when a deniability session is active', async () => {
    isDeniabilityOrDemoActive.mockReturnValue(true);
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
    isDeniabilityOrDemoActive.mockReturnValue(false);
    const out = await resolveHiddenBalance('evm', '0xabc');
    expect(out).toEqual({ amount: 0.5, unit: 'ETH', source: 'chain' });
    expect(getBalanceEth).toHaveBeenCalledTimes(1);
  });
});
