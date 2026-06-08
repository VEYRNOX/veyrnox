// src/risk/signals/s5-ens-mismatch.js
//
// Risk Scoring v1 — UNAUDITED-PROVISIONAL. AUDIT-PRIORITY SIGNAL.
//
// S5 — ENS / resolved mismatch. The UI may show a human-readable name (ENS) for
// the recipient. If the tx is actually addressed to a DIFFERENT address than that
// name resolves to, the display deceived the user and signing must stop.
//
// Resolution is LOCAL-CACHE ONLY and deterministic (I2: no new network call — the
// cache was populated when the UI resolved the name to display it). If the name
// cannot be resolved from the cache, or resolves to an unparseable address, the
// signal fails CLOSED (I4) → INDETERMINATE, never OK.
//
// Contract: name resolves to ≠ recipient → RISK; resolves to == recipient → OK;
// unresolvable → INDETERMINATE; no name shown (raw-address send) → OK.

import { LEVEL } from '../levels.js';
import { normAddr, addrEq } from '../address.js';

/**
 * @param {{ to?: string, displayedEns?: string|null }} unsignedTx
 * @param {{ ensCache?: Record<string,string> }} activeSetLocalState
 * @param {object} _chainData  unused
 * @returns {{ level: string, evidence: { reason: string, values?: object } }}
 */
export function s5EnsMismatch(unsignedTx, activeSetLocalState, _chainData) {
  const ens = unsignedTx?.displayedEns;

  // Not applicable: the user sent to a raw address, no name was displayed.
  if (!ens) return { level: LEVEL.OK, evidence: { reason: 'No name shown for the recipient.' } };

  const cache = activeSetLocalState?.ensCache || {};
  const resolved = normAddr(cache[ens]);

  // Fail closed: a displayed name we cannot deterministically resolve is treated
  // as un-evaluable, not as safe.
  if (!resolved) {
    return {
      level: LEVEL.INDETERMINATE,
      evidence: { reason: `The name ${ens} could not be verified against an address.`, values: { ens } },
    };
  }

  if (!addrEq(resolved, unsignedTx?.to)) {
    return {
      level: LEVEL.RISK,
      evidence: {
        reason: `${ens} points to a different address than this transaction is sending to.`,
        values: { ens, resolved, recipient: normAddr(unsignedTx?.to) || unsignedTx?.to },
      },
    };
  }

  return { level: LEVEL.OK, evidence: { reason: `${ens} matches the recipient address.` } };
}
