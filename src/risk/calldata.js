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

const iface = new Interface([
  'function approve(address spender, uint256 value)',
]);

// The 4-byte selector for approve(address,uint256).
export const APPROVE_SELECTOR = '0x095ea7b3';

// At or above half of 2^256 is, for any real token supply, effectively infinite
// — the canonical "unlimited approval" pattern (MaxUint256 and 2^256-1). Matches
// wallet-core/evm/calldata.js so the two modules agree on the threshold.
export const UNLIMITED_THRESHOLD = MaxUint256 / 2n;

const selectorOf = (data) =>
  typeof data === 'string' && data.length >= 10 ? data.slice(0, 10).toLowerCase() : null;

/**
 * Classify an unsigned tx's calldata as it relates to ERC-20 approve.
 *
 * @param {string} data  hex calldata ('0x' for none)
 * @returns {{
 *   isApprove: boolean,   // selector is approve(address,uint256)
 *   decoded: boolean,     // args parsed cleanly (only meaningful when isApprove)
 *   spender?: string,     // checksummed spender when decoded
 *   value?: bigint,       // approved amount when decoded
 *   unlimited?: boolean,  // value >= UNLIMITED_THRESHOLD when decoded
 * }}
 *
 * A non-approve selector → { isApprove:false }. An approve selector whose bytes
 * cannot decode → { isApprove:true, decoded:false } so the caller fails closed.
 */
export function classifyApprove(data) {
  if (selectorOf(data) !== APPROVE_SELECTOR) return { isApprove: false, decoded: false };
  try {
    const parsed = iface.parseTransaction({ data });
    if (!parsed || parsed.name !== 'approve') return { isApprove: true, decoded: false };
    const [spender, value] = parsed.args;
    return {
      isApprove: true,
      decoded: true,
      spender,
      value,
      unlimited: value >= UNLIMITED_THRESHOLD,
    };
  } catch {
    return { isApprove: true, decoded: false };
  }
}
