// wallet-core/evm/__tests__/send.nonce.test.js
//
// VULN-19 (2026-08-16 audit): a malicious RPC could pass the pre-sign nonce
// sanity check with call #1 and then poison the signed tx with a different
// nonce on call #2 (ethers' internal re-fetch when the send omits `nonce`).
//
// The fix pins the sanity-checked nonce into sendTransaction. This test wires
// a provider whose getTransactionCount RETURNS DIFFERENT VALUES on consecutive
// calls, then asserts the signed tx uses the FIRST value (the one the
// pre-sign guard actually inspected).
//
// The check is honest: passing here proves the signer received the pinned
// nonce; it does not exercise every field of the RPC path.

import { describe, it, expect, vi } from 'vitest';
import { signAndBroadcast } from '../send.js';

// Networks / preflight / fees are unrelated to this bug — mock them to no-ops
// so the test isolates the nonce-pinning behaviour.
vi.mock('../networks.js', () => ({
  getNetwork: () => ({ chainId: 1, explorer: 'https://example.test' }),
}));

vi.mock('../preflight.js', () => ({
  verifyLiveChainId: vi.fn(async () => {}),
  applyEstimatedGasLimit: vi.fn(async (_p, _tx, overrides) => {
    overrides.gasLimit = 21000n;
  }),
}));

vi.mock('../fees.js', () => ({
  evmFeeOverrides: () => ({ maxFeePerGas: 1n, maxPriorityFeePerGas: 1n }),
}));

// Consecutive-call nonce holder: first call returns the trusted value the
// pre-sign guard inspects, second call would be ethers' internal re-fetch
// during sendTransaction if we ever omit `nonce` again.
const h = vi.hoisted(() => ({ counts: [42, 99] }));

vi.mock('../provider.js', () => ({
  getProvider: () => ({
    getTransactionCount: vi.fn(async () => {
      // shift() so consecutive calls really do see different values.
      const next = h.counts.shift();
      return typeof next === 'number' ? next : 99;
    }),
    // Minimal shape ethers.Wallet(...).sendTransaction pokes for populate.
    getNetwork: async () => ({ chainId: 1n, name: 'mainnet' }),
    _detectNetwork: async () => ({ chainId: 1n, name: 'mainnet' }),
  }),
}));

// Replace ethers Wallet with a capture-only stand-in — we're testing wiring,
// not the ethers signer. sendTransaction records the tx it was handed.
const sent = vi.hoisted(() => ({ tx: null }));
vi.mock('ethers', async () => {
  const actual = await vi.importActual('ethers');
  class MockWallet {
    constructor(_pk, _provider) {
      this.address = '0x0000000000000000000000000000000000000001';
    }
    async sendTransaction(tx) {
      sent.tx = tx;
      return { hash: '0xdead', wait: async () => ({}) };
    }
  }
  return { ...actual, Wallet: MockWallet };
});

describe('signAndBroadcast — VULN-19: pins the sanity-checked nonce (2026-08-16)', () => {
  it('signs with the first (checked) nonce, not a later RPC re-fetch', async () => {
    h.counts = [42, 99]; // #1 = trusted, #2 = poisoned (must NOT be used)
    sent.tx = null;

    await signAndBroadcast({
      networkKey: 'ethereum',
      // Real 32-byte hex ethers can parse; content is arbitrary.
      privateKey: '0x' + '11'.repeat(32),
      to: '0x000000000000000000000000000000000000dEaD',
      amountEth: '0.001',
    });

    expect(sent.tx).toBeTruthy();
    expect(sent.tx.nonce).toBe(42);
  });
});
