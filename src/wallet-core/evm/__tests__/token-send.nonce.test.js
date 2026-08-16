// wallet-core/evm/__tests__/token-send.nonce.test.js
//
// VULN-19 (2026-08-16 round 4): same class of bug as send.nonce.test.js, on
// the ERC-20 transfer path. If sendToken() does NOT pin the sanity-checked
// nonce into the overrides handed to Contract.transfer(), ethers refetches
// internally — a malicious RPC could return a good nonce on call #1 (pass the
// check) and a poisoned nonce on call #2 (be what actually gets signed).
//
// The fix pins pendingNonce into overridesWithNonce. This test wires a
// provider whose getTransactionCount RETURNS DIFFERENT VALUES on consecutive
// calls, then asserts the tx passed to the signer uses the FIRST value.

import { describe, it, expect, vi } from 'vitest';
import { sendToken } from '../token-send.js';

vi.mock('../networks.js', () => ({
  getNetwork: () => ({ chainId: 1, explorer: 'https://example.test' }),
}));

vi.mock('../preflight.js', () => ({
  verifyLiveChainId: vi.fn(async () => {}),
  applyEstimatedGasLimit: vi.fn(async (_p, _tx, overrides) => {
    overrides.gasLimit = 65000n;
    return overrides;
  }),
}));

vi.mock('../fees.js', () => ({
  evmFeeOverrides: () => ({ maxFeePerGas: 1n, maxPriorityFeePerGas: 1n }),
}));

vi.mock('../tokens.js', () => ({
  getToken: () => ({
    address: '0x000000000000000000000000000000000000AAAA',
    symbol: 'MOCK',
    decimals: 6,
  }),
  ERC20_ABI: [
    'function transfer(address to, uint256 value) returns (bool)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address owner) view returns (uint256)',
  ],
}));

// Consecutive-call nonce holder: #1 = trusted, #2 = poisoned RPC re-fetch.
const h = vi.hoisted(() => ({ counts: [7, 999] }));

vi.mock('../provider.js', () => ({
  getProvider: () => ({
    getTransactionCount: vi.fn(async () => {
      const next = h.counts.shift();
      return typeof next === 'number' ? next : 999;
    }),
    getNetwork: async () => ({ chainId: 1n, name: 'mainnet' }),
    _detectNetwork: async () => ({ chainId: 1n, name: 'mainnet' }),
  }),
}));

// Capture what the Contract.transfer() receives as its overrides arg.
const sent = vi.hoisted(() => ({ overrides: null }));

vi.mock('ethers', async () => {
  const actual = await vi.importActual('ethers');
  class MockWallet {
    constructor(_pk, _provider) {
      this.address = '0x0000000000000000000000000000000000000001';
    }
  }
  class MockContract {
    constructor(_addr, _abi, _signerOrProvider) {}
    async decimals() { return 6; }
    async transfer(_to, _value, overrides) {
      sent.overrides = overrides;
      return { hash: '0xbeef', wait: async () => ({}) };
    }
  }
  return { ...actual, Wallet: MockWallet, Contract: MockContract };
});

describe('sendToken — VULN-19 ERC-20 propagation: pins the sanity-checked nonce (r4 2026-08-16)', () => {
  it('signs with the first (checked) nonce, not a later RPC re-fetch', async () => {
    h.counts = [7, 999];
    sent.overrides = null;

    await sendToken({
      networkKey: 'ethereum',
      privateKey: '0x' + '11'.repeat(32),
      symbol: 'MOCK',
      to: '0x000000000000000000000000000000000000dEaD',
      amount: '1.5',
    });

    expect(sent.overrides).toBeTruthy();
    expect(sent.overrides.nonce).toBe(7);
  });
});
