// src/rasp/detect.js
//
// RASP v1 — environment detection: the self-attested probe leg (Phase 2a).
// BUILT · pre-audit-safe · NO EGRESS, per docs/rasp-attestation-egress-decision.md
// (Option A proposed, sign-off pending): on-device probes only; the remote-attestation
// leg (2b, Play Integrity / App Attest) stays parked behind the audit.
//
// Two pure parts:
//   classifyEnvironment(signals) — precedence map from on-device probe signals to
//     a CONDITION. The strongest (most dangerous) signal wins.
//   detect(probeSource) — read signals from a probe capability and classify, but
//     FAIL CLOSED to INTEGRITY_UNAVAILABLE when no real probe capability is present
//     (web build, or no native plugin). It NEVER reports CLEAN off a runtime it
//     could not actually inspect — a fake "clean" would be fake security.
//
// HONESTY BOUNDARY. There is no native probe implementation in this build, so the
// default source is UNAVAILABLE_PROBE_SOURCE ({ available: false }) and detect()
// returns INTEGRITY_UNAVAILABLE — the truthful "we could not evaluate this device"
// state, which degrade() maps to WARN (biometric re-confirm), not ALLOW. A real
// native ProbeSource (a Capacitor plugin) is the seam the native layer fills
// later; until it exists AND is real-device-verified (roadmap Phase 4), RASP
// detection stays unverified and the dashboard stays `pending`.
//
// DENIABILITY (I3). detect()/classifyEnvironment() are pure functions of the
// ENVIRONMENT only — no walletSet handle, no import that can reach set identity,
// exactly like degrade(). The condition is identical whichever set is active, so
// detection adds no wallet-set oracle.
//
// WIRED. Imported by SendCrypto.jsx via detect(browserProbeSource) → degrade() →
// presignGate() — HOOKED environment produces signerReachable:false and blocks
// the send (not just a warning). Browser-probe leg active; OS-level attestation
// (native Capacitor plugin) remains audit-gated pending real-device verification.
//
// SCOPE. INTEGRITY_FAIL is an ATTESTATION outcome (the parked 2b leg); the
// on-device probes here only produce TAMPERED / HOOKED / EMULATOR / ROOTED / CLEAN,
// plus the fail-closed INTEGRITY_UNAVAILABLE when probes cannot run.

import { CONDITION } from './conditions.js';

/**
 * @typedef {{ tampered?: boolean, hooked?: boolean, emulator?: boolean, rooted?: boolean }} ProbeSignals
 * The seam a native layer implements. `available` MUST be exactly true to assert
 * the probes genuinely ran; anything else is treated as "could not evaluate".
 * @typedef {{ available: boolean, signals?: ProbeSignals }} ProbeSource
 */

// Danger precedence: the strongest condition a signal set implies wins. tamper and
// hook are full-block; emulator blocks production but degrade() permits testnet;
// rooted is warn. All-clear is the ONLY path to CLEAN. Absent/undefined signal
// fields count as "not observed" (false), never as a clean affirmation.
//
// Signature note: the `signals` param carries NO default in the declaration, so
// the function's arity stays 1 (the I3 set-blind contract the deniability test
// asserts: it accepts the environment signals and NOTHING else — no wallet-set
// handle). The empty-object fallback is applied inside the body instead.
export function classifyEnvironment(signals) {
  signals = signals || {};
  if (signals.tampered) return CONDITION.TAMPERED;
  if (signals.hooked) return CONDITION.HOOKED;
  if (signals.emulator) return CONDITION.EMULATOR;
  if (signals.rooted) return CONDITION.ROOTED;
  return CONDITION.CLEAN;
}

// The default, honest "no probe capability" source. Out of the box RASP cannot
// inspect the runtime (no native plugin in this build), so it is UNAVAILABLE —
// never silently clean.
export const UNAVAILABLE_PROBE_SOURCE = Object.freeze({ available: false });

/**
 * Detect the environment condition from a probe source.
 * FAIL CLOSED: when the source cannot genuinely evaluate the runtime
 * (available !== true), returns INTEGRITY_UNAVAILABLE (→ WARN via degrade), never
 * CLEAN. CLEAN is reachable only when an available source ran and found nothing.
 * @param {ProbeSource} [probeSource]
 * @returns {string} a CONDITION.*
 */
export function detect(probeSource = UNAVAILABLE_PROBE_SOURCE) {
  if (!probeSource || probeSource.available !== true) {
    return CONDITION.INTEGRITY_UNAVAILABLE;
  }
  return classifyEnvironment(probeSource.signals || {});
}
