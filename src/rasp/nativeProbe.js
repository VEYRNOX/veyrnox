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
 *   { available: true, signals: { rooted, hooked, emulator, tampered } }  on success
 *   { available: false }                                                  fail-closed
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
  // mean "OS trust boundary broken" → the `rooted` signal (degrade() → WARN).
  // A hooked process → `hooked` (→ BLOCK). Missing fields are "not observed"
  // (false), exactly as classifyEnvironment() treats absent fields.
  const signals = {
    rooted: verdict.rooted === true || verdict.jailbroken === true,
    // Item 13: fold debuggerAttached (iOS sysctl P_TRACED, item 12) into the
    // hooked signal so a detected debugger drives presignGate → HOOKED → BLOCK.
    hooked: verdict.hookedProcess === true || verdict.debuggerAttached === true,
    emulator: verdict.emulator === true,
    // Binary-tamper is a separate native probe not yet wired (see TODO). Until the
    // plugin reports it, it is not observed.
    tampered: verdict.tampered === true,
  };

  return { available: true, signals };
}
