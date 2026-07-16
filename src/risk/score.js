// @ts-nocheck
// src/risk/score.js
//
// Risk Scoring v1 — PROVISIONAL (ECC independent audit complete 2026-06-23).
//
// The composite scorer. Pure: no I/O, no network, no signer, no seed. It runs the
// eight signals over the unsigned tx + active-set local state + already-fetched
// chain data, and reduces them to ONE verdict the send screen can render.
//
//   priority: RISK > CAUTION > INFO > OK
//   INDETERMINATE → reported as CAUTION (I4 fail-closed escalation): an
//     un-evaluable signal can never read as "safe to sign".
//   composite level = the highest-priority fired signal; that signal owns the
//     ONE sentence (design system: never a wall of warnings).
//
// FAIL CLOSED: a signal that THROWS is caught and treated as INDETERMINATE, so a
// crashing check escalates (blocks) rather than bypassing to OK. Integration note
// for the send flow: call score() BETWEEN tx construction and signer invocation;
// if score() itself ever throws, the caller MUST fail closed and not sign. When
// `requiresConfirmation` is true (RISK), the signer must not be reached until the
// user confirms the destructive-path ("Sign anyway").
//
// I3 (deniability): every signal reads only the ACTIVE set's local state. The
// result shape (level, sentence, evidence, signalId, signals[]) is identical for
// a decoy set and a real set — nothing in the output reveals another set exists.

import { LEVEL, PRIORITY } from './levels.js';
import { s1FreshRecipient } from './signals/s1-fresh-recipient.js';
import { s2UnlimitedApproval } from './signals/s2-unlimited-approval.js';
import { s3FreshSpenderApproval } from './signals/s3-fresh-spender-approval.js';
import { s4AddressPoisoning } from './signals/s4-address-poisoning.js';
import { s5EnsMismatch } from './signals/s5-ens-mismatch.js';
import { s6DustInput } from './signals/s6-dust-input.js';
import { s7CalldataMismatch } from './signals/s7-calldata-mismatch.js';
import { s8ValueAnomaly } from './signals/s8-value-anomaly.js';

// Registry order is the tie-breaker when several signals fire at the SAME
// priority: the earlier entry owns the sentence. The attacker-targeted RISK
// signals (S2 unlimited, S3 fresh-spender, S4 poisoning, S5 ENS) are placed ahead
// of the softer ones so the most actionable warning wins a tie.
//
// M-3 (explicit tie-ordering decision): S2 ("unlimited spending approval") precedes
// S3 ("first-time approval to untrusted spender"). On a first-time unlimited approve
// both fire at RISK tier. S2 wins because the UNLIMITED amount is the more acute
// threat — even a trusted spender receiving unlimited allowance is dangerous. This
// is a deliberate product decision: if the ordering is ever reversed, update this
// comment and the corresponding test in score.test.js.
export const SIGNALS = Object.freeze([
  { id: 'S2', fn: s2UnlimitedApproval },
  { id: 'S3', fn: s3FreshSpenderApproval },
  { id: 'S4', fn: s4AddressPoisoning },
  { id: 'S5', fn: s5EnsMismatch },
  { id: 'S7', fn: s7CalldataMismatch },
  { id: 'S6', fn: s6DustInput },
  { id: 'S1', fn: s1FreshRecipient },
  { id: 'S8', fn: s8ValueAnomaly },
]);

// An INDETERMINATE result is reported to the UI as CAUTION (fail-closed). All
// other levels report as themselves.
function reportLevel(level) {
  return level === LEVEL.INDETERMINATE ? LEVEL.CAUTION : level;
}

/**
 * Evaluate an unsigned transaction against all risk signals.
 *
 * @param {object} unsignedTx          the tx about to be signed (to, value, data, chainId, displayedEns?, inputs?)
 * @param {object} activeSetLocalState the ACTIVE wallet-set's local state only (I3)
 * @param {object} chainData           data already fetched to build the tx (e.g. recipientCode)
 * @param {Array<{id:string, fn:Function}>} [signals]  registry override (testing)
 * @returns {{
 *   level: string,                 // OK | INFO | CAUTION | RISK (never INDETERMINATE)
 *   sentence: string|null,         // the one sentence; null when OK
 *   evidence: object|null,         // winning signal's evidence (reason + mono values)
 *   signalId: string|null,         // which signal owns the verdict
 *   requiresConfirmation: boolean, // true only on RISK (destructive-confirm gate)
 *   signals: Array<{id, level, evidence}>, // every signal's result (fixed shape)
 * }}
 */
export function score(unsignedTx, activeSetLocalState, chainData, signals = /** @type {any} */ (SIGNALS)) {
  const evaluated = signals.map(({ id, fn }) => {
    try {
      const out = fn(unsignedTx, activeSetLocalState, chainData) || {};
      const level = out.level || LEVEL.INDETERMINATE;
      const evidence = out.evidence || { reason: '' };
      return { id, level, evidence };
    } catch {
      // Fail closed: a crashing check escalates, it does not bypass.
      return { id, level: LEVEL.INDETERMINATE, evidence: { reason: 'A risk check could not complete.' } };
    }
  });

  let winner = null;
  let maxPriority = 0;
  for (const s of evaluated) {
    const p = PRIORITY[s.level] ?? 0;
    if (p > maxPriority) {
      maxPriority = p;
      winner = s;
    }
  }

  const level = winner ? reportLevel(winner.level) : LEVEL.OK;
  return {
    level,
    sentence: winner ? winner.evidence.reason : null,
    evidence: winner ? winner.evidence : null,
    signalId: winner ? winner.id : null,
    requiresConfirmation: level === LEVEL.RISK || level === LEVEL.CAUTION,
    signals: evaluated,
  };
}
