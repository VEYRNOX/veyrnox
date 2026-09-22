// Red-team fuzz 2026-09-22 — FALSE-GREEN on wrapped / signature-based approvals.
//
// classifyApprove() is a flat 4-selector allowlist (approve, increaseAllowance,
// setApprovalForAll, Permit2 approve). Two drain-enabling calldata shapes are
// NOT in that set and therefore return { isApprove:false } — which makes S2 and
// S3 answer OK ("Not an approval"). A GREEN confirm screen for a tx that grants
// unlimited spend is worse than INDETERMINATE (I4: fail honest, fail closed).
//
//   F1  multicall([approve(attacker, MAX)])   — routers/aggregators use
//       multicall legitimately; wrapping an approve in it is a live drainer
//       pattern. The victim's own wallet is the tx sender.
//   F2  permit(owner=you, spender=attacker, MAX) submitted as calldata —
//       EIP-2612; grants unlimited allowance with no on-chain approve().
//
// Contract these tests pin: an approval-family / wrapper selector that cannot be
// safely proven bounded must fail closed (INDETERMINATE), never OK. Where the
// fix lands (classifyApprove vs the signals) is left open — the assertion is on
// the security-visible signal verdict, not the internal shape.
//
// EXPECTED: RED until the fix lands. See VEYRNOX/veyrnox issue for repro.

import { describe, it, expect } from 'vitest';
import { Interface, MaxUint256 } from 'ethers';
import { s2UnlimitedApproval } from '../signals/s2-unlimited-approval.js';
import { s3FreshSpenderApproval } from '../signals/s3-fresh-spender-approval.js';
import { LEVEL } from '../levels.js';

const ATTACKER = '0x000000000000000000000000000000000000dEaD';
const erc20 = new Interface(['function approve(address spender, uint256 value)']);

// F1 — an unlimited approve wrapped in a multicall.
const multicall = new Interface(['function multicall(bytes[] data)']).encodeFunctionData(
  'multicall',
  [[erc20.encodeFunctionData('approve', [ATTACKER, MaxUint256])]],
);

// F2 — EIP-2612 permit granting unlimited allowance, submitted as calldata.
const permit = new Interface([
  'function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)',
]).encodeFunctionData('permit', [
  ATTACKER, ATTACKER, MaxUint256, 0n,
  27, '0x' + '11'.repeat(32), '0x' + '22'.repeat(32),
]);

describe('S2 — wrapped/signature approvals must not read as safe', () => {
  it('F1: multicall-wrapped unlimited approve is not OK (must fail closed)', () => {
    const level = s2UnlimitedApproval({ data: multicall }).level;
    expect(level).not.toBe(LEVEL.OK);
    expect(level).toBe(LEVEL.INDETERMINATE);
  });

  it('F2: EIP-2612 permit(unlimited) as calldata is not OK (must fail closed)', () => {
    const level = s2UnlimitedApproval({ data: permit }).level;
    expect(level).not.toBe(LEVEL.OK);
    expect(level).toBe(LEVEL.INDETERMINATE);
  });
});

describe('S3 — wrapped/signature approvals must not read as safe', () => {
  it('F1: multicall-wrapped approve to a fresh spender is not OK', () => {
    const level = s3FreshSpenderApproval({ data: multicall }, { knownGoodSpenders: [] }).level;
    expect(level).not.toBe(LEVEL.OK);
  });

  it('F2: permit(unlimited) as calldata to a fresh spender is not OK', () => {
    const level = s3FreshSpenderApproval({ data: permit }, { knownGoodSpenders: [] }).level;
    expect(level).not.toBe(LEVEL.OK);
  });
});
