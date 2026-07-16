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
//
// P1-2 (audit batch, 2026-07-15): the null-artifact branch was previously fail-OPEN
// (returned blocked:false). Any caller passing a not-yet-populated artifact
// (missing/undefined useRaspArtifact() result, defensive default arg) bypassed the
// seed-reveal / export / import gate. Flipped to fail-CLOSED (I4). All real callers
// use useRaspArtifact() which always returns a valid degrade() artifact, so this
// only trips on a genuine missing-verdict condition — the desired security posture.

// Honest short sentence matching the style used by degrade.js WARN/BLOCK sentences.
const NULL_ARTIFACT_SENTENCE =
  "We couldn't confirm this device's integrity just now — this action is turned off.";

/**
 * @param {{ blockedActions: string[], sentence: string|null }|null|undefined} artifact
 * @param {string} action  'seed-reveal' | 'export' | 'import' | 'sign'
 * @returns {{ blocked: boolean, sentence: string|null }}
 */
export function sensitiveGate(artifact, action) {
  // P1-2 fail-closed (I4): a missing artifact means the RASP verdict is unknown.
  // Refuse sensitive actions rather than fall through as if the environment were clean.
  if (!artifact) return { blocked: true, sentence: NULL_ARTIFACT_SENTENCE };
  if (artifact.blockedActions.includes(action)) {
    return { blocked: true, sentence: artifact.sentence };
  }
  return { blocked: false, sentence: null };
}
