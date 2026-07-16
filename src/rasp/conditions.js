// src/rasp/conditions.js
//
// RASP v1 — pure-policy vocabulary. BUILT · pre-audit-safe (brief §8a).
//
// Pure constants (no logic, no I/O, no egress, no device, no key access) shared
// by the degradation policy (degrade.js) and any future UI. Mirrors the role of
// src/risk/levels.js for the Risk Scoring plane: one place that names the detector
// conditions and the three response tiers so every layer spells them the same way.
//
// SCOPE: this is the LANDED pre-audit-safe half of RASP. The detection/composition
// vocabulary (the integrity verdict, the severity ranking) lives with the
// audit-gated detect.js leg, NOT here, so this core stays a tight pure-policy
// surface. See src/rasp/index.js for the §8a build seam.
//
// Two planes, one chokepoint, no shared inputs (brief §6): these names belong to
// the ENVIRONMENT plane only. They never enter the tx scorer, and tx signals
// never enter here.

// The five detector CONDITIONS from the brief's §4 ladder, plus the two
// integrity-axis outcomes that are themselves conditions (a failed or unavailable
// attested verdict is a condition with its own honest copy, rather than being
// silently folded into root/tamper copy). These are the inputs degrade() maps.
//
// ELEVATED (added 2026-07-16, owner-approved fix for a #1007+#979 regression):
// a MILDER condition than ROOTED for the 8 "soft" environment signals
// (overlayActive, developerMode, virtualApp, suspiciousPackage,
// thirdPartyKeyboard, mockLocation, networkProxy, accessibilityService) —
// see nativeProbe.js. These signals warrant a WARN + biometric re-confirm, but
// unlike genuine root/jailbreak they must NOT block seed BACKUP
// (seed-reveal/export/import): degrade.js gives CONDITION.ELEVATED
// `blockedActions: []`. CONDITION.ROOTED is reserved for GENUINE root/jailbreak
// (verdict.rooted / verdict.jailbroken) and keeps its stronger blockedActions.
// ROOTED always outranks ELEVATED in classifyEnvironment()/composeConditions().
export const CONDITION = Object.freeze({
  CLEAN: 'clean',
  ROOTED: 'rooted',
  ELEVATED: 'elevated',
  EMULATOR: 'emulator',
  HOOKED: 'hooked',
  TAMPERED: 'tampered',
  INTEGRITY_FAIL: 'integrity_fail',
  INTEGRITY_UNAVAILABLE: 'integrity_unavailable',
});

// The three response tiers (brief §4). These map 1:1 onto the Risk Scoring
// friction vocabulary: ALLOW≈no-banner, WARN≈one-sentence, BLOCK≈refuse.
export const TIER = Object.freeze({
  ALLOW: 'allow',
  WARN: 'warn-before-sign',
  BLOCK: 'block-signing',
});
