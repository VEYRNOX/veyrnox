// src/sign-gate/compose.js
//
// RASP §7 — chokepoint compose. PROVISIONAL (ECC independent audit complete 2026-06-23). Call-site LIVE (SendCrypto.jsx).
//
// The PURE compose logic of the one signer gate. The send path's two pre-sign
// planes — RASP (environment risk → degrade().tier) and Risk Scoring (tx risk →
// score().level) — evaluate INDEPENDENTLY and meet HERE, at the gate, by
// max-severity. This module is the ONLY place the two planes touch (brief §6:
// planes stay disjoint; the gate reads two finished results and lets neither feed
// the other). It is why this file lives in its own module, not inside either plane.
//
// SCOPE. This is the premise-independent half of §7: it consumes only
// the two LANDED output vocabularies (rasp TIER + risk LEVEL), so it is buildable
// and tested NOW. The LIVE call-site wiring in the send flow (and the call-site
// extension of the deniability test) is HELD until the tx-risk gate lands on the
// send path (feat/wire-risk-score-send-flow). degrade() already fail-closes an
// absent verdict to WARN (I4), so this compose never silent-allows on a parked
// detector.
//
// ⚠️ 4-VALUE LATTICE — a documented refinement of the brief's literal 3-value
// max-severity. FLAGGED for §10 sign-off. ⚠️
// RASP block-signing (HARD stop, no override) and tx RISK (destructive-confirm —
// "sign anyway") are NOT the same gate behaviour, though the brief's §3 maps both
// onto the top rank. Collapsing them would silently strip the risk plane's
// sign-anyway affordance. So the gate decision is a 4-value lattice:
//
//     allow  <  warn  <  confirm  <  block
//
//   allow   — signer reachable, no chokepoint friction.
//   warn    — signer reachable after one sentence + biometric re-confirm (RASP
//             warn-before-sign; tx CAUTION).
//   confirm — signer reachable only after explicit destructive-confirm / "sign
//             anyway" (tx RISK). The tx plane owns this affordance.
//   block   — signer NOT reachable. Hard stop, no override (RASP block-signing).
//             A hostile RUNTIME outranks a hostile TX precisely because the
//             confirmation itself can be hooked (RASP v1 brief §4).
//
// I4 (fail closed): an unrecognised RASP tier maps to BLOCK; an unrecognised tx
// level maps to CONFIRM (each plane's most-severe), so absence/garbage never
// reads as clean. I3 (deniability): composeGate takes (raspTier, txLevel) and NO
// wallet-set handle — it is set-blind by construction.

import { TIER } from '../rasp/index.js';
import { LEVEL } from '../risk/levels.js';

// The gate decision lattice. Higher rank = more restrictive = wins the compose.
export const DECISION = Object.freeze({
  ALLOW: 'allow',
  WARN: 'warn',
  CONFIRM: 'confirm',
  BLOCK: 'block',
});

const RANK = Object.freeze({
  [DECISION.ALLOW]: 0,
  [DECISION.WARN]: 1,
  [DECISION.CONFIRM]: 2,
  [DECISION.BLOCK]: 3,
});

// RASP response tier → gate decision. Unknown → BLOCK (fail closed: the env
// plane's most severe). degrade() itself fail-closes to block-signing, so this is
// belt-and-braces.
function raspDecision(raspTier) {
  switch (raspTier) {
    case TIER.ALLOW:
      return DECISION.ALLOW;
    case TIER.WARN: // warn-before-sign
      return DECISION.WARN;
    case TIER.BLOCK: // block-signing (hard)
      return DECISION.BLOCK;
    default:
      return DECISION.BLOCK;
  }
}

// Tx scorer level → gate decision. OK/INFO are non-gating (INFO is an advisory
// banner the risk plane renders on its own, orthogonal to the gate). CAUTION →
// warn; RISK → confirm (the sign-anyway affordance). INDETERMINATE mirrors the
// risk plane's own fail-closed escalation to CAUTION (warn). Unknown → CONFIRM
// (the tx plane's most severe), never allow.
function txDecision(txLevel) {
  switch (txLevel) {
    case LEVEL.OK:
    case LEVEL.INFO:
      return DECISION.ALLOW;
    case LEVEL.CAUTION:
    case LEVEL.INDETERMINATE:
      return DECISION.WARN;
    case LEVEL.RISK:
      return DECISION.CONFIRM;
    default:
      return DECISION.CONFIRM;
  }
}

/**
 * Compose the two finished pre-sign verdicts into one gate decision.
 *
 * PURE and set-blind: takes the RASP response tier and the tx scorer level, and
 * NOTHING else — no wallet-set handle (§5/I3). The highest-severity decision wins
 * and owns the one chokepoint sentence (design system: never two stacked warnings).
 *
 * @param {string} raspTier  a rasp TIER value (degrade().tier)
 * @param {string} txLevel   a risk LEVEL value (score().level)
 * @returns {{
 *   decision: string,         // DECISION.ALLOW | WARN | CONFIRM | BLOCK
 *   owner: ('rasp'|'tx'|null),// which plane owns the surfaced sentence (null at ALLOW)
 *   signerReachable: boolean, // false ONLY at BLOCK (hard stop, no override)
 * }}
 */
export function composeGate(raspTier, txLevel) {
  const rDec = raspDecision(raspTier);
  const tDec = txDecision(txLevel);
  const rRank = RANK[rDec];
  const tRank = RANK[tDec];

  const decision = rRank >= tRank ? rDec : tDec;

  let owner;
  if (decision === DECISION.ALLOW) {
    owner = null; // no chokepoint friction → no surfaced sentence
  } else if (rRank > tRank) {
    owner = 'rasp';
  } else if (tRank > rRank) {
    owner = 'tx';
  } else {
    // Equal non-allow rank (e.g. RASP warn + tx CAUTION). Default: the ENVIRONMENT
    // plane owns the copy. FLAGGED §10 open item ("should an environment block /
    // condition always own the copy when present?") — this is the tie default,
    // not a settled precedence.
    owner = 'rasp';
  }

  return {
    decision,
    owner: /** @type {"tx"|"rasp"} */ (owner),
    signerReachable: decision !== DECISION.BLOCK,
  };
}
