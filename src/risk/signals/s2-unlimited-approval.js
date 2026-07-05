// src/risk/signals/s2-unlimited-approval.js
//
// Risk Scoring v1 — PROVISIONAL (ECC independent audit complete 2026-06-23). AUDIT-PRIORITY SIGNAL.
//
// S2 — unlimited approval. The classic token-drainer vector: a victim signs
// approve(spender, value) where value is effectively infinite, handing the
// spender unlimited spend over the token. Pure function of the unsigned tx's
// calldata — no network, no signer, no seed (I1/I2).
//
// Contract: hit → RISK; an approve whose calldata is malformed → INDETERMINATE
// (I4 fail closed, never OK); anything that is not an approve → OK (S2 has no
// opinion on non-approve txs).

import { LEVEL } from '../levels.js';
import { classifyApprove } from '../calldata.js';

/**
 * @param {{ data?: string }} unsignedTx
 * @param {object} _activeSetLocalState  unused (S2 is tx-only)
 * @param {object} _chainData            unused
 * @returns {{ level: string, evidence: { reason: string, values?: object } }}
 */
export function s2UnlimitedApproval(unsignedTx, _activeSetLocalState, _chainData) {
  const a = classifyApprove(unsignedTx?.data);

  if (!a.isApprove) {
    return { level: LEVEL.OK, evidence: { reason: 'Not an approval.' } };
  }
  if (!a.decoded) {
    return {
      level: LEVEL.INDETERMINATE,
      evidence: { reason: 'This looks like a token approval but its details could not be read.' },
    };
  }
  if (a.unlimited) {
    return {
      level: LEVEL.RISK,
      evidence: {
        reason: 'This grants unlimited spending of your tokens to the spender.',
        values: { spender: a.spender },
      },
    };
  }
  return { level: LEVEL.OK, evidence: { reason: 'Approval is for a bounded amount.' } };
}
