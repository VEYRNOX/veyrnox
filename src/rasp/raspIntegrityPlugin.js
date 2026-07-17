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
 * @property {boolean} [overlayActive] - Android-only soft signal (item 19); ELEVATED, not rooted.
 * @property {boolean} [developerMode] - Android-only soft signal (item 25); ELEVATED, not rooted.
 * @property {boolean} [virtualApp] - Android-only soft signal (item 27); ELEVATED, not rooted.
 * @property {boolean} [suspiciousPackage] - Android-only soft signal (item 29); ELEVATED, not rooted.
 * @property {boolean} [thirdPartyKeyboard] - Android-only soft signal (item 31); ELEVATED, not rooted.
 * @property {boolean} [mockLocation] - Android-only soft signal (item 33); ELEVATED, not rooted.
 * @property {boolean} [networkProxy] - Android-only soft signal (item 35); ELEVATED, not rooted.
 * @property {boolean} [accessibilityService] - Android-only soft signal (item 37); ELEVATED, not rooted.
 * @property {boolean} [debuggerAttached] - iOS sysctl P_TRACED (item 12); folded into `hooked`.
 * @property {boolean} [screenCapture] - iOS UIScreen.isCaptured (item 16); folded into `hooked`.
 *
 * @typedef {Object} RaspIntegrityPlugin
 * @property {() => Promise<IntegrityVerdict>} checkIntegrity
 */

/** @type {RaspIntegrityPlugin} */
export const RaspIntegrity = registerPlugin('RaspIntegrity');
