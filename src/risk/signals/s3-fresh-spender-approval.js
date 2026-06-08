// src/risk/signals/s3-fresh-spender-approval.js
//
// Risk Scoring v1 — UNAUDITED-PROVISIONAL.
//
// S3 — approval to a fresh spender. An approve() whose spender is not in this
// wallet-set's known-good spender set is the setup half of an approve-then-drain.
// It compounds with S2 (unlimited approval). Active-set-scoped only (I3); pure
// function of the calldata + local known-good set.
//
// Contract: approve to an unknown spender → RISK; approve to a known-good spender
// → OK; malformed approve → INDETERMINATE (fail closed); non-approve → OK.

import { LEVEL } from '../levels.js';
import { classifyApprove } from '../calldata.js';
import { entryAddr } from '../address.js';

/**
 * @param {{ data?: string }} unsignedTx
 * @param {{ knownGoodSpenders?: Array<string|{address:string}> }} activeSetLocalState
 * @param {object} _chainData  unused
 * @returns {{ level: string, evidence: { reason: string, values?: object } }}
 */
export function s3FreshSpenderApproval(unsignedTx, activeSetLocalState, _chainData) {
  const a = classifyApprove(unsignedTx?.data);

  if (!a.isApprove) return { level: LEVEL.OK, evidence: { reason: 'Not an approval.' } };
  if (!a.decoded) {
    return {
      level: LEVEL.INDETERMINATE,
      evidence: { reason: 'This looks like a token approval but its details could not be read.' },
    };
  }

  const known = new Set();
  for (const s of activeSetLocalState?.knownGoodSpenders || []) {
    const addr = entryAddr(s);
    if (addr) known.add(addr);
  }

  const spender = entryAddr(a.spender);
  if (spender && known.has(spender)) {
    return { level: LEVEL.OK, evidence: { reason: 'Approval is to a spender you have trusted before.' } };
  }

  return {
    level: LEVEL.RISK,
    evidence: {
      reason: 'This approves a spender you have not approved before — confirm you trust it.',
      values: { spender: a.spender },
    },
  };
}
