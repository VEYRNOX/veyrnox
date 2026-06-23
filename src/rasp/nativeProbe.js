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
// │ TODO (mobile dev) — the NATIVE plugin itself is NOT written yet.           │
// │ This module imports `@/rasp/raspIntegrityPlugin`, which must export a      │
// │ Capacitor plugin `RaspIntegrity` with:                                     │
// │     checkIntegrity(): Promise<{                                            │
// │       rooted?: boolean,        // su/Magisk/SuperSU, write-test, busybox    │
// │       jailbroken?: boolean,    // Cydia/Sileo paths, sandbox escape (iOS)   │
// │       hookedProcess?: boolean, // Frida/Xposed ports, ptrace, dylib inject  │
// │       emulator?: boolean,      // build props / sensors / known FP          │
// │     }>                                                                      │
// │ iOS (Swift) + Android (Kotlin) native implementations are out of scope of  │
// │ this JS layer and require real-device verification before RASP is trusted. │
// │ Binary-tamper detection is a separate probe (bundle signature/checksum)    │
// │ and is intentionally left to the native layer; until the plugin reports it │
// │ we keep `tampered: false` (honest scope — never a fabricated clean claim,  │
// │ because the absence of a tamper signal is NOT the same as fail-closed; the │
// │ whole source still fails closed when the plugin cannot run at all).         │
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
    hooked: verdict.hookedProcess === true,
    emulator: verdict.emulator === true,
    // Binary-tamper is a separate native probe not yet wired (see TODO). Until the
    // plugin reports it, it is not observed.
    tampered: verdict.tampered === true,
  };

  return { available: true, signals };
}
