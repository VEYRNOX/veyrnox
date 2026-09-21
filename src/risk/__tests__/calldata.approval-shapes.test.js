// Audit 2026-09-21 H2 — every calldata shape that grants a third party the
// right to move assets must be recognised, not just an unlimited approve().

import { describe, it, expect } from 'vitest';
import { Interface, MaxUint256 } from 'ethers';
import { classifyApprove } from '../calldata.js';
import { s3FreshSpenderApproval } from '../signals/s3-fresh-spender-approval.js';
import { LEVEL } from '../levels.js';

const SPENDER = '0x1111111111111111111111111111111111111111';
const TOKEN = '0x2222222222222222222222222222222222222222';
const erc20 = new Interface([
  'function approve(address spender, uint256 value)',
  'function increaseAllowance(address spender, uint256 addedValue)',
  'function transfer(address to, uint256 value)',
]);
const erc721 = new Interface(['function setApprovalForAll(address operator, bool approved)']);
const permit2 = new Interface(['function approve(address token, address spender, uint160 amount, uint48 expiration)']);

describe('classifyApprove — approval shapes', () => {
  it('bounded approve is an approval, not unlimited', () => {
    const a = classifyApprove(erc20.encodeFunctionData('approve', [SPENDER, 5_000_000n]));
    expect(a).toMatchObject({ isApprove: true, decoded: true, kind: 'approve', spender: SPENDER, unlimited: false, revoke: false });
    expect(a.value).toBe(5_000_000n);
  });

  it('increaseAllowance to max is an unlimited approval', () => {
    const a = classifyApprove(erc20.encodeFunctionData('increaseAllowance', [SPENDER, MaxUint256]));
    expect(a).toMatchObject({ isApprove: true, decoded: true, kind: 'increaseAllowance', spender: SPENDER, unlimited: true });
  });

  it('setApprovalForAll(true) is an unlimited operator grant; (false) is a revoke', () => {
    const grant = classifyApprove(erc721.encodeFunctionData('setApprovalForAll', [SPENDER, true]));
    expect(grant).toMatchObject({ isApprove: true, decoded: true, kind: 'setApprovalForAll', spender: SPENDER, unlimited: true, revoke: false });
    const revoke = classifyApprove(erc721.encodeFunctionData('setApprovalForAll', [SPENDER, false]));
    expect(revoke).toMatchObject({ isApprove: true, decoded: true, kind: 'setApprovalForAll', unlimited: false, revoke: true });
  });

  it('Permit2 approve carries token and spender; uint160 max is unlimited', () => {
    const max160 = (1n << 160n) - 1n;
    const a = classifyApprove(permit2.encodeFunctionData('approve', [TOKEN, SPENDER, max160, 0]));
    expect(a).toMatchObject({ isApprove: true, decoded: true, kind: 'permit2Approve', token: TOKEN, spender: SPENDER, unlimited: true });
  });

  it('transfer is not an approval; truncated approval fails closed as undecodable', () => {
    expect(classifyApprove(erc20.encodeFunctionData('transfer', [SPENDER, 1n])).isApprove).toBe(false);
    const truncated = erc20.encodeFunctionData('approve', [SPENDER, 1n]).slice(0, 30);
    expect(classifyApprove(truncated)).toMatchObject({ isApprove: true, decoded: false });
  });
});

describe('S3 fresh-spender on the new shapes', () => {
  it('bounded approve to an unknown spender is RISK; revoke is OK; known spender is OK', () => {
    const bounded = { data: erc20.encodeFunctionData('approve', [SPENDER, 5_000_000n]) };
    expect(s3FreshSpenderApproval(bounded, { knownGoodSpenders: [] }).level).toBe(LEVEL.RISK);
    expect(s3FreshSpenderApproval(bounded, { knownGoodSpenders: [SPENDER] }).level).toBe(LEVEL.OK);
    const revoke = { data: erc20.encodeFunctionData('approve', [SPENDER, 0n]) };
    expect(s3FreshSpenderApproval(revoke, { knownGoodSpenders: [] }).level).toBe(LEVEL.OK);
  });

  it('setApprovalForAll and Permit2 to an unknown operator are RISK', () => {
    const op = { data: erc721.encodeFunctionData('setApprovalForAll', [SPENDER, true]) };
    expect(s3FreshSpenderApproval(op, { knownGoodSpenders: [] }).level).toBe(LEVEL.RISK);
    const p2 = { data: permit2.encodeFunctionData('approve', [TOKEN, SPENDER, 1n, 0]) };
    expect(s3FreshSpenderApproval(p2, { knownGoodSpenders: [] }).level).toBe(LEVEL.RISK);
  });
});
