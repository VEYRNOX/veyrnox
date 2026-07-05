// lib/__tests__/decoyBalance-i3.test.js
//
// D-06: resolveDecoyBalance() performs a live eth_getBalance RPC. The I3
// invariant (no egress in a deniability session) must be enforced on the
// EXPORTED function itself — not just on some callers — so a future caller can
// never leak network egress from inside a deniability session. This test pins
// that the function FAILS CLOSED when a deniability session is active.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Control the deniability-session flag per test.
const isDeniabilitySessionActive = vi.fn();
vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilitySessionActive: () => isDeniabilitySessionActive(),
}));

// Prove the guard runs BEFORE any RPC: getBalanceEth must never be called when
// a deniability session is active. If the guard is missing, this mock's spy
// would fire (and the test would also not see the throw).
const getBalanceEth = vi.fn(async () => '0.5');
vi.mock('@/wallet-core/evm/provider', () => ({
  getBalanceEth: (...args) => getBalanceEth(...args),
}));

// Keep DEMO false so the real chain path is the one under test.
vi.mock('@/api/demoClient', () => ({ DEMO: false }));

import { resolveDecoyBalance } from '../decoyBalance.js';

describe('decoyBalance I3 guard (D-06)', () => {
  beforeEach(() => {
    isDeniabilitySessionActive.mockReset();
    getBalanceEth.mockClear();
  });

  it('throws and makes NO RPC when a deniability session is active', async () => {
    isDeniabilitySessionActive.mockReturnValue(true);
    await expect(resolveDecoyBalance('0xabc')).rejects.toThrow(
      'I3: no egress in deniability session'
    );
    // Fail-closed: the live balance read never happened.
    expect(getBalanceEth).not.toHaveBeenCalled();
  });

  it('reads the chain normally when NO deniability session is active', async () => {
    isDeniabilitySessionActive.mockReturnValue(false);
    const out = await resolveDecoyBalance('0xabc');
    expect(out).toEqual({ eth: '0.5', source: 'chain' });
    expect(getBalanceEth).toHaveBeenCalledTimes(1);
  });
});
