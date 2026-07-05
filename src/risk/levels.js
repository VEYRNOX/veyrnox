// src/risk/levels.js
//
// Risk Scoring v1 — PROVISIONAL (ECC independent audit complete 2026-06-23).
//
// The five levels every signal may return, and their escalation priority. This
// file is pure constants (no logic, no I/O). It exists so signals, the composite
// and the UI all name the levels the same way.
//
// Ordering rules (used by the composite in score.js):
//   - priority: RISK > CAUTION > INFO > OK
//   - INDETERMINATE is NOT its own rank: per I4 (fail closed) it escalates to
//     CAUTION, so an un-evaluable signal can never read as "safe to sign".

export const LEVEL = Object.freeze({
  OK: 'OK',
  INFO: 'INFO',
  CAUTION: 'CAUTION',
  RISK: 'RISK',
  INDETERMINATE: 'INDETERMINATE',
});

// Higher number = higher priority in the composite. INDETERMINATE shares
// CAUTION's rank deliberately (fail-closed escalation).
export const PRIORITY = Object.freeze({
  [LEVEL.OK]: 0,
  [LEVEL.INFO]: 1,
  [LEVEL.CAUTION]: 2,
  [LEVEL.INDETERMINATE]: 2,
  [LEVEL.RISK]: 3,
});
