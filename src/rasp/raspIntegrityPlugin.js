// src/rasp/raspIntegrityPlugin.js
//
// Capacitor plugin REGISTRATION for the native OS-integrity probe (Phase 2a).
// BUILT: JS bridge (`registerPlugin('RaspIntegrity')`) + Android + iOS native probes.
//   Device-verified (PARTIAL) 2026-07-11, INTERNAL — see nativeProbe.js header.
//
// This file registers the Capacitor plugin bridge. Native detection logic:
//   • Android (Kotlin): android/app/src/main/java/com/veyrnox/app/RaspIntegrityPlugin.kt
//       — BUILT + registered (PR #383): root (su/Magisk/KernelSU paths, system
//       write-test, build-tags), Frida (default port 27042) / Xposed, emulator, tamper.
//   • iOS (ObjC): ios/App/App/RaspIntegrityPlugin.m (+ .h + RaspIntegrityPluginBridge.m,
//       CAP_PLUGIN registration) — BUILT; added to the Xcode App build target
//       2026-07-11 (#826): jailbreak paths (Cydia/Sileo/MobileSubstrate), sandbox-escape
//       write test, Frida port 27042, dyld image scan, simulator fingerprint.
//       Registered as "RaspIntegrity". NOT device-tested on iOS (Mac required).
//
// Each implements:  checkIntegrity() -> Promise<{
//     rooted?, jailbroken?, hookedProcess?, emulator?, tampered? : boolean }>
//
// STATUS: BUILT on both platforms; device-verified (PARTIAL) 2026-07-11 on Android
// (Samsung Galaxy Note 20 5G SM-N981B, Magisk v30.7 — plugin registered, StrongBox KEK
// + biometric unlock confirmed; checkIntegrity() rooted-signal and Send-WARN NOT
// captured). iOS device test not performed (Mac required). Frida-hooked device test not
// performed on either platform. NOT independently audited (F-09 open, roadmap Phase 4).
// Where the native plugin call fails the bridge, nativeProbe.js fails CLOSED to
// INTEGRITY_UNAVAILABLE — never a fabricated clean. NO EGRESS (I2): purely on-device.

import { registerPlugin } from '@capacitor/core';

/**
 * @typedef {Object} IntegrityVerdict
 * @property {boolean} [rooted]
 * @property {boolean} [jailbroken]
 * @property {boolean} [hookedProcess]
 * @property {boolean} [emulator]
 * @property {boolean} [tampered]
 *
 * Soft environment signals (PR #1007 → CONDITION.ELEVATED). Consumed by
 * nativeProbe.js when composing the elevated axis. All optional — a native
 * plugin that doesn't report a signal simply omits it (treated as false).
 * @property {boolean} [developerMode]
 * @property {boolean} [virtualApp]
 * @property {boolean} [suspiciousPackage]
 * @property {boolean} [thirdPartyKeyboard]
 * @property {boolean} [mockLocation]
 * @property {boolean} [networkProxy]
 * @property {boolean} [accessibilityService]
 * @property {boolean} [screenCapture]
 *
 * L-2 (audit 2026-08-03) — this grouping had drifted. screenCapture was listed
 * under the hooked axis and overlayActive under elevated; neither matched
 * src/rasp/nativeProbe.js, which is the authority:
 *   - #1108 re-bucketed screenCapture from hooked (BLOCK) to elevated (WARN)
 *   - #1104 DROPPED overlayActive entirely — it feeds no signal and cannot
 *     affect the tier, so it is listed on its own below rather than under an
 *     axis it does not belong to
 * Both are pinned by named regression tests in nativeProbe.test.js.
 *
 * Reported by the plugin but deliberately NOT consumed (see above).
 * @property {boolean} [overlayActive]
 *
 * Additional signals folded into the hooked axis.
 * @property {boolean} [debuggerAttached]
 *
 * @typedef {Object} RaspIntegrityPlugin
 * @property {() => Promise<IntegrityVerdict>} checkIntegrity
 */

/** @type {RaspIntegrityPlugin} */
export const RaspIntegrity = registerPlugin('RaspIntegrity');
