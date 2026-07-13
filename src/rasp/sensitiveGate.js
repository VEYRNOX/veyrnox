// src/rasp/sensitiveGate.js
//
// RASP G4 — gate for sensitive non-sign actions (seed-reveal, export, import).
//
// `degrade()` populates `blockedActions` with the SENSITIVE set for the strongest
// BLOCK tiers (HOOKED, TAMPERED, INTEGRITY_FAIL, fail-closed). This gate consumes
// that set at entry points for seed-reveal / export / import so a BLOCK-tier
// environment cannot exfiltrate key material via those paths.
//
// WARN tiers (ROOTED, INTEGRITY_UNAVAILABLE) have `blockedActions: []` — seed
// access passes through on WARN. The biometric re-confirm from B5 already gates
// the send path; blocking reveal on a WARN device would deadlock recovery.
//
// PURE. No egress, no wallet-set handle (I3). Safe to call in any session type.

/**
 * @param {{ blockedActions: string[], sentence: string|null }|null|undefined} artifact
 * @param {string} action  'seed-reveal' | 'export' | 'import' | 'sign'
 * @returns {{ blocked: boolean, sentence: string|null }}
 */
export function sensitiveGate(artifact, action) {
  if (!artifact) return { blocked: false, sentence: null };
  if (artifact.blockedActions.includes(action)) {
    return { blocked: true, sentence: artifact.sentence };
  }
  return { blocked: false, sentence: null };
}
