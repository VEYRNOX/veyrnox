// src/rasp/resolveProbeSource.js
//
// RASP v1 — pure ProbeSource chooser (F-09 native/browser composition).
// BUILT · pre-audit-safe · NO EGRESS · pure function (no device, no key, no set handle).
//
// detect() consumes a SINGLE ProbeSource. On a native build there are two legs:
//   • nativeProbeSource() — OS-level root/jailbreak/hook/emulator (Capacitor plugin).
//   • browserProbeSource   — the WebView/automation (WebDriver, debugger) leg.
//
// This is the pure seam that picks which one detect() reads. It prefers the native
// OS leg WHEN IT GENUINELY RAN (available === true), because the native probe is the
// only one that can see root/jailbreak. Otherwise it falls back to the browser leg.
//
// I4 — FAIL CLOSED. It NEVER fabricates a clean source. When the native leg did not
// run (available !== true, null, threw in the effect and left state null), it returns
// the browser source unchanged — and the browser source is itself fail-closed
// (UNAVAILABLE → detect() → INTEGRITY_UNAVAILABLE → WARN, never ALLOW). A "clean"
// verdict is reachable ONLY when a leg genuinely ran and reported no signal.
//
// I3 — DENIABILITY. Pure function of the two ENVIRONMENT sources only — no walletSet
// handle, no import that can reach set identity. The choice is identical whichever
// set is unlocked.

/** @typedef {import('./detect.js').ProbeSource} ProbeSource */

/**
 * Choose the ProbeSource detect() should read: the native OS leg when it genuinely
 * ran, otherwise the browser leg (fail-closed — never a fabricated clean source).
 *
 * @param {ProbeSource|null|undefined} nativeSource result of nativeProbeSource() (or
 *   null when off-native / not yet sampled / the sampling effect threw)
 * @param {ProbeSource} browserSource the always-present browser-level leg
 * @returns {ProbeSource}
 */
export function resolveProbeSource(nativeSource, browserSource) {
  if (nativeSource && nativeSource.available === true) {
    return nativeSource;
  }
  return browserSource;
}
