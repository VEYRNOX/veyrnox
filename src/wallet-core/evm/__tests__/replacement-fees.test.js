import { describe, expect, it } from 'vitest';
import { bumpEip1559Fees, bumpReplacementWei, replacementFeesWithLiveFloor } from '../replacement-fees.js';

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


describe('replacement fees with a bounded live-network floor', () => {
  const G = 1_000_000_000n;
  const bounds = { maxBaseFeeWei: 200n * G, maxTipWei: 500n * G };

  it('lifts a stale 30 gwei cap above a live 50 gwei base fee instead of signing 33 gwei', () => {
    const fee = replacementFeesWithLiveFloor({
      maxFeePerGas: 30n * G, maxPriorityFeePerGas: 2n * G, liveBaseFeePerGas: 50n * G, liveTipWei: 1n * G, ...bounds,
    });
    expect(fee.maxFeePerGas).toBe(102_200_000_000n);
    expect(fee.maxPriorityFeePerGas).toBe(2_200_000_000n);
  });

  it('keeps the 10% bump when it already exceeds the live floor', () => {
    const fee = replacementFeesWithLiveFloor({
      maxFeePerGas: 30n * G, maxPriorityFeePerGas: 2n * G, liveBaseFeePerGas: 1n * G, liveTipWei: 1n * G, ...bounds,
    });
    expect(fee.maxFeePerGas).toBe(33n * G);
  });

  it('clamps a hostile live tip and the live-derived cap to the network ceiling', () => {
    const fee = replacementFeesWithLiveFloor({
      maxFeePerGas: 30n * G, maxPriorityFeePerGas: 2n * G, liveBaseFeePerGas: 200n * G, liveTipWei: 10_000n * G, ...bounds,
    });
    expect(fee.maxPriorityFeePerGas).toBe(500n * G);
    expect(fee.maxFeePerGas).toBe(700n * G);
  });

  it('fails closed on an implausible or missing live base fee', () => {
    expect(() => replacementFeesWithLiveFloor({
      maxFeePerGas: 30n * G, maxPriorityFeePerGas: 2n * G, liveBaseFeePerGas: 201n * G, liveTipWei: 0n, ...bounds,
    })).toThrow(expect.objectContaining({ code: 'REPLACEMENT_LIVE_FEE_UNSAFE' }));
    expect(() => replacementFeesWithLiveFloor({
      maxFeePerGas: 30n * G, maxPriorityFeePerGas: 2n * G, liveBaseFeePerGas: null, liveTipWei: 0n, ...bounds,
    })).toThrow(expect.objectContaining({ code: 'REPLACEMENT_LIVE_FEE_UNAVAILABLE' }));
  });
});
