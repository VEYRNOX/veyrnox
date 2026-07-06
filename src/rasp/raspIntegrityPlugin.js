// src/rasp/raspIntegrityPlugin.js
//
// Capacitor plugin REGISTRATION for the native OS-integrity probe (Phase 2a).
// BUILT: JS bridge (`registerPlugin('RaspIntegrity')`) + Android native probe.
//   NOT device-validated (F-09) · iOS native NOT written.
//
// This file registers the Capacitor plugin bridge. Native detection logic:
//   • Android (Kotlin): android/app/src/main/java/com/veyrnox/app/RaspIntegrityPlugin.kt
//       — WRITTEN + registered (PR #383): root (su/Magisk/KernelSU paths, system
//       write-test, build-tags), Frida (default port 27042) / Xposed, emulator, tamper.
//   • iOS (Swift): ios/App/App/RaspIntegrityPlugin.swift — NOT written yet
//       (jailbreak paths, sandbox-escape write test, Frida/ptrace, simulator fingerprint).
//
// Each implements:  checkIntegrity() -> Promise<{
//     rooted?, jailbroken?, hookedProcess?, emulator?, tampered? : boolean }>
//
// STATUS: the Android probe is BUILT but NOT yet exercised on a real rooted/Frida
// device (F-09, roadmap Phase 4) and NOT independently audited — so RASP OS-level
// detection stays UNVALIDATED. Where the native plugin is absent (iOS today) the
// bridge rejects and nativeProbe.js fails CLOSED to INTEGRITY_UNAVAILABLE — never a
// fabricated clean. NO EGRESS (I2): purely on-device.

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
