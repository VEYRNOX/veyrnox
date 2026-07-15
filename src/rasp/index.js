// src/rasp/index.js
//
// RASP v1 — runtime risk detection & honest degradation.
//
// THE §8a BUILD SEAM. RASP is split by AUDIT EXPOSURE, and this module ships only
// the LOW-exposure, pre-audit-safe half:
//
//   LANDED here — BUILT · pre-audit-safe:
//     • conditions.js  — pure CONDITION/TIER vocabulary.
//     • degrade.js     — pure condition → response-tier mapping (the §5 I3 policy).
//     • the deniability test (__tests__/i3-deniability.test.js) — the standing I3
//       guard, proving the response is byte-identical real-vs-decoy.
//     • detect.js — Phase 2a, the no-egress self-attested probe composition
//       (signals → CONDITION, FAIL CLOSED to INTEGRITY_UNAVAILABLE when no native
//       probe capability is present). Landed pre-audit-safe per the proposed
//       egress decision (Option A, docs/rasp-attestation-egress-decision.md,
//       sign-off pending): it
//       is a pure function of the environment only — no egress, no device I/O, no
//       key, no wallet-set handle — and is NOT yet wired into signing.
//   These are pure: no egress, no device, no key access. Safe to land now;
//   landing the deniability test early is protective.
//
//   LANDED — Phase 2b remote-attestation egress leg (Option B, signed off 2026-07-13,
//   docs/rasp-attestation-egress-decision.md):
//     • attestation.js — the Play Integrity / App Attest verdict client seam
//       (composeConditions / detectAttestation / attestationProbeSource). This IS
//       real egress + a backend touch, so it is DISCLOSED and DENIABILITY-GATED:
//       attestationProbeSource() checks isDeniabilitySessionActive() FIRST (zero
//       egress under decoy/hidden), is called ONLY at the pre-sign gate (never on
//       unlock), and fails closed to INTEGRITY_UNAVAILABLE (→ WARN). It is the only
//       source of the *attested* INTEGRITY_FAIL/INTEGRITY_UNAVAILABLE axis.
//   BUILT · UNAUDITED-PROVISIONAL · NOT device-verified · NOT independently audited.
//   Honest gaps: Android JWS is not on-device signature-verified (no Google key
//   bundled); iOS App Attest needs the appattest entitlement + DeviceCheck linkage.
//   The wiring into SendCrypto.jsx / useRaspArtifact is a SEPARATE follow-on PR;
//   this module + the native plugin layer are what land here. detect()'s on-device
//   probes still fail closed to INTEGRITY_UNAVAILABLE with no native capability, and
//   degrade() maps that to a WARN re-confirm (I4), so the safe default holds.
//
// Two planes, one chokepoint, no shared inputs (brief §6): this module is a pure
// function of (environment) ONLY. RASP signals never enter the tx scorer
// (src/risk), and tx signals never enter the degradation policy here. It NEVER
// touches the seed or private key (I1).
//
// "Code-ready ≠ verified" (§9): a detector is verified only when exercised against
// a real hostile runtime — which is exactly why the detection leg is held, not
// shipped with a green check it cannot honestly earn off an emulator.

export { CONDITION, TIER } from './conditions.js';
export { degrade } from './degrade.js';
export { detect, classifyEnvironment } from './detect.js';
export { browserProbeSource } from './browserProbe.js';
export { nativeProbeSource } from './nativeProbe.js';
export { resolveProbeSource } from './resolveProbeSource.js';
export { selectPresignProbeSource } from './selectPresignProbeSource.js';
export { sensitiveGate } from './sensitiveGate.js';
export { useRaspArtifact } from './useRaspArtifact.js';
export {
  ATTESTATION_ENABLED,
  attestationProbeSource,
  detectAttestation,
  composeConditions,
} from './attestation.js';
