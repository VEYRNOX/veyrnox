// src/rasp/nativeProbe.js
//
// NATIVE RASP probe source (Phase 2a, OS-level leg).
// BUILT · UNAUDITED-PROVISIONAL · NO EGRESS · NOT VALIDATED (needs roadmap Phase 4)
//
// This is the JS interface layer over a Capacitor native plugin that inspects
// OS-level runtime integrity the browser cannot reach: root / jailbreak, a hooked
// process (Frida / Xposed / ptrace / debugger), and emulator fingerprints. It fills
// the same ProbeSource seam that detect() consumes, so a native build can pass
// nativeProbeSource() where the web build passes browserProbeSource.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ BUILT + device-verified (PARTIAL) 2026-07-11, INTERNAL.                   │
// │   Android — RaspIntegrityPlugin.kt (Kotlin, su/Magisk/Frida/emu/cert).    │
// │   iOS     — RaspIntegrityPlugin.m  (ObjC, Cydia/sandbox/dyld/Frida).      │
// │ Registered ("RaspIntegrity") both platforms; iOS→Xcode target #826, UNVAL. │
// │ Samsung Galaxy Note 20 5G (SM-N981B), Magisk v30.7: plugin registered in  │
// │ Veyrnox process; StrongBox KEK + biometric unlock confirmed end-to-end.   │
// │ checkIntegrity() rooted-signal return and Send-screen WARN NOT captured   │
// │ (user didn't reach Send during RASP monitoring window). Frida-hooked and  │
// │ iOS device tests remain outstanding. INTERNAL — not independently audited. │
// │                                                                            │
// │ checkIntegrity() contract (both platforms):                               │
// │     Promise<{                                                              │
// │       rooted?: boolean,        // su/Magisk/SuperSU, write-test (Android)  │
// │       jailbroken?: boolean,    // Cydia/Sileo/sandbox escape (iOS)         │
// │       hookedProcess?: boolean, // Frida port / dyld / Xposed               │
// │       emulator?: boolean,      // build props / simulator env              │
// │       tampered?: boolean,      // re-sign / cert fingerprint mismatch      │
// │     }>                                                                     │
// └──────────────────────────────────────────────────────────────────────────┘
//
// I4 — FAIL CLOSED. Off a non-native platform, when the plugin module is absent,
// when the plugin call throws, or when it returns a non-object, this returns
// { available: false }. detect() maps that to INTEGRITY_UNAVAILABLE (→ WARN), and
// NEVER to CLEAN. A "clean" verdict is reachable ONLY when the plugin genuinely
// ran and reported no signal.
//
// I3 — DENIABILITY. nativeProbeSource() takes NO arguments (arity 0): there is
// structurally no wallet-set handle in scope, no import that can reach set
// identity, and the plugin call carries no set argument. The result is therefore
// byte-identical whichever set is unlocked — it is not a wallet-set oracle.
//
// I2 — NO EGRESS. This leg is purely on-device. The remote-attestation leg
// (Play Integrity / App Attest, which does egress) is Phase 2b and lives behind
// the audit gate in attestation.js — this module deliberately does not touch it.

import { Capacitor } from '@capacitor/core';

/** @typedef {import('./detect.js').ProbeSource} ProbeSource */

// The honest fail-closed source: "we could not evaluate this device." Identical in
// shape to browserProbe's non-browser path and detect()'s UNAVAILABLE default.
const UNAVAILABLE = Object.freeze({ available: false });

/**
 * Sample OS-level integrity via the native plugin and adapt it to the ProbeSignals
 * shape detect()/classifyEnvironment() understand.
 *
 * Async because the native bridge is async. Returns a ProbeSource:
 *   { available: true, signals: { rooted, hooked, emulator, tampered, elevated } }
 *                                                                        on success
 *   { available: false }                                                  fail-closed
 *
 * `elevated` (added 2026-07-16) is optional/derived — it carries the 8 SOFT
 * environment signals (see the big comment block below) and drives
 * CONDITION.ELEVATED (WARN, seed backup allowed), distinct from `rooted`
 * (genuine root/jailbreak only, WARN, seed backup BLOCKED).
 *
 * NOTE: no parameters — see the I3 note above. Do not add a wallet-set argument.
 *
 * @returns {Promise<ProbeSource>}
 */
export async function nativeProbeSource() {
  // Web / non-native: this leg cannot inspect the OS. Fail closed — the web build
  // uses browserProbeSource instead, and detect() over this is INTEGRITY_UNAVAILABLE.
  if (!Capacitor.isNativePlatform()) {
    return UNAVAILABLE;
  }

  let verdict;
  try {
    // Dynamic import keeps the native plugin out of the web/test bundle, exactly
    // like biometricUnlock.js / keystore do. If the plugin module is absent the
    // import throws and we fall through to fail-closed.
    const { RaspIntegrity } = await import('@/rasp/raspIntegrityPlugin');
    // No set argument is ever passed (I3): the call is environment-only.
    verdict = await RaspIntegrity.checkIntegrity();
  } catch {
    // Plugin absent or threw → could not evaluate → fail closed (never clean).
    return UNAVAILABLE;
  }

  // A non-object / null verdict means the plugin did not genuinely report — treat
  // as "could not evaluate", never fabricate a clean result.
  if (verdict == null || typeof verdict !== 'object') {
    return UNAVAILABLE;
  }

  // Adapt the native verdict to detect()'s ProbeSignals. root OR jailbreak both
  // mean "OS trust boundary broken" → the `rooted` signal (degrade() → WARN,
  // seed-reveal/export/import BLOCKED). A hooked process → `hooked` (→ BLOCK).
  // Missing fields are "not observed" (false), exactly as classifyEnvironment()
  // treats absent fields.
  //
  // 2026-07-16 owner-approved fix (regression from #1007 + #979): items 19-37
  // below (8 "soft" environment signals) previously folded into `rooted`. #979
  // then added `blockedActions: ['seed-reveal','export','import']` to the
  // ROOTED WARN spec, so a benign state like plain developer mode or an
  // accessibility service silently blocked seed BACKUP — never the intent.
  // These 8 signals now fold into the separate `elevated` signal instead:
  // still WARN + biometric re-confirm (degrade.js CONDITION.ELEVATED), but
  // backup is explicitly NOT blocked. GENUINE root/jailbreak (verdict.rooted /
  // verdict.jailbroken) is the ONLY thing that still sets `rooted`.
  //
  // Item 19 (#1104, 2026-07-17): overlayActive is DROPPED from ELEVATED.
  // AssistiveTouch (iOS UIAccessibilityIsAssistiveTouchRunning) is a first-class
  // accessibility feature many users leave permanently enabled — folding it
  // into ELEVATED produced a permanent WARN banner + biometric re-confirm on
  // every Send, training users to click through and degrading the ELEVATED
  // tier's meaning. Accessibility is not an adversarial signal. Genuine
  // tapjacking risk is still surfaced by adversarial signals like Android
  // accessibilityService (a user-installed service, item 37). The verdict field
  // remains parsed by the plugin; it simply no longer contributes here.
  // Item 25: developerMode (Android ADB_ENABLED / DEVELOPMENT_SETTINGS_ENABLED,
  // item 24) → WARN. USB debugging on = adb-level attack surface (logcat
  // capture, screenrecord, memory dump). Android-only field; absent on iOS
  // verdicts and treated as false by the === true guard.
  // Item 27: virtualApp (Android checkVirtualApp, item 26) → WARN. Running
  // inside a VirtualApp/Parallel Space/Island container lets the host
  // intercept binder calls, fake root/tamper signals, and proxy biometrics.
  // Android-only field; absent on iOS verdicts and treated as false by === true.
  // Item 29: suspiciousPackage (Android checkSuspiciousPackages, item 28) →
  // WARN. PackageManager detects Magisk Manager, LSPosed, SuperSU etc. even
  // when Magisk Hide masks file-system paths. Android-only field.
  // Item 31: thirdPartyKeyboard (Android checkThirdPartyKeyboard, item 30) →
  // WARN. A non-system IME (FLAG_SYSTEM == 0) could keylog PIN input during
  // KEK enrollment. Android-only field.
  // Item 33: mockLocation (Android checkMockLocation, item 32) → WARN. Active
  // mock-location provider = device-integrity signal (requires developer
  // options or explicit app-op grant). Android-only field.
  // Item 35: networkProxy (Android checkNetworkProxy, item 34) → WARN. An
  // active system proxy (Burp/Charles/mitmproxy) intercepts HTTPS traffic — a
  // potential MitM vector. Android-only field.
  // Item 37: accessibilityService (Android checkAccessibilityService, item 36)
  // → WARN. A user-installed accessibility service has full UI-tree access and
  // can inject events — keylogging/tapjacking risk during PIN entry.
  // Android-only field.

  // P2-6b fail-closed shape validation (from main): a bridge returning `{}` or a
  // one-field partial previously coerced every absent axis to false → CLEAN, a
  // fabricated pass (fail-open). Refuse partial/malformed shapes and fail closed
  // (I4). Rooted-axis is a UNION — Android emits `rooted`, iOS emits `jailbroken`
  // — so require at least ONE of the two as a boolean, plus the other three core
  // fields as booleans. The item-19–37 verdict fields above are OPTIONAL
  // Android-only extensions and are deliberately NOT required here (absent → false
  // via the `=== true` guards), so a valid core verdict without them still passes.
  const rootedIsBool = typeof verdict.rooted === 'boolean';
  const jailbrokenIsBool = typeof verdict.jailbroken === 'boolean';
  if (
    !(rootedIsBool || jailbrokenIsBool) ||
    typeof verdict.hookedProcess !== 'boolean' ||
    typeof verdict.emulator !== 'boolean' ||
    typeof verdict.tampered !== 'boolean'
  ) {
    return UNAVAILABLE;
  }

  const signals = {
    // GENUINE root/jailbreak ONLY (2026-07-16 fix) — the 8 soft signals below
    // no longer widen this axis; see signals.elevated instead.
    rooted: verdict.rooted === true || verdict.jailbroken === true,
    // The 8 soft environment signals (items 19/25/27/29/31/33/35/37) — WARN +
    // biometric re-confirm via CONDITION.ELEVATED, but seed backup is allowed.
    // #1104: verdict.overlayActive is intentionally NOT in this OR chain.
    elevated: verdict.developerMode === true
         || verdict.virtualApp === true
         || verdict.suspiciousPackage === true
         || verdict.thirdPartyKeyboard === true
         || verdict.mockLocation === true
         || verdict.networkProxy === true
         || verdict.accessibilityService === true,
    // Item 13: fold debuggerAttached (iOS sysctl P_TRACED, item 12) into the
    // hooked signal so a detected debugger drives presignGate → HOOKED → BLOCK.
    // Item 16: fold screenCapture (iOS UIScreen.isCaptured) — active mirroring
    // or screen recording during signing is a surveillance vector → BLOCK.
    hooked: verdict.hookedProcess === true
         || verdict.debuggerAttached === true
         || verdict.screenCapture === true,
    emulator: verdict.emulator === true,
    // Binary-tamper is a separate native probe not yet wired (see TODO). Until the
    // plugin reports it, it is not observed.
    tampered: verdict.tampered === true,
  };

  return { available: true, signals };
}
