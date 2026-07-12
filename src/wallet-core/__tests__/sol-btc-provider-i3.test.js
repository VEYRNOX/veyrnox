// wallet-core/__tests__/sol-btc-provider-i3.test.js
//
// Finding 1 (I3): the H-1 fix guarded getBalanceEth/simulateEvmTransaction/getUtxos
// but missed sibling egress functions on the SOL + BTC providers. These live
// network reads must FAIL CLOSED on the EXPORTED function itself when a
// deniability (decoy/hidden) session is active, so a future caller can never leak
// egress. This test pins that guard.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Control the deniability-session flag per test.
const isDeniabilitySessionActive = vi.fn();
vi.mock('../deniabilitySession.js', () => ({
  isDeniabilitySessionActive: () => isDeniabilitySessionActive(),
}));

// Fail if any real network primitive is reached. @solana/web3.js Connection and
// global fetch are the egress surfaces; a working guard must throw before them.
const fetchSpy = vi.fn(async () => {
  throw new Error('network egress must not happen');
});
vi.stubGlobal('fetch', fetchSpy);

import { getBalanceSol, getAddressHistory, getBalanceLamports } from '../sol/provider.js';
import { getAddressTxs } from '../btc/provider.js';

describe('SOL + BTC provider I3 guards (Finding 1)', () => {
  beforeEach(() => {
    isDeniabilitySessionActive.mockReset();
    fetchSpy.mockClear();
  });

  it('getBalanceSol throws and makes NO egress in a deniability session', async () => {
    isDeniabilitySessionActive.mockReturnValue(true);
    await expect(getBalanceSol('devnet', 'addr')).rejects.toThrow(
      'I3: no egress in deniability session'
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // H1: getBalanceLamports is the raw primitive called DIRECTLY by sol/send.js
  // and sol/hw-send.js, bypassing the getBalanceSol wrapper guard entirely.
  // The guard must live on the primitive itself (choke-point), not just the
  // wrapper, or a hidden-wallet SOL send during a deniability session leaks
  // live RPC egress.
  it('getBalanceLamports throws and makes NO egress in a deniability session', async () => {
    isDeniabilitySessionActive.mockReturnValue(true);
    await expect(getBalanceLamports('devnet', 'addr')).rejects.toThrow(
      'I3: no egress in deniability session'
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('getBalanceLamports is a no-op guard and still reads in a NORMAL session', async () => {
    isDeniabilitySessionActive.mockReturnValue(false);
    fetchSpy.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: '2.0', id: 1, result: { value: 123 } }),
    }));
    const result = await getBalanceLamports('devnet', 'addr');
    expect(result).toBe(123n);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('getAddressHistory throws and makes NO egress in a deniability session', async () => {
    isDeniabilitySessionActive.mockReturnValue(true);
    await expect(getAddressHistory('devnet', 'addr')).rejects.toThrow(
      'I3: no egress in deniability session'
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('getAddressTxs throws and makes NO egress in a deniability session', async () => {
    isDeniabilitySessionActive.mockReturnValue(true);
    await expect(getAddressTxs('testnet', 'addr')).rejects.toThrow(
      'I3: no egress in deniability session'
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
