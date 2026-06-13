// src/sign-gate/presign.js
//
// RASP §7 live wiring — UNAUDITED-PROVISIONAL. Roadmap Phase 3.
//
// The PURE pre-sign decision the send chokepoint enforces. It composes the two
// disjoint planes (RASP env tier + tx-risk level) via composeGate, then applies
// the single proceed/refuse rule the signer path obeys. Keeping this a pure
// function (not inline JSX) is what makes the audit-critical gate unit-testable —
// the call site in SendCrypto.jsx is a thin caller.
//
// SET-BLIND (I3). Takes (raspTier, txLevel, acknowledged) and NOTHING that can
// reach wallet-set identity — no walletSet handle, no import to set state. The
// decision is identical whichever set is active (the §5 call-site line-item; the
// deniability test drives the full condition range and is verified to bite).
//
// proceed rule (§3 affordance table):
//   allow   → proceed.
//   warn    → proceed. The re-confirm is the EXISTING verify-step biometric, which
//             gates BEFORE this point; warn adds no hard stop here.
//   confirm → proceed ONLY with the user's "sign anyway" acknowledgement (tx RISK
//             destructive-confirm).
//   block   → NEVER proceed. No override — a hostile runtime can hook the very
//             confirmation, so an ack cannot buy past it (composeGate already makes
//             block outrank confirm).

import { composeGate, DECISION } from './compose.js';

/**
 * Compose the pre-sign gate and decide whether the signer may be reached now.
 *
 * @param {string} raspTier  a rasp TIER (degrade().tier); pass TIER.ALLOW when the
 *                           RASP gate flag is off, so RASP contributes no friction.
 * @param {string} txLevel   a risk LEVEL (score().level)
 * @param {boolean} [acknowledged]  the user's "sign anyway" acknowledgement
 * @returns {{
 *   decision: string,          // DECISION.ALLOW | WARN | CONFIRM | BLOCK
 *   owner: ('rasp'|'tx'|null), // which plane owns the one surfaced sentence
 *   signerReachable: boolean,  // false only at BLOCK (hard stop)
 *   proceedAllowed: boolean,   // may the signer be reached now?
 * }}
 */
export function presignGate(raspTier, txLevel, acknowledged = false) {
  const gate = composeGate(raspTier, txLevel);
  const proceedAllowed =
    gate.signerReachable && (gate.decision !== DECISION.CONFIRM || acknowledged === true);
  return {
    decision: gate.decision,
    owner: gate.owner,
    signerReachable: gate.signerReachable,
    proceedAllowed,
  };
}
