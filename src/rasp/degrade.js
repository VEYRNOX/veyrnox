// src/rasp/degrade.js
//
// RASP v1 — degradation policy. BUILT · pre-audit-safe (brief §8a).
//
// §8a tags this part LOW audit-exposure: a pure function, no egress, no device,
// no key access — safe to land now, and landing it (with its deniability test)
// EARLY is protective, not risky, because the deniability test is the standing
// I3 guard. "Pre-audit-safe" does NOT mean "no audit": the §5 response-symmetry
// CONSTRUCTION remains an audit REVIEW line-item (same posture as the audit-log
// storage shape and the R2 capability-proof). What is pre-audit-safe is BUILDING
// and TESTING it, not declaring it verified.
//
// THE I3 LINE-ITEM (brief §5). This module is the degradation POLICY: a PURE
// mapping condition → response artifact. It is the one RASP element whose
// construction the independent audit reviews, because it sits on the pre-sign
// path that the unlock resolves into.
//
// ⚠️ DENIABILITY INVARIANT — enforced structurally, do NOT relax. ⚠️
//   degrade() takes `(condition)` and NOTHING ELSE. There is deliberately NO
//   `walletSet` parameter in scope here, and no import that can reach set
//   identity. The response (tier + copy + blocked-action set + friction) is a
//   pure function of the detector condition, so it is byte-identical whether the
//   active set is real or decoy. A response that branched on set identity would
//   be a wallet-set oracle (defeats D2/D4). The deniability test asserts this.
//
// FAIL CLOSED (I4). Any condition this table does not recognise — including
// undefined/null/garbage — maps to the strongest BLOCK artifact, never ALLOW.
// Absence of a clean signal is never read as a clean signal.
//
// NO DESTRUCTIVE OVERRIDE on environment risk (§4). Unlike a tx-level "sign
// anyway", a hostile runtime is not something the user can confirm past: the
// confirmation itself can be hooked. So BLOCK artifacts carry no biometric/
// override affordance. A WARN biometric re-confirm is a TARGET (the
// `requiresBiometric` field), NOT currently enforced — compose.js treats WARN
// as proceed-allowed with no biometric step. Copy must not imply it is live.

import { CONDITION, TIER } from './conditions.js';

// The sensitive non-sign paths that the strongest tiers also refuse at entry
// (brief §7: seed reveal / export / import are the highest-danger moments).
const SENSITIVE = Object.freeze(['sign', 'seed-reveal', 'export', 'import']);

// Specs are pure data. Each carries the SAME fields so every artifact has an
// identical shape (a precondition for the §5 structural-identity assertion).
const SPECS = Object.freeze({
  [CONDITION.CLEAN]: {
    tier: TIER.ALLOW,
    sentence: null,
    blockedActions: [],
    requiresBiometric: false,
  },
  [CONDITION.ROOTED]: {
    // `requiresBiometric: true` is a TARGET signal NOT currently wired to gate
    // enforcement: compose.js treats WARN as proceed-allowed with no biometric
    // step (the WARN biometric re-confirm is unbuilt). So the copy warns and
    // advises caution WITHOUT claiming an enforced biometric re-confirm.
    tier: TIER.WARN,
    sentence:
      'This device looks modified (rooted or jailbroken), which can weaken its protections — continue only if you trust it.',
    blockedActions: [],
    requiresBiometric: true,
  },
  [CONDITION.INTEGRITY_UNAVAILABLE]: {
    // requiresBiometric is TARGET only (see ROOTED note): no enforced biometric
    // re-confirm exists, so the copy must not promise one.
    tier: TIER.WARN,
    sentence:
      "We couldn't confirm this device's integrity just now — continue with extra caution.",
    blockedActions: [],
    requiresBiometric: true,
  },
  [CONDITION.EMULATOR]: {
    // Production sign blocked. RASP-A4 (2026-07-05 internal audit): the former
    // `permitsTestnet: true` carve-out was a DEAD field — compose.js maps BLOCK →
    // signerReachable:false for EVERY send, testnet included, so nothing ever
    // consumed it. Removed to avoid misleading future callers. Emulator blocks all
    // sends, and the copy does not promise testnet.
    tier: TIER.BLOCK,
    sentence: 'Signing is turned off in emulated environments.',
    blockedActions: ['sign'],
    requiresBiometric: false,
  },
  [CONDITION.INTEGRITY_FAIL]: {
    tier: TIER.BLOCK,
    sentence:
      'This device failed an integrity check, so signing and key access are turned off.',
    blockedActions: [...SENSITIVE],
    requiresBiometric: false,
  },
  [CONDITION.HOOKED]: {
    tier: TIER.BLOCK,
    sentence:
      'Another program appears to be inspecting this app, so signing and key access are turned off until it stops.',
    blockedActions: [...SENSITIVE],
    requiresBiometric: false,
  },
  [CONDITION.TAMPERED]: {
    tier: TIER.BLOCK,
    sentence:
      'This app appears to have been altered, so signing and key access are turned off.',
    blockedActions: [...SENSITIVE],
    requiresBiometric: false,
  },
});

// The fail-closed default (I4): strongest BLOCK, sensitive paths refused. Used for
// ANY unrecognised condition.
const FAIL_CLOSED = Object.freeze({
  tier: TIER.BLOCK,
  sentence: "We couldn't safely evaluate this device, so signing and key access are turned off.",
  blockedActions: [...SENSITIVE],
  requiresBiometric: false,
});

/**
 * Map a detector condition to its response artifact.
 *
 * PURE. Takes the condition and nothing else — NO wallet-set handle (§5). The
 * output is identical for a real set and a decoy set by construction.
 *
 * @param {string} condition one of CONDITION.* (anything else fails closed)
 * @returns {{
 *   tier: string,                 // TIER.ALLOW | TIER.WARN | TIER.BLOCK
 *   sentence: string|null,        // the one plain-language sentence (null when ALLOW)
 *   blockedActions: string[],     // actions refused at this tier (fresh array)
 *   requiresBiometric: boolean,   // TARGET WARN biometric re-confirm — NOT consumed by the live gate yet
 * }}
 *
 * NOTE (RASP-A4): the former `permitsTestnet` field was removed — it had zero live
 * consumers (compose.js maps BLOCK → signerReachable:false for every send, testnet
 * included). A dead API field in a security module misleads callers, so it is gone.
 */
export function degrade(condition) {
  const spec = Object.prototype.hasOwnProperty.call(SPECS, condition) ? SPECS[condition] : FAIL_CLOSED;
  // Return a fresh artifact (and a fresh blockedActions array) so callers cannot
  // mutate the shared spec table.
  return {
    tier: spec.tier,
    sentence: spec.sentence,
    blockedActions: [...spec.blockedActions],
    requiresBiometric: spec.requiresBiometric,
  };
}
