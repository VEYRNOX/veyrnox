// src/risk/__tests__/s3-fresh-spender-approval.test.js
//
// S3 — approval to a fresh spender. An approve() (any amount) whose spender is
// NOT in the active-set's known-good spender set is the setup half of a drain;
// it compounds with S2. Active-set-scoped only (I3).
//
// Contract: approve to unknown spender → RISK; approve to known-good spender →
// OK; malformed approve → INDETERMINATE (fail closed); non-approve → OK.

import { describe, it, expect } from 'vitest';
import { Interface, parseUnits } from 'ethers';
import { s3FreshSpenderApproval } from '../signals/s3-fresh-spender-approval.js';
import { LEVEL } from '../levels.js';

const iface = new Interface([
  'function approve(address spender, uint256 value)',
  'function transfer(address to, uint256 value)',
]);
const KNOWN_SPENDER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const FRESH_SPENDER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const tx = (data) => ({ to: '0xToken', data, value: 0n, chainId: 11155111 });
const set = (knownGoodSpenders) => ({ knownGoodSpenders });

describe('S3 fresh-spender approval', () => {
  it('HIT: approve to a spender not in the known-good set → RISK', () => {
    const data = iface.encodeFunctionData('approve', [FRESH_SPENDER, parseUnits('100', 6)]);
    const { level, evidence } = s3FreshSpenderApproval(tx(data), set([KNOWN_SPENDER]), {});
    expect(level).toBe(LEVEL.RISK);
    expect(evidence.values.spender.toLowerCase()).toBe(FRESH_SPENDER.toLowerCase());
  });

  it('MISS: approve to a known-good spender (case-insensitive) → OK', () => {
    const data = iface.encodeFunctionData('approve', [KNOWN_SPENDER, parseUnits('100', 6)]);
    expect(s3FreshSpenderApproval(tx(data), set([KNOWN_SPENDER.toLowerCase()]), {}).level).toBe(LEVEL.OK);
  });

  it('MISS: a plain transfer is not an approve → OK', () => {
    const data = iface.encodeFunctionData('transfer', [FRESH_SPENDER, parseUnits('5', 6)]);
    expect(s3FreshSpenderApproval(tx(data), set([KNOWN_SPENDER]), {}).level).toBe(LEVEL.OK);
  });

  it('INDETERMINATE: approve selector with malformed args → fail closed', () => {
    expect(s3FreshSpenderApproval(tx('0x095ea7b300'), set([KNOWN_SPENDER]), {}).level).toBe(LEVEL.INDETERMINATE);
  });
});
