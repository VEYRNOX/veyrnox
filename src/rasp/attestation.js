// src/rasp/attestation.js
//
// RASP Phase 2b — REMOTE ATTESTATION (the egress leg).
// Option B: disclosed, deniability-gated, PRE-SIGN ONLY. Signed off 2026-07-13
// (docs/rasp-attestation-egress-decision.md).
//
// BUILT · UNAUDITED-PROVISIONAL · NOT DEVICE-VERIFIED · NOT INDEPENDENTLY AUDITED.
//
// WHAT THIS IS. The decision layer over the native remote-attestation plugins
// (Android Play Integrity, iOS App Attest). Unlike nativeProbe.js (Phase 2a,
// on-device only, NO egress), this leg makes a network call to Google/Apple to
// obtain a hardware-backed integrity verdict the local probes cannot reach
// (e.g. an OS-level compromise a rooted-hider masks). It composes WITH the
// on-device probe result: the stronger (more dangerous) of the two wins.
//
// ── HARD CONSTRAINTS (Option B, non-negotiable) ────────────────────────────
//
// I3 — DENIABILITY FIRST. isDeniabilitySessionActive() is the FIRST check in
//   attestationProbeSource(), BEFORE any platform check and BEFORE any bridge
//   call. Under a decoy/duress/hidden unlock this leg makes ZERO network calls —
//   returning { available:false } without ever invoking the verdict fn. This is
//   what stops the attestation call from becoming a wallet-set oracle: a network
//   observer must see byte-identical (i.e. NO) attestation traffic whether the
//   real or a decoy set is active. The probe takes no wallet-set handle.
//
// NEVER ON UNLOCK. This is called ONLY from the pre-sign gate, on an explicit
//   user sign action. It is deliberately NOT wired into WalletProvider.unlock —
//   attestation-on-unlock is the exact deniability trap §4 of the egress-decision
//   doc rejects. Do not import or call this from any unlock path.
//
// I4 — FAIL CLOSED. Non-native, verdict fn throws, plugin absent, or a verdict
//   with available !== true → { available:false } → detectAttestation maps that
//   to INTEGRITY_UNAVAILABLE (→ WARN via degrade), NEVER to CLEAN/ALLOW. A CLEAN
//   attestation result is reachable ONLY when the plugin genuinely ran and the
//   device met the integrity bar.
//
// I1/I5 — the payload is device/app integrity signals only, never key material,
//   and the signing-gate DECISION stays on-device: the verdict is parsed locally
//   (see the native plugins), no backend holds authority over whether to sign.
//
// ── HONEST LIMITATIONS (must not be overstated) ────────────────────────────
//   • Android: the Play Integrity JWS is NOT cryptographically signature-verified
//     on-device — no Google public key is bundled in this build. The verdict's
//     integrity rests on the Play Services delivery channel, not an on-device RS256
//     check. A future cycle can bundle Google's key and verify the JWS locally.
//   • iOS: App Attest requires the com.apple.developer.devicecheck.appattest-environment
//     entitlement (Apple Developer account + provisioning profile) which is NOT yet
//     present — so on iOS this leg is code-present but honestly UNAVAILABLE until the
//     entitlement + DeviceCheck.framework linkage land and are device-exercised.
//   • NOT device-verified on either platform; NOT independently audited.

import { Capacitor } from '@capacitor/core';
import { isDeniabilitySessionActive } from '@/wallet-core/deniabilitySession.js';
import { CONDITION } from './conditions.js';

// Option B was signed off 2026-07-13 (docs/rasp-attestation-egress-decision.md).
// This flag exists so the wiring layer (a follow-on PR into SendCrypto.jsx /
// useRaspArtifact) has one honest switch to consult. The module is BUILT but not
// device-verified; the flag being true means "the code path is landed and may be
// composed at the pre-sign gate", NOT "verified".
export const ATTESTATION_ENABLED = true;

// The honest fail-closed source: "we could not attest this device." Identical in
// shape to nativeProbe's UNAVAILABLE and detect()'s UNAVAILABLE default.
const UNAVAILABLE = Object.freeze({ available: false });

// Danger precedence (brief §4 ladder, extended with the attestation axis). The
// strongest (most dangerous) condition wins when two legs disagree. A higher rank
// is more dangerous. An UNKNOWN condition (anything not in this table) ranks above
// everything (Infinity) — fail-closed (I4): a garbage condition must never be
// silently treated as the weaker/safer one.
//
//   TAMPERED > HOOKED > INTEGRITY_FAIL > EMULATOR > ROOTED >
//   INTEGRITY_UNAVAILABLE > CLEAN
const DANGER_RANK = Object.freeze({
  [CONDITION.CLEAN]: 0,
  [CONDITION.INTEGRITY_UNAVAILABLE]: 1,
  [CONDITION.ROOTED]: 2,
  [CONDITION.EMULATOR]: 3,
  [CONDITION.INTEGRITY_FAIL]: 4,
  [CONDITION.HOOKED]: 5,
  [CONDITION.TAMPERED]: 6,
});

function dangerRank(condition) {
  return Object.prototype.hasOwnProperty.call(DANGER_RANK, condition)
    ? DANGER_RANK[condition]
    : Number.POSITIVE_INFINITY; // unknown → most dangerous (fail-closed, I4)
}

/**
 * Compose two detector CONDITIONS, returning the more dangerous one.
 *
 * PURE. No egress, no device, no key, no wallet-set handle. Used to fold the
 * native on-device probe condition together with the remote-attestation
 * condition so the stronger signal drives degrade(): e.g. a device that passes
 * the local probes (CLEAN) but FAILS remote attestation (INTEGRITY_FAIL) composes
 * to INTEGRITY_FAIL (BLOCK), while a device that passes attestation (CLEAN) but is
 * locally HOOKED composes to HOOKED (BLOCK). CLEAN ∘ CLEAN stays CLEAN, so a
 * genuine pass on both legs does not manufacture friction.
 *
 * Symmetric whenever one side is strictly stronger: compose(a,b) === compose(b,a).
 *
 * @param {string} a a CONDITION.* (or unknown → treated as most dangerous)
 * @param {string} b a CONDITION.* (or unknown → treated as most dangerous)
 * @returns {string} the more dangerous of the two
 */
export function composeConditions(a, b) {
  return dangerRank(a) >= dangerRank(b) ? a : b;
}

/**
 * Map a remote-attestation verdict to a CONDITION.
 *
 * PURE. FAIL CLOSED (I4):
 *   - null / undefined / available !== true → INTEGRITY_UNAVAILABLE (→ WARN)
 *   - available:true, attestationFailed:true → INTEGRITY_FAIL (→ BLOCK via degrade)
 *   - available:true, attestationFailed:false → CLEAN (does NOT worsen the native
 *     probe result when composed)
 *
 * @param {{ available?: boolean, attestationFailed?: boolean }|null|undefined} probeResult
 * @returns {string} a CONDITION.*
 */
export function detectAttestation(probeResult) {
  if (!probeResult || probeResult.available !== true) {
    return CONDITION.INTEGRITY_UNAVAILABLE;
  }
  return probeResult.attestationFailed === true ? CONDITION.INTEGRITY_FAIL : CONDITION.CLEAN;
}

/**
 * Obtain a remote-attestation ProbeSource for the pre-sign gate.
 *
 * ⚠️ CALL ONLY FROM THE PRE-SIGN GATE — NEVER FROM UNLOCK. ⚠️ (Option B §4.)
 *
 * Order of checks is load-bearing:
 *   1. I3 deniability guard FIRST — a decoy/hidden session makes ZERO egress and
 *      the verdict fn is never invoked.
 *   2. Native-platform guard — web has no attestation channel.
 *   3. Verdict fetch (native bridge), fail-closed on throw / bad shape.
 *
 * @param {null | (() => Promise<{available?:boolean, attestationFailed?:boolean}>)} [_verdictFn]
 *   Optional injected verdict source for testability. Default (null) lazily imports
 *   and calls the real native bridge (src/plugins/attestation.js). No wallet-set
 *   handle is ever accepted or passed (I3).
 * @returns {Promise<{ available: boolean, attestationFailed?: boolean }>}
 */
export async function attestationProbeSource(_verdictFn = null) {
  // (1) I3 DENIABILITY GUARD — FIRST, before any platform check or bridge call.
  // Under a decoy/duress/hidden session this leg must make zero network calls, so
  // it cannot become a wallet-set oracle. Returning here means the verdict fn is
  // never even constructed or invoked.
  if (isDeniabilitySessionActive()) {
    return UNAVAILABLE;
  }

  // (2) Web / non-native: no attestation channel — fail closed.
  if (!Capacitor.isNativePlatform()) {
    return UNAVAILABLE;
  }

  // (3) Fetch the verdict. The default source dynamically imports the native
  // bridge so the plugin stays out of the web/test bundle (same pattern as
  // nativeProbe.js). Any throw (plugin absent, Play Services missing, App Attest
  // unsupported/unentitled) → fail closed.
  let verdict;
  try {
    const fetchVerdict =
      _verdictFn ||
      (async () => {
        const { requestAttestationVerdict } = await import('@/plugins/attestation.js');
        // No set argument is ever passed (I3): the call is environment-only.
        return requestAttestationVerdict();
      });
    verdict = await fetchVerdict();
  } catch {
    return UNAVAILABLE;
  }

  // A non-object / null verdict, or one that did not genuinely attest, is "could
  // not evaluate" — never fabricate an available result.
  if (verdict == null || typeof verdict !== 'object' || verdict.available !== true) {
    return UNAVAILABLE;
  }

  // Normalise to the two-field ProbeSource shape detectAttestation consumes.
  return { available: true, attestationFailed: verdict.attestationFailed === true };
}
