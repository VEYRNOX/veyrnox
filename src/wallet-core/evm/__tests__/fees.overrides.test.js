// Audit 2026-09-21 M3: resolveEvmFeeOverrides clamps RPC-suggested fees to the
// same caps the tier estimator uses, so a malicious/buggy RPC cannot make the
// wallet sign a 10,000 gwei transaction.
import { describe, it, expect } from 'vitest';
import { resolveEvmFeeOverrides, MAX_BASE_FEE_GWEI, MAX_TIP_WEI } from '../fees.js';

const GWEI = 1_000_000_000n;
const cap = BigInt(MAX_BASE_FEE_GWEI.mainnet) * GWEI;

function provider(feeData) {
  return { getFeeData: async () => feeData };
}

describe('resolveEvmFeeOverrides', () => {
  it('passes sane EIP-1559 fees through', async () => {
    const out = await resolveEvmFeeOverrides(
      provider({ maxFeePerGas: 30n * GWEI, maxPriorityFeePerGas: 2n * GWEI, gasPrice: null }),
      'mainnet', null,
    );
    expect(out.maxFeePerGas).toBe(30n * GWEI);
    expect(out.maxPriorityFeePerGas).toBe(2n * GWEI);
  });

  it('clamps absurd RPC suggestions to the network cap', async () => {
    const out = await resolveEvmFeeOverrides(
      provider({ maxFeePerGas: 10_000n * GWEI, maxPriorityFeePerGas: 5_000n * GWEI, gasPrice: null }),
      'mainnet', null,
    );
    expect(out.maxFeePerGas).toBeLessThanOrEqual(cap);
    expect(out.maxPriorityFeePerGas).toBeLessThanOrEqual(MAX_TIP_WEI);
  });

  it('returns {} when the RPC gives nothing usable', async () => {
    const out = await resolveEvmFeeOverrides(provider({ maxFeePerGas: null, maxPriorityFeePerGas: null, gasPrice: null }), 'mainnet', null);
    expect(out).toEqual({});
  });
});
