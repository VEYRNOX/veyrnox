// src/risk/signals/s6-dust-input.js
//
// Risk Scoring v1 — UNAUDITED-PROVISIONAL.
//
// S6 — dust input present. Dusting deanonymises: a tiny tagged input, once
// consolidated with real funds, links the victim's addresses. Warn when a tx
// spends a known dust-tagged input. Active-set-scoped (I3); pure set-membership.
//
// The unsigned tx may carry `inputs` (e.g. UTXO ids on BTC). EVM txs have no
// input concept, so `inputs === undefined` is not-applicable → OK. An `inputs`
// field that is PRESENT but not an array means the spend set was expected yet is
// unreadable → INDETERMINATE (fail closed).

import { LEVEL } from '../levels.js';

/**
 * @param {{ inputs?: Array<string> }} unsignedTx
 * @param {{ dustInputs?: Array<string> }} activeSetLocalState
 * @param {object} _chainData  unused
 * @returns {{ level: string, evidence: { reason: string, values?: object } }}
 */
export function s6DustInput(unsignedTx, activeSetLocalState, _chainData) {
  const inputs = unsignedTx?.inputs;

  // Not applicable: no input concept for this tx (e.g. an EVM send).
  if (inputs === undefined) return { level: LEVEL.OK, evidence: { reason: 'No spendable inputs to screen.' } };

  // Fail closed: inputs were expected (field present) but cannot be read.
  if (!Array.isArray(inputs)) {
    return { level: LEVEL.INDETERMINATE, evidence: { reason: 'The inputs being spent could not be read.' } };
  }

  const dust = new Set(activeSetLocalState?.dustInputs || []);
  const spentDust = inputs.filter((i) => dust.has(i));

  if (spentDust.length > 0) {
    return {
      level: LEVEL.CAUTION,
      evidence: {
        reason: 'This spends a dust input that was sent to you — consolidating it can link your addresses.',
        values: { dustInputs: spentDust },
      },
    };
  }

  return { level: LEVEL.OK, evidence: { reason: 'No dust-tagged inputs are being spent.' } };
}
