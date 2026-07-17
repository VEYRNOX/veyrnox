// src/lib/__tests__/hiddenBalance-live-demo.test.js
// #1102: hiddenBalance.js must use isDeniabilityOrDemoActive (the LIVE helper).
import { describe, it, expect, vi, beforeEach } from 'vitest';
const isDeniabilityOrDemoActive = vi.fn(() => false);
const isDeniabilitySessionActive = vi.fn(() => false);
vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilitySessionActive: (...a) => isDeniabilitySessionActive(...a),
  isDeniabilityOrDemoActive: (...a) => isDeniabilityOrDemoActive(...a),
}));
vi.mock('@/api/demoClient', () => ({ DEMO: false }));
const getBalanceEth = vi.fn(async () => '0.5');
vi.mock('@/wallet-core/evm/provider', () => ({ getBalanceEth: (...args) => getBalanceEth(...args) }));
vi.mock('@/wallet-core/btc/provider', () => ({ getBalanceSats: vi.fn(async () => '100000000') }));
vi.mock('@/wallet-core/sol/provider', () => ({ getBalanceSol: vi.fn(async () => '1') }));
import { resolveHiddenBalance } from '../hiddenBalance.js';
describe('#1102 — hiddenBalance uses live demo check', () => {
  beforeEach(() => {
    isDeniabilityOrDemoActive.mockReset().mockReturnValue(false);
    isDeniabilitySessionActive.mockReset().mockReturnValue(false);
    getBalanceEth.mockClear();
  });
  it('resolveHiddenBalance throws when isDeniabilityOrDemoActive() is true', async () => {
    isDeniabilityOrDemoActive.mockReturnValue(true);
    isDeniabilitySessionActive.mockReturnValue(false);
    const err = await resolveHiddenBalance('evm', '0xabc').catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('I3: no egress in deniability session');
    expect(getBalanceEth).not.toHaveBeenCalled();
  });
  it('resolveHiddenBalance proceeds when isDeniabilityOrDemoActive() is false', async () => {
    isDeniabilityOrDemoActive.mockReturnValue(false);
    const out = await resolveHiddenBalance('evm', '0xabc');
    expect(out).toEqual({ amount: 0.5, unit: 'ETH', source: 'chain' });
    expect(getBalanceEth).toHaveBeenCalledOnce();
  });
});
