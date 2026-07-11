// src/rasp/raspIntegrityPlugin.js
//
// Capacitor plugin REGISTRATION for the native OS-integrity probe (Phase 2a).
// BUILT: JS bridge (`registerPlugin('RaspIntegrity')`) + Android + iOS native probes.
//   NOT device-validated (F-09).
//
// This file registers the Capacitor plugin bridge. Native detection logic:
//   • Android (Kotlin): android/app/src/main/java/com/veyrnox/app/RaspIntegrityPlugin.kt
//       — WRITTEN + registered (PR #383): root (su/Magisk/KernelSU paths, system
//       write-test, build-tags), Frida (default port 27042) / Xposed, emulator, tamper.
//   • iOS (ObjC): ios/App/App/RaspIntegrityPlugin.m (+ .h + RaspIntegrityPluginBridge.m,
//       CAP_PLUGIN registration) — WRITTEN; added to the Xcode App build target
//       2026-07-11 (#826): jailbreak paths (Cydia/Sileo/MobileSubstrate), sandbox-escape
//       write test, Frida port 27042, dyld image scan, simulator fingerprint. It is ObjC,
//       not Swift. BUILT-UNVALIDATED — no on-device (jailbroken/Frida) test yet.
//
// Each implements:  checkIntegrity() -> Promise<{
//     rooted?, jailbroken?, hookedProcess?, emulator?, tampered? : boolean }>
//
// STATUS: both native probes are BUILT but NOT yet exercised on a real rooted/jailbroken/
// Frida device (F-09, roadmap Phase 4) and NOT independently audited — so RASP OS-level
// detection stays UNVALIDATED. Where the native plugin is absent — a build that predates
// the iOS target wiring, a platform without the plugin, or a bridge throw — the bridge
// rejects and nativeProbe.js fails CLOSED to INTEGRITY_UNAVAILABLE, never a fabricated
// clean. NO EGRESS (I2): purely on-device.

import { registerPlugin } from '@capacitor/core';

/**
 * @typedef {Object} IntegrityVerdict
 * @property {boolean} [rooted]
 * @property {boolean} [jailbroken]
 * @property {boolean} [hookedProcess]
 * @property {boolean} [emulator]
 * @property {boolean} [tampered]
 *
 * @typedef {Object} RaspIntegrityPlugin
 * @property {() => Promise<IntegrityVerdict>} checkIntegrity
 */

/** @type {RaspIntegrityPlugin} */
export const RaspIntegrity = registerPlugin('RaspIntegrity');
