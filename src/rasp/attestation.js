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
//   • Android: the Play Integrity JWS IS on-device signature-verified since PR
//     #943 (RS256 x5c chain-walk + strict Google-root SHA-256 pinset). Issue #951
//     (2026-07-14) added a raw R‖S → ASN.1 DER transcoder so the ES256 branch
//     is algorithmically correct too (before the fix, JCA received raw R‖S and
//     silently fail-closed on every real ES256 token — inert attested axis).
//     The issuer-string fallback has been removed. The pinned roots are NOT
//     device-verified against a real Play Integrity token yet — treat attestation
//     results as PROVISIONAL until Phase 4 + 5. A pin or chain mismatch currently
//     maps to INTEGRITY_UNAVAILABLE (WARN); changing that to INTEGRITY_FAIL needs
//     real-token verification first (issue #2276).
//   • iOS: Debug selects the development entitlement and Release selects production,
//     but release provisioning and device exercise have not confirmed it is present in
//     a signed build. The current implementation also has no independent DeviceCheck
//     signal. iOS is therefore honestly UNAVAILABLE until those gaps are resolved (#2277).
//   • NOT device-verified on either platform; NOT independently audited.

import { Capacitor } from '@capacitor/core';
// P2-3 (audit batch, 2026-07-15): use the LIVE deniability-OR-demo helper (added
// in PR #978, mirrors the I3 egress-gate pattern used elsewhere in wallet-core).
// isDeniabilitySessionActive alone
// misses the persisted `veyrnox-demo=1` localStorage flag — under demo mode the
// attestation bridge would still fire, potentially leaking a wallet-set oracle
// via the DEMO/real contrast. isDeniabilityOrDemoActive checks both signals fresh
// on every call and fail-closes on either read exception.
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession.js';
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
//   INTEGRITY_UNAVAILABLE > SCREEN_CAPTURE > ELEVATED > CLEAN
//
// SCREEN_CAPTURE (added 2026-08-25, M-5): active mirroring/recording on iOS. Ranks
// just above ELEVATED — it blocks strictly more (seed-reveal) — and below every
// condition that indicates a compromised runtime.
//
// L-5 (same audit): the ranks here and degrade.js's blockedActions must stay
// MONOTONIC — a higher rank must block a superset of every lower rank. EMULATOR
// violated that (rank 5, but ['sign'] only, vs ROOTED rank 4 blocking seed
// material). l5-tier-monotonicity.test.js now asserts the invariant over every
// ordered pair, so adding a condition here with a too-small blocked set turns red.
//
// ELEVATED (added 2026-07-16, owner-approved fix): the 8 "soft" environment
// signals split out of ROOTED (see nativeProbe.js / conditions.js / degrade.js).
// It ranks just above CLEAN and below every BLOCK-tier condition AND below
// ROOTED/INTEGRITY_UNAVAILABLE — a genuine ROOTED (or any stronger BLOCK
// condition) always outranks ELEVATED when both the native probe and the
// attestation leg are composed, so this fix cannot accidentally downgrade a
// real compromise signal to the milder ELEVATED tier.
const DANGER_RANK = Object.freeze({
  [CONDITION.CLEAN]: 0,
  [CONDITION.ELEVATED]: 1,
  [CONDITION.SCREEN_CAPTURE]: 2,
  [CONDITION.INTEGRITY_UNAVAILABLE]: 3,
  [CONDITION.ROOTED]: 4,
  [CONDITION.EMULATOR]: 5,
  [CONDITION.INTEGRITY_FAIL]: 6,
  [CONDITION.HOOKED]: 7,
  [CONDITION.TAMPERED]: 8,
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
 * ── P2-5 (2026-07-15) — iOS-SPECIFIC WEAKER MEANING OF A CLEAN RESULT ──────
 * On iOS the "subsequent runs" branch of AppAttestPlugin.m returns
 * { available:true, attestationFailed:false } from a successful LOCAL
 * `generateAssertion` call. That result proves ONLY "this app install still
 * holds its SE-enrolled App Attest key," NOT "this device is not
 * jailbroken." SE-key operations survive jailbreak, and Veyrnox's on-device
 * decision design (Option A, docs/rasp-attestation-egress-decision.md,
 * signed off 2026-07-13) deliberately omits server-side verification (I5 —
 * backend untrusted). So on iOS, CLEAN from this axis means "SE key intact,"
 * not "device integrity confirmed."
 *
 * This is safe under the compose lattice because
 * composeConditions(osProbeCondition, attestationCondition) returns the
 * MORE dangerous of the two: an iOS jailbreak surfaces via
 * TAMPERED/HOOKED from RaspIntegrityPlugin.m's on-device probes, which
 * outranks INTEGRITY_UNAVAILABLE/CLEAN from this leg. A future maintainer
 * MUST NOT read attestationFailed:false in isolation as "device is safe" —
 * always compose with the OS probe axis.
 *
 * On Android the CLEAN result is stronger (Play Integrity JWS verified
 * on-device since PR #943), though its strict root pinset is not yet
 * device-verified against a real Play Integrity token (G2-ROOTCERT-PIN).
 *
 * @param {{ available?: boolean, attestationFailed?: boolean }|null|undefined} probeResult
 * @returns {string} a CONDITION.*
 */
export function detectAttestation(probeResult) {
  if (!probeResult || probeResult.available !== true) {
    return CONDITION.INTEGRITY_UNAVAILABLE;
  }
  // P2-6c (audit batch, 2026-07-15): DEFENSE-IN-DEPTH against a compromised bridge.
  // A verdict lacking a well-formed boolean `attestationFailed` was previously
  // normalised to CLEAN (attestationFailed !== true fell through to CLEAN). Refuse
  // partial shapes and treat them as UNAVAILABLE (I4). Honest producers always
  // emit the boolean, so this only trips on garbage/tampered bridge output.
  if (typeof probeResult.attestationFailed !== 'boolean') {
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
// Codex P2 2026-08-16: session-scoped verdict latch. Prior behaviour let an
// attestationFailed:true (→ INTEGRITY_FAIL → BLOCK) verdict be downgraded to
// UNAVAILABLE (→ WARN) on the NEXT presign just by suppressing the attestation
// response (bridge kill, WAF drop, plugin timeout). This is a "block once, warn
// forever" oracle: an attacker that can silently drop attestation responses
// after a real fail can flip a BLOCK into a re-confirm-and-continue prompt.
//
// Latch: once we see attestationFailed:true within this session, subsequent
// UNAVAILABLE (from timeout/throw/partial shape) INHERITS the failed verdict
// so the tier stays BLOCK. Only an explicit fresh attestationFailed:false
// (a real, verified PASS) clears it — that requires the attacker to defeat
// the WHOLE attestation chain, not merely mute it.
//
// Reset ON APP_LOCK_EVENT so a fresh user session starts with a clean latch
// (a rebooted-to-clean device is legitimate and should not be permanently
// BLOCK-tiered from a prior session's compromise). WalletProvider.lock()
// dispatches APP_LOCK_EVENT on every lock path.
let _sessionAttestationFailed = false;
if (typeof window !== 'undefined' && !(/** @type {any} */ (window)).__veyrnoxRaspLatchHook) {
  /** @type {any} */ (window).__veyrnoxRaspLatchHook = true;
  window.addEventListener('veyrnox:app-lock', () => { _sessionAttestationFailed = false; });
}

export async function attestationProbeSource(_verdictFn = null) {
  // (1) I3 DENIABILITY GUARD — FIRST, before any platform check or bridge call.
  // Under a decoy/duress/hidden session this leg must make zero network calls, so
  // it cannot become a wallet-set oracle. Returning here means the verdict fn is
  // never even constructed or invoked.
  if (isDeniabilityOrDemoActive()) {
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
    // Codex P2 2026-08-16 latch: preserve prior fail across a mute.
    return _sessionAttestationFailed
      ? { available: true, attestationFailed: true }
      : UNAVAILABLE;
  }

  // A non-object / null verdict, or one that did not genuinely attest, is "could
  // not evaluate" — never fabricate an available result.
  if (verdict == null || typeof verdict !== 'object' || verdict.available !== true) {
    return _sessionAttestationFailed
      ? { available: true, attestationFailed: true }
      : UNAVAILABLE;
  }

  // P2-6c (audit batch, 2026-07-15): DEFENSE-IN-DEPTH against a compromised bridge.
  // Previously `attestationFailed === true` boolean-coerced any non-true value to
  // false → CLEAN. A bridge returning `{ available:true }` (no attestationFailed at
  // all) or a non-boolean would silently fabricate a passing attestation. Refuse
  // partial shapes and fail closed (I4). Honest producers always emit the boolean.
  if (typeof verdict.attestationFailed !== 'boolean') {
    return _sessionAttestationFailed
      ? { available: true, attestationFailed: true }
      : UNAVAILABLE;
  }

  // Fresh well-formed verdict — update the latch:
  //   attestationFailed:true  → latch ON  (stays through subsequent mutes)
  //   attestationFailed:false → latch OFF (a real PASS is the only legitimate way
  //                                        to clear a prior FAIL; the attacker
  //                                        must defeat the whole chain, not mute)
  _sessionAttestationFailed = verdict.attestationFailed === true;

  // Normalise to the two-field ProbeSource shape detectAttestation consumes.
  return { available: true, attestationFailed: verdict.attestationFailed };
}

// Exported for tests only — reset the session latch without dispatching a lock.
export function _resetAttestationLatchForTests() {
  _sessionAttestationFailed = false;
}
