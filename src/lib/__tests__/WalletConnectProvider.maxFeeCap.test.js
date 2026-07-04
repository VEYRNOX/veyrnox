// F-02-GASCAP — dApp-supplied maxFeePerGas must be clamped to the per-chain
// MAX_BASE_FEE_GWEI ceiling. Without a cap a malicious dApp sets an arbitrarily
// large maxFeePerGas and the tx could pay an implausible fee. Pure helper
// resolveMaxFeePerGas(rawMaxFee, networkKey) is the contract.
// Fail closed (I4): absent/invalid maxFeePerGas returns null (do not set it).

import { describe, it, expect } from 'vitest';
import { resolveMaxFeePerGas } from '@/lib/WalletConnectProvider.jsx';
import { MAX_BASE_FEE_GWEI } from '@/wallet-core/evm/fees.js';

const GWEI = 1_000_000_000n;

describe('resolveMaxFeePerGas (F-02-GASCAP — per-chain maxFeePerGas ceiling)', () => {
  it('clamps an arbitrarily large maxFeePerGas to the sepolia cap', () => {
    const cap = MAX_BASE_FEE_GWEI.sepolia * GWEI;
    const out = resolveMaxFeePerGas('0xffffffffffffffffff', 'sepolia');
    expect(out).toBe(cap);
  });

  it('clamps against the mainnet cap (lower ceiling)', () => {
    const cap = MAX_BASE_FEE_GWEI.mainnet * GWEI;
    const huge = 10_000n * GWEI;
    expect(resolveMaxFeePerGas(huge, 'mainnet')).toBe(cap);
  });

  it('passes through a plausible maxFeePerGas unchanged', () => {
    const modest = 3n * GWEI;
    expect(resolveMaxFeePerGas(modest, 'sepolia')).toBe(modest);
  });

  it('returns null when maxFeePerGas is absent (fail closed, I4)', () => {
    expect(resolveMaxFeePerGas(undefined, 'sepolia')).toBeNull();
    expect(resolveMaxFeePerGas(null, 'sepolia')).toBeNull();
  });

  it('returns null when maxFeePerGas is invalid (fail closed, I4)', () => {
    expect(resolveMaxFeePerGas('not-a-number', 'sepolia')).toBeNull();
  });

  it('clamps to the mainnet cap for an unknown networkKey (fail closed default)', () => {
    const cap = MAX_BASE_FEE_GWEI.mainnet * GWEI;
    const huge = 10_000n * GWEI;
    expect(resolveMaxFeePerGas(huge, 'no-such-net')).toBe(cap);
  });
});
