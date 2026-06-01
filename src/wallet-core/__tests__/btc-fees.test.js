// wallet-core/__tests__/btc-fees.test.js
//
// BTC fee tiers are sat/vByte RATES; the real miner fee is set by coin selection
// at send time. These pure tests pin (1) the tier assembly + display estimate,
// (2) the monotonic-display clamp for a quiet testnet, and (3) the load-bearing
// property: the selected rate actually drives the fee through selectCoins — a
// higher sat/vB yields a strictly higher fee for the same spend. No network.

import { describe, it, expect } from 'vitest';
import { buildBtcTiers, clampMonotonic, BTC_TIERS, TYPICAL_INPUTS, TYPICAL_OUTPUTS } from '../btc/fees.js';
import { selectCoins, estimateFeeSats } from '../btc/coinselect.js';

describe('buildBtcTiers — sat/vByte tiers + display estimate', () => {
  it('assembles slow/standard/fast with a typical-tx fee estimate', () => {
    const tiers = buildBtcTiers([1, 5, 20]);
    expect(tiers.map((t) => t.id)).toEqual(['slow', 'standard', 'fast']);
    expect(tiers.map((t) => t.feeRate)).toEqual([1, 5, 20]);
    // estFeeSats = vsize(1-in,2-out) × rate, matching the real coin-selection maths.
    const expected = Number(estimateFeeSats(TYPICAL_INPUTS, TYPICAL_OUTPUTS, 5));
    expect(tiers[1].estFeeSats).toBe(expected);
  });

  it('carries an ETA label per tier', () => {
    const tiers = buildBtcTiers([1, 5, 20]);
    expect(tiers.every((t) => typeof t.etaLabel === 'string' && t.etaLabel.length)).toBe(true);
    expect(BTC_TIERS.map((t) => t.targetBlocks)).toEqual([6, 3, 1]);
  });
});

describe('clampMonotonic — never show Slow > Fast on a quiet testnet', () => {
  it('sorts inverted rates into slow ≤ standard ≤ fast', () => {
    expect(clampMonotonic([20, 5, 1])).toEqual([1, 5, 20]);
  });
  it('leaves equal rates equal (no invented spread)', () => {
    expect(clampMonotonic([3, 3, 3])).toEqual([3, 3, 3]);
  });
});

describe('selected fee rate flows into the send path (coin selection)', () => {
  const utxos = [{ txid: 'a'.repeat(64), vout: 0, value: 1_000_000n }];
  const opts = { utxos, toAddress: 'tb1qrecipient', amountSats: 100_000n, changeAddress: 'tb1qself' };

  it('a higher sat/vB produces a strictly higher miner fee', () => {
    const slow = selectCoins({ ...opts, feeRate: 1 });
    const fast = selectCoins({ ...opts, feeRate: 20 });
    expect(fast.feeSats > slow.feeSats).toBe(true);
    expect(slow.feeRate).toBe(1);
    expect(fast.feeRate).toBe(20);
  });

  it('the plan fee equals vsize × the chosen rate (conserved)', () => {
    const plan = selectCoins({ ...opts, feeRate: 7 });
    expect(plan.feeSats).toBe(BigInt(plan.vsize) * 7n);
    // value conservation: inputs = outputs + fee
    const outSum = plan.outputs.reduce((s, o) => s + o.value, 0n);
    expect(plan.selectedSats).toBe(outSum + plan.feeSats);
  });
});
