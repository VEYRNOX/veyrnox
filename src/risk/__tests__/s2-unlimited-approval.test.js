// src/risk/__tests__/s2-unlimited-approval.test.js
//
// S2 — unlimited approval. The classic drainer vector: approve(spender, value)
// where value is effectively infinite grants the spender unlimited spend.
// Contract: hit → RISK, malformed approve → INDETERMINATE (fail closed, never
// OK), non-approve calldata → OK (S2 not applicable, no opinion).

import { describe, it, expect } from 'vitest';
import { Interface, MaxUint256, parseUnits } from 'ethers';
import { s2UnlimitedApproval } from '../signals/s2-unlimited-approval.js';
import { LEVEL } from '../levels.js';

const iface = new Interface([
  'function approve(address spender, uint256 value)',
  'function transfer(address to, uint256 value)',
]);
const SPENDER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const APPROVE_SELECTOR = '0x095ea7b3';

const tx = (data) => ({ to: '0xToken', data, value: 0n, chainId: 11155111 });

describe('S2 unlimited approval', () => {
  it('HIT: approve with MaxUint256 → RISK', () => {
    const data = iface.encodeFunctionData('approve', [SPENDER, MaxUint256]);
    const { level, evidence } = s2UnlimitedApproval(tx(data), {}, {});
    expect(level).toBe(LEVEL.RISK);
    expect(evidence.reason).toMatch(/unlimited/i);
    // The spender is a verifiable, mono-rendered fact.
    expect(evidence.values.spender.toLowerCase()).toBe(SPENDER.toLowerCase());
  });

  it('HIT: approve at/above the unlimited threshold → RISK', () => {
    const data = iface.encodeFunctionData('approve', [SPENDER, MaxUint256 / 2n]);
    expect(s2UnlimitedApproval(tx(data), {}, {}).level).toBe(LEVEL.RISK);
  });

  it('MISS: a bounded approve (exact amount) → OK', () => {
    const data = iface.encodeFunctionData('approve', [SPENDER, parseUnits('100', 6)]);
    expect(s2UnlimitedApproval(tx(data), {}, {}).level).toBe(LEVEL.OK);
  });

  it('MISS: a plain transfer is not an approve → OK', () => {
    const data = iface.encodeFunctionData('transfer', [SPENDER, parseUnits('5', 6)]);
    expect(s2UnlimitedApproval(tx(data), {}, {}).level).toBe(LEVEL.OK);
  });

  it('MISS: native send with empty calldata → OK', () => {
    expect(s2UnlimitedApproval(tx('0x'), {}, {}).level).toBe(LEVEL.OK);
  });

  it('INDETERMINATE: approve selector but malformed args → fail closed, never OK', () => {
    // Correct selector, truncated/garbage argument bytes that cannot decode.
    const malformed = APPROVE_SELECTOR + '00';
    const { level } = s2UnlimitedApproval(tx(malformed), {}, {});
    expect(level).toBe(LEVEL.INDETERMINATE);
  });
});
