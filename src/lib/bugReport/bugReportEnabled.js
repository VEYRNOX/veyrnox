// src/lib/bugReport/bugReportEnabled.js
//
// Composed gate for opt-in bug-report screen recording. Mirrors the
// useBuyEnabled() pattern in featureClassification.js — every gate must pass,
// missing/unknown values default to DENY (I4).
//
// See docs/bug-report-recording-plan.md for the full contract.
//
// This is a foundation module for Slice 1a. Nothing imports it yet at runtime.
// Slice 1b will consume it from the Settings entry point and the native bridge.
//
// Three gates compose:
//   1. Ship gate  — VITE_BUG_REPORT_ENABLED === '1' (load-time constant).
//                   Default OFF. Flipped ON only in the build train whose
//                   store disclosures declare screen capture.
//   2. Deniability — decoy/duress/stealth or demo session hides the feature
//                   entirely (I3).
//   3. Platform   — native only (iOS or Android). Web has no reliable
//                   getDisplayMedia() in Capacitor's webview; not worth the
//                   partial-support gap for a security-sensitive feature.
//
// The route gate (canRecordOnRoute) is a SEPARATE, per-frame check evaluated
// during a live recording, not part of the "can the feature be offered at all"
// question this module answers.

import { Capacitor } from '@capacitor/core';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

/**
 * Ship gate — load-time constant. Vite inlines import.meta.env so this
 * dead-code-eliminates cleanly when the flag is not '1'.
 *
 * The comparison is intentionally strict: only the literal '1' opens the gate.
 * Any other value (undefined, empty string, 'true', '0', 'yes') → OFF.
 */
function shipGateOpen() {
  return import.meta.env?.VITE_BUG_REPORT_ENABLED === '1';
}

/**
 * Platform gate — native only.
 * Wrapped in try/catch because Capacitor throws if called before its runtime
 * initialises (e.g. in some test setups); throw → DENY (I4).
 */
function platformIsNative() {
  try {
    return Capacitor.isNativePlatform() === true;
  } catch {
    return false;
  }
}

/**
 * True iff the bug-report feature MAY be offered to the user in this session.
 * ALL of ship + deniability + platform must pass. Any exception → false (I4).
 *
 * Callers that need finer-grained answers ("why is it off?") should compose
 * the underlying checks themselves rather than parse this bool.
 */
export function isBugReportEnabled() {
  try {
    if (!shipGateOpen()) return false;
    if (isDeniabilityOrDemoActive()) return false;
    if (!platformIsNative()) return false;
    return true;
  } catch {
    return false;
  }
}

// Exposed for tests only. Do NOT consume from application code.
export const _internals = Object.freeze({
  shipGateOpen,
  platformIsNative,
});
