// src/rasp/raspIntegrityPlugin.js
//
// Capacitor plugin REGISTRATION for the native OS-integrity probe (Phase 2a).
// BUILT (JS interface only) · NATIVE IMPLEMENTATION NOT WRITTEN · NOT VALIDATED.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ This file ONLY registers the plugin bridge. The actual detection logic is  │
// │ NATIVE code a mobile dev must still write:                                 │
// │   • iOS  (Swift): ios/App/App/RaspIntegrityPlugin.swift                     │
// │       jailbreak (Cydia/Sileo paths, sandbox-escape write test, suspicious   │
// │       dylibs), Frida/ptrace hook detection, simulator fingerprint.          │
// │   • Android (Kotlin): RaspIntegrityPlugin.kt                                │
// │       root (su/Magisk/SuperSU, system write-test, busybox), Frida/Xposed    │
// │       ports + maps scan, emulator build-prop / sensor fingerprint.          │
// │                                                                            │
// │ Each must implement:  checkIntegrity()  ->  Promise<{                       │
// │     rooted?: boolean, jailbroken?: boolean,                                 │
// │     hookedProcess?: boolean, emulator?: boolean, tampered?: boolean }>       │
// │                                                                            │
// │ Until that native code exists AND is exercised on real hostile devices     │
// │ (roadmap Phase 4) + passes the independent audit (Phase 5), RASP OS-level   │
// │ detection stays UNVALIDATED. On a device without the native implementation  │
// │ the bridge rejects, and nativeProbe.js fails CLOSED to INTEGRITY_UNAVAILABLE│
// │ — never a fabricated clean. NO EGRESS (I2): purely on-device.               │
// └──────────────────────────────────────────────────────────────────────────┘

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
