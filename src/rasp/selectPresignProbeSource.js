// src/rasp/selectPresignProbeSource.js
//
// RASP — PLATFORM-AWARE pre-sign ProbeSource chooser (C-01 fix, fail-closed).
// BUILT · pre-audit-safe · NO EGRESS · pure function (no device call, no key, no set handle).
//
// C-01 (internal-audit-2026-07-11, CRITICAL). The Send pre-sign gate previously read
// detect(resolveProbeSource(nativeProbe, browserProbeSource)). resolveProbeSource falls back
// to the BROWSER leg whenever the native leg did not run (available !== true / null / threw).
// That is fail-OPEN on native: on a native Capacitor WebView the browser leg reports
// available:true with rooted/emulator/tampered hard-coded false (browserProbe.js) — i.e.
// CLEAN → detect() → TIER.ALLOW. So a rooted/jailbroken device whose OS probe was absent,
// threw, or had not yet been sampled would sign with ZERO friction. The comment on
// resolveProbeSource assumes "the browser source is itself fail-closed", which is only true
// in Node/tests (window absent → unavailable); on a real device window is present and the
// browser leg is CLEAN, not unavailable.
//
// selectPresignProbeSource is the SINGLE seam the Send chokepoint uses to pick detect()'s
// source, branching on platform (Capacitor.isNativePlatform(), passed as `isNative`):
//
//   WEB (isNative === false): the browser leg exactly as before — WebDriver/automation →
//     HOOKED → BLOCK, clean → CLEAN → ALLOW. There is no OS leg off-device.
//
//   NATIVE (isNative === true): the OS leg ONLY. The browser leg's CLEAN is meaningless
//     here (it cannot observe root/jailbreak), so we NEVER fall back to it. We trust the
//     native verdict ONLY when it genuinely ran (available === true). When it did not —
//     null (not yet sampled / async bridge call in flight), a plugin that is absent or
//     threw (available:false), or iOS (no native probe implemented) — we fail CLOSED to the
//     honest UNAVAILABLE source → detect() → INTEGRITY_UNAVAILABLE → degrade() → WARN
//     (never ALLOW). A CLEAN verdict is reachable on native ONLY when the native plugin
//     genuinely ran and found nothing. (I4 — absence of a clean signal is never clean.)
//
// I3 — DENIABILITY. Pure function of (platform flag, two ENVIRONMENT sources) only — no
// walletSet handle, no import that can reach set identity. Identical whichever set is
// unlocked.

import { UNAVAILABLE_PROBE_SOURCE } from './detect.js';

/** @typedef {import('./detect.js').ProbeSource} ProbeSource */

/**
 * Choose the ProbeSource the pre-sign gate should read, branching on platform so native
 * never trusts the browser leg's CLEAN (C-01). Never fabricates a clean source (I4).
 *
 * @param {boolean} isNative       Capacitor.isNativePlatform()
 * @param {ProbeSource|null|undefined} nativeSource result of nativeProbeSource() (or null
 *   off-native / not yet sampled / the sampling effect threw)
 * @param {ProbeSource} browserSource the always-present browser-level leg
 * @returns {ProbeSource}
 */
export function selectPresignProbeSource(isNative, nativeSource, browserSource) {
  if (!isNative) {
    // Web: browser leg exactly as today. No OS leg exists off-device.
    return browserSource;
  }
  // Native: OS leg only. Trust it ONLY when it genuinely ran; otherwise fail CLOSED to the
  // UNAVAILABLE source — NEVER the browser leg's CLEAN — so absence of a native verdict
  // fails closed (→ WARN), not open (→ ALLOW).
  if (nativeSource && nativeSource.available === true) {
    return nativeSource;
  }
  return UNAVAILABLE_PROBE_SOURCE;
}
