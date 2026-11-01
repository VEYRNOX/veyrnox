import { describe, expect, it } from 'vitest';
import { bumpEip1559Fees, bumpReplacementWei } from '../replacement-fees.js';

describe('EIP-1559 replacement fee bump', () => {
  it('raises an exactly divisible value by 10%', () => {
    expect(bumpReplacementWei(1_000n)).toBe(1_100n);
  });

  it('rounds up in integer wei instead of rounding below the node minimum', () => {
    expect(bumpReplacementWei(101n)).toBe(112n);
  });

  it('still makes a zero or tiny fee strictly higher', () => {
    expect(bumpReplacementWei(0n)).toBe(1n);
    expect(bumpReplacementWei(1n)).toBe(2n);
  });

  it('bumps both maxFeePerGas and maxPriorityFeePerGas independently', () => {
    expect(bumpEip1559Fees({
      maxFeePerGas: 30_000_000_001n,
      maxPriorityFeePerGas: 1_000_000_001n,
    })).toEqual({
      maxFeePerGas: 33_000_000_002n,
      maxPriorityFeePerGas: 1_100_000_002n,
    });
  });

  it('keeps the max fee cap at least as high as the bumped priority fee', () => {
    expect(bumpEip1559Fees({ maxFeePerGas: 1n, maxPriorityFeePerGas: 2n })).toEqual({
      maxFeePerGas: 3n,
      maxPriorityFeePerGas: 3n,
    });
  });

  it('rejects negative money values', () => {
    expect(() => bumpReplacementWei(-1n)).toThrow(/cannot be negative/i);
  });
});

