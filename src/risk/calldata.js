// src/risk/calldata.js
//
// Risk Scoring v1 — PROVISIONAL (ECC independent audit complete 2026-06-23).
//
// Pure, local calldata inspection shared by the approval signals (S2, S3). NO
// network, NO signer, NO seed — it only parses bytes already present on the
// unsigned tx. Mirrors wallet-core/evm/calldata.js's robustness contract:
// malformed input never throws to the caller; it is reported as undecodable so
// the signal can fail closed (INDETERMINATE) rather than pass silently.

import { Interface, MaxUint256 } from 'ethers';

// Every calldata shape that grants a third party the right to move this
// wallet's assets. Audit 2026-09-21 H2: only approve(address,uint256) was
// recognised, so a bounded approve, increaseAllowance, setApprovalForAll or
// Permit2 approve reached the WalletConnect modal as an opaque selector with
// "Value: 0" — which is the exact shape a drainer sends.
const iface = new Interface([
  'function approve(address spender, uint256 value)',
  'function increaseAllowance(address spender, uint256 addedValue)',
  'function setApprovalForAll(address operator, bool approved)',
  // Permit2 (0x000000000022D473030F116dDEE9F6B43aC78BA3) direct approve.
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
]);

// The 4-byte selector for approve(address,uint256).
export const APPROVE_SELECTOR = '0x095ea7b3';
export const INCREASE_ALLOWANCE_SELECTOR = '0x39509351';
export const SET_APPROVAL_FOR_ALL_SELECTOR = '0xa22cb465';
export const PERMIT2_APPROVE_SELECTOR = '0x87517c45';

const APPROVAL_KINDS = Object.freeze({
  [APPROVE_SELECTOR]: 'approve',
  [INCREASE_ALLOWANCE_SELECTOR]: 'increaseAllowance',
  [SET_APPROVAL_FOR_ALL_SELECTOR]: 'setApprovalForAll',
  [PERMIT2_APPROVE_SELECTOR]: 'permit2Approve',
});

// Red-team fuzz 2026-09-22 (#2739): the shapes above are the ones we can decode
// and prove bounded/unlimited. Two more grant unlimited spend but hide it from a
// flat, single-level classifier, so before this they returned { isApprove:false }
// and S2/S3 answered OK ("Not an approval") -- a green confirm screen for a drain:
//   - multicall wrappers: an approve() nested inside multicall([...]). Routers
//     and aggregators use these legitimately; a drainer wraps an unlimited
//     approve in one.
//   - EIP-2612 / DAI permit() submitted as calldata: grants allowance with no
//     on-chain approve().
// We do NOT decode the inner calls (that would mean walking arbitrary nested
// calldata, breaking the pure/no-network contract). Recognising the family is
// enough: report it as an undecodable approval so the signals fail closed
// (INDETERMINATE, I4) instead of green-lighting it. Signature-based permit via
// eth_signTypedData is a separate surface (fromWalletConnect), out of scope here.
export const MULTICALL_SELECTOR = '0xac9650d8'; // multicall(bytes[])
export const MULTICALL_DEADLINE_SELECTOR = '0x5ae401dc'; // multicall(uint256,bytes[])
export const MULTICALL_PREVBLOCK_SELECTOR = '0x1f0464d1'; // multicall(bytes32,bytes[])
export const PERMIT_SELECTOR = '0xd505accf'; // EIP-2612 permit(...)
export const DAI_PERMIT_SELECTOR = '0x8fcbaf0c'; // DAI-style permit(...)

// Approval-family / wrapper selectors we refuse to prove bounded -> fail closed.
const OPAQUE_APPROVAL_KINDS = Object.freeze({
  [MULTICALL_SELECTOR]: 'wrappedCall',
  [MULTICALL_DEADLINE_SELECTOR]: 'wrappedCall',
  [MULTICALL_PREVBLOCK_SELECTOR]: 'wrappedCall',
  [PERMIT_SELECTOR]: 'permit',
  [DAI_PERMIT_SELECTOR]: 'permit',
});

// At or above half of 2^256 is, for any real token supply, effectively infinite
// — the canonical "unlimited approval" pattern (MaxUint256 and 2^256-1). Matches
// wallet-core/evm/calldata.js so the two modules agree on the threshold.
export const UNLIMITED_THRESHOLD = MaxUint256 / 2n;
// Permit2 amounts are uint160; half of 2^160 is the same "effectively infinite" bar.
const UINT160_UNLIMITED_THRESHOLD = (1n << 160n) / 2n;

const selectorOf = (data) =>
  typeof data === 'string' && data.length >= 10 ? data.slice(0, 10).toLowerCase() : null;

/**
 * Classify an unsigned tx's calldata as it relates to asset approvals.
 *
 * @param {string} data  hex calldata ('0x' for none)
 * @returns {{
 *   isApprove: boolean,   // selector is one of the approval shapes above
 *   decoded: boolean,     // args parsed cleanly (only meaningful when isApprove)
 *   kind?: 'approve'|'increaseAllowance'|'setApprovalForAll'|'permit2Approve',
 *   spender?: string,     // checksummed spender / operator when decoded
 *   token?: string,       // Permit2 only: the token being approved
 *   value?: bigint,       // approved amount when decoded (MaxUint256 for setApprovalForAll(true))
 *   unlimited?: boolean,  // value at or above the unlimited threshold, or operator grant
 *   revoke?: boolean,     // approve(x, 0) / setApprovalForAll(x, false)
 * }}
 *
 * A non-approval selector → { isApprove:false }. An approval selector whose bytes
 * cannot decode → { isApprove:true, decoded:false } so the caller fails closed.
 */
export function classifyApprove(data) {
  const sel = selectorOf(data);
  const kind = sel ? APPROVAL_KINDS[sel] : undefined;
  if (!kind) {
    // Approval-family / wrapper selector we can't prove bounded: report an
    // undecodable approval so S2/S3 fail closed (INDETERMINATE) rather than OK.
    const opaque = sel ? OPAQUE_APPROVAL_KINDS[sel] : undefined;
    if (opaque) return { isApprove: true, decoded: false, kind: opaque };
    return { isApprove: false, decoded: false };
  }
  try {
    const parsed = iface.parseTransaction({ data });
    if (!parsed) return { isApprove: true, decoded: false, kind };
    switch (kind) {
      case 'approve':
      case 'increaseAllowance': {
        const [spender, value] = parsed.args;
        return { isApprove: true, decoded: true, kind, spender, value,
          unlimited: value >= UNLIMITED_THRESHOLD, revoke: kind === 'approve' && value === 0n };
      }
      case 'setApprovalForAll': {
        const [operator, approved] = parsed.args;
        return { isApprove: true, decoded: true, kind, spender: operator,
          value: approved ? MaxUint256 : 0n, unlimited: Boolean(approved), revoke: !approved };
      }
      case 'permit2Approve': {
        const [token, spender, amount] = parsed.args;
        return { isApprove: true, decoded: true, kind, token, spender, value: amount,
          unlimited: amount >= UINT160_UNLIMITED_THRESHOLD, revoke: amount === 0n };
      }
      default:
        return { isApprove: true, decoded: false, kind };
    }
  } catch {
    return { isApprove: true, decoded: false, kind };
  }
}
