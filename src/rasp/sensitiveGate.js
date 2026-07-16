// src/rasp/sensitiveGate.js
//
// RASP G4 — gate for sensitive non-sign actions (seed-reveal, export, import).
//
// `degrade()` populates `blockedActions` with the SENSITIVE set for the strongest
// BLOCK tiers (HOOKED, TAMPERED, INTEGRITY_FAIL, fail-closed). This gate consumes
// that set at entry points for seed-reveal / export / import so a BLOCK-tier
// environment cannot exfiltrate key material via those paths.
//
// Only the ELEVATED tier (soft environment signals — developer mode, an
// accessibility service, etc.; added 2026-07-16) has `blockedActions: []`, so seed
// access passes through there with just a biometric re-confirm (B5) — blocking
// backup on a benign dev-device state would deadlock recovery. GENUINE-threat
// conditions still block seed-reveal/export/import here: ROOTED (real root/
// jailbreak), TAMPERED, HOOKED, INTEGRITY_FAIL, and INTEGRITY_UNAVAILABLE all carry
// the SENSITIVE set. NOTE (2026-07-16): local seed-material surfaces call
// useRaspArtifact({ excludeAttestation: true }), so the REMOTE Play-Integrity leg
// (unavailable by design on any sideloaded build → INTEGRITY_UNAVAILABLE) is never
// composed into the artifact this gate sees — only the on-device leg is, so backup
// is gated on genuine on-device threats, not on an unreachable remote attestation.
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
