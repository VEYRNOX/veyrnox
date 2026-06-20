// wallet-core/__tests__/evm-fees.test.js
//
// EIP-1559 fee tiers are a fund/UX hazard if wrong (too low → stuck tx, too high
// → overpay), so the tier maths and the selection→tx-override mapping are pure
// and pinned here. The override test is the key guarantee: the fee the user picks
// is the EXACT object spread into wallet.sendTransaction(), so what they see is
// what gets signed. No network.

import { describe, it, expect } from 'vitest';
import { parseUnits } from 'ethers';
import { buildEvmTiers, buildEvmCustomFee, evmFeeOverrides, EVM_TIERS, MIN_TIP_WEI } from '../evm/fees.js';

const GWEI = (n) => parseUnits(String(n), 'gwei');

describe('buildEvmTiers — EIP-1559 preset tiers', () => {
  const base = GWEI(20);        // 20 gwei base fee
  const tip = GWEI(2);          // 2 gwei suggested priority
  const gasLimit = 21000n;
  const tiers = buildEvmTiers({ baseFeePerGasWei: base, suggestedTipWei: tip, gasLimit });

  it('produces slow/standard/fast', () => {
    expect(tiers.map((t) => t.id)).toEqual(['slow', 'standard', 'fast']);
  });

  it('scales the priority tip per tier (slow < standard < fast)', () => {
    const [slow, std, fast] = tiers.map((t) => BigInt(t.maxPriorityFeePerGasWei));
    expect(slow).toBe(GWEI(1));   // 2 × 1/2
    expect(std).toBe(GWEI(2));    // 2 × 1
    expect(fast).toBe(GWEI(4));   // 2 × 2
    expect(slow < std && std < fast).toBe(true);
  });

  it('buffers maxFeePerGas at base×2 + tip (one-doubling headroom, never stuck)', () => {
    const std = tiers[1];
    expect(BigInt(std.maxFeePerGasWei)).toBe(base * 2n + GWEI(2));
    // maxFee must always clear base + tip so the tx can be included.
    for (const t of tiers) {
      expect(BigInt(t.maxFeePerGasWei) >= base + BigInt(t.maxPriorityFeePerGasWei)).toBe(true);
    }
  });

  it('estFee = gasLimit × (base + tip); maxFee = gasLimit × maxFeePerGas', () => {
    const std = tiers[1];
    expect(BigInt(std.estFeeWei)).toBe(gasLimit * (base + GWEI(2)));
    expect(BigInt(std.maxFeeWei)).toBe(gasLimit * BigInt(std.maxFeePerGasWei));
  });

  it('floors the tip on an idle testnet (suggested tip 0 → MIN_TIP_WEI)', () => {
    const t0 = buildEvmTiers({ baseFeePerGasWei: GWEI(5), suggestedTipWei: 0n, gasLimit: 21000n });
    for (const t of t0) expect(BigInt(t.maxPriorityFeePerGasWei)).toBe(MIN_TIP_WEI);
  });

  it('floors all tiers at minGasPriceWei on chains with a network minimum (BSC)', () => {
    // BSC testnet: baseFee≈0, suggestedTip=1 gwei (network minimum), minGasPrice=1 gwei.
    // Slow = 1 gwei × ½ = 0.5 gwei — below the 1 gwei floor → must be clamped.
    const tiers = buildEvmTiers({
      baseFeePerGasWei: 0n,
      suggestedTipWei: GWEI(1),
      gasLimit: 21000n,
      minGasPriceWei: GWEI(1),
    });
    const [slow, std, fast] = tiers.map((t) => BigInt(t.maxPriorityFeePerGasWei));
    expect(slow).toBe(GWEI(1));  // clamped: 0.5 gwei < 1 gwei floor
    expect(std).toBe(GWEI(1));   // exact at floor
    expect(fast).toBe(GWEI(2));  // 2× — comfortably above floor
    // All three clear the network minimum.
    for (const t of tiers) {
      expect(BigInt(t.maxPriorityFeePerGasWei) >= GWEI(1)).toBe(true);
    }
  });

  it('minGasPriceWei below MIN_TIP_WEI is ignored (MIN_TIP_WEI still applies)', () => {
    const tiny = MIN_TIP_WEI / 2n; // 0.05 gwei — below the absolute floor
    const tiers = buildEvmTiers({ baseFeePerGasWei: 0n, suggestedTipWei: 0n, gasLimit: 21000n, minGasPriceWei: tiny });
    for (const t of tiers) expect(BigInt(t.maxPriorityFeePerGasWei)).toBe(MIN_TIP_WEI);
  });
});

describe('buildEvmCustomFee — advanced (max base + tip) model', () => {
  it('maxFeePerGas = maxBase + tip; maxPriorityFeePerGas = tip', () => {
    const fee = buildEvmCustomFee({ maxBaseFeeGwei: 30, priorityGwei: 3, gasLimit: 21000 });
    expect(BigInt(fee.maxPriorityFeePerGasWei)).toBe(GWEI(3));
    expect(BigInt(fee.maxFeePerGasWei)).toBe(GWEI(33));
    expect(BigInt(fee.gasLimit)).toBe(21000n);
  });

  it('rejects a zero max fee (stuck-tx guard)', () => {
    expect(() => buildEvmCustomFee({ maxBaseFeeGwei: 0, priorityGwei: 0, gasLimit: 21000 })).toThrow(/greater than zero/i);
  });

  it('clamps gas limit to a 21000 floor', () => {
    const fee = buildEvmCustomFee({ maxBaseFeeGwei: 1, priorityGwei: 1, gasLimit: 1 });
    expect(BigInt(fee.gasLimit)).toBe(21000n);
  });
});

describe('evmFeeOverrides — selection maps to the EXACT tx fields that get signed', () => {
  it('maps a tier fee to ethers EIP-1559 overrides (BigInt)', () => {
    const [, std] = buildEvmTiers({ baseFeePerGasWei: GWEI(20), suggestedTipWei: GWEI(2), gasLimit: 21000n });
    // The send path builds overrides from exactly these signed fields.
    const ov = evmFeeOverrides({
      maxFeePerGasWei: std.maxFeePerGasWei,
      maxPriorityFeePerGasWei: std.maxPriorityFeePerGasWei,
      gasLimit: std.gasLimit,
    });
    expect(ov.maxFeePerGas).toBe(BigInt(std.maxFeePerGasWei));
    expect(ov.maxPriorityFeePerGas).toBe(BigInt(std.maxPriorityFeePerGasWei));
    expect(ov.gasLimit).toBe(21000n);
    expect(typeof ov.maxFeePerGas).toBe('bigint');
  });

  it('returns {} when no fee is selected (preserves ethers auto-fill)', () => {
    expect(evmFeeOverrides(null)).toEqual({});
    expect(evmFeeOverrides(undefined)).toEqual({});
  });

  it('supports a legacy gasPrice override for pre-1559 chains', () => {
    const ov = evmFeeOverrides({ gasPriceWei: GWEI(10).toString() });
    expect(ov.gasPrice).toBe(GWEI(10));
    expect(ov.maxFeePerGas).toBeUndefined();
  });

  it('EVM_TIERS multipliers are monotonic', () => {
    const ratios = EVM_TIERS.map((t) => Number(t.tipNum) / Number(t.tipDen));
    expect(ratios).toEqual([0.5, 1, 2]);
  });
});

describe('buildEvmTiers — per-chain base-fee ceiling (C-4)', () => {
  const tip = GWEI(2);
  const gasLimit = 21000n;

  it('throws when mainnet base fee exceeds 1000 gwei', () => {
    expect(() =>
      buildEvmTiers({ baseFeePerGasWei: GWEI(1001), suggestedTipWei: tip, gasLimit, networkKey: 'mainnet' }),
    ).toThrow(/implausible base fee/i);
  });

  it('accepts mainnet base fee at or below 1000 gwei', () => {
    expect(() =>
      buildEvmTiers({ baseFeePerGasWei: GWEI(999), suggestedTipWei: tip, gasLimit, networkKey: 'mainnet' }),
    ).not.toThrow();
  });

  it('accepts sepolia base fee up to 5000 gwei (testnet cap)', () => {
    expect(() =>
      buildEvmTiers({ baseFeePerGasWei: GWEI(3000), suggestedTipWei: tip, gasLimit, networkKey: 'sepolia' }),
    ).not.toThrow();
  });

  it('applies no cap when networkKey is unknown', () => {
    expect(() =>
      buildEvmTiers({ baseFeePerGasWei: GWEI(99999), suggestedTipWei: tip, gasLimit, networkKey: 'unknownchain' }),
    ).not.toThrow();
  });
});

describe('buildEvmCustomFee — per-chain ceiling (C-4)', () => {
  it('throws when custom maxBaseFeeGwei exceeds the mainnet ceiling', () => {
    expect(() =>
      buildEvmCustomFee({ maxBaseFeeGwei: 1001, priorityGwei: 1, gasLimit: 21000, networkKey: 'mainnet' }),
    ).toThrow(/ceiling/i);
  });

  it('accepts custom maxBaseFeeGwei at or below the mainnet ceiling', () => {
    expect(() =>
      buildEvmCustomFee({ maxBaseFeeGwei: 999, priorityGwei: 1, gasLimit: 21000, networkKey: 'mainnet' }),
    ).not.toThrow();
  });
});
