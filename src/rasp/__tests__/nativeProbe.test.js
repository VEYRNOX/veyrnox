// Tests for the NATIVE RASP probe source (src/rasp/nativeProbe.js) — Phase 2a.
//
// nativeProbeSource() is the JS interface layer over a (not-yet-written) Capacitor
// native plugin that inspects OS-level integrity: root/jailbreak, hooked process
// (Frida/Xposed/ptrace), emulator. It returns a Promise<ProbeSource> shaped exactly
// like browserProbeSource so it slots into detect() unchanged.
//
// HONESTY / INVARIANTS pinned here:
//   I4 fail-closed   — web (no native), plugin absent, or plugin error → { available:false }
//                      → detect() returns INTEGRITY_UNAVAILABLE, NEVER a fabricated CLEAN.
//   I3 deniability   — the probe takes NO wallet-set handle and returns a byte-identical
//                      result regardless of which set is unlocked (no set oracle).
//   Honest scope     — a real native verdict only when the plugin genuinely ran.
//
// The Capacitor core + the native plugin are dynamically imported inside the module,
// so we mock both. Per-test we flip isNativePlatform and the plugin implementation.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  isNative: false,
  // checkIntegrity impl the mocked native plugin uses; per-test override.
  checkIntegrity: null,
  // whether the plugin module resolves at all (false → import throws "absent")
  pluginPresent: true,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => h.isNative },
}));

vi.mock('@/rasp/raspIntegrityPlugin', () => ({
  // When pluginPresent is false the export is undefined, so destructuring
  // `RaspIntegrity.checkIntegrity` throws inside nativeProbe — the "plugin absent
  // on this device" path. Otherwise it is the mocked native bridge.
  get RaspIntegrity() {
    if (!h.pluginPresent) return undefined;
    return {
      checkIntegrity: (...args) =>
        h.checkIntegrity ? h.checkIntegrity(...args) : Promise.resolve({}),
    };
  },
}));

import { nativeProbeSource } from '@/rasp/nativeProbe.js';
import { detect } from '@/rasp/detect.js';
import { CONDITION } from '@/rasp/conditions.js';

// P2-6b (audit batch, 2026-07-15): the honest Android/iOS native producers ALWAYS
// emit the four CORE booleans (rooted|jailbroken, hookedProcess, emulator, tampered),
// and nativeProbeSource now fail-closes to UNAVAILABLE on any partial/malformed shape.
// These per-item tests exercise the OR-folding of individual WARN/BLOCK fields, so
// `withCore(partial)` completes each verdict with the core axes as false — exactly the
// real plugin shape — while any field the test deliberately sets (including a computed
// `[field]: true`) wins over the default because the partial spreads last.
const CORE = Object.freeze({
  rooted: false,
  jailbroken: false,
  hookedProcess: false,
  emulator: false,
  tampered: false,
});
const withCore = (partial = {}) => ({ ...CORE, ...partial });

beforeEach(() => {
  h.isNative = false;
  h.checkIntegrity = null;
  h.pluginPresent = true;
});

describe('nativeProbeSource — web / non-native', () => {
  it('returns { available: false } off a non-native platform (fail-closed)', async () => {
    h.isNative = false;
    const src = await nativeProbeSource();
    expect(src.available).toBe(false);
    expect(src.signals).toBeUndefined();
  });

  it('detect() over the web result is INTEGRITY_UNAVAILABLE, never CLEAN', async () => {
    h.isNative = false;
    const src = await nativeProbeSource();
    expect(detect(src)).toBe(CONDITION.INTEGRITY_UNAVAILABLE);
  });
});

describe('nativeProbeSource — native', () => {
  it('returns available:true with the five OS signals when the plugin runs', async () => {
    h.isNative = true;
    // P2-6b (audit batch, 2026-07-15): full-shape verdict required.
    h.checkIntegrity = vi.fn(async () => withCore({
      rooted: false,
      jailbroken: false,
      hookedProcess: false,
      emulator: false,
      tampered: false,
    }));
    const src = await nativeProbeSource();
    expect(src.available).toBe(true);
    // 2026-07-16 fix: `elevated` (the 8 soft signals) is now a distinct fifth
    // signal alongside the original four core axes.
    expect(src.signals).toEqual({
      rooted: false,
      hooked: false,
      emulator: false,
      tampered: false,
      elevated: false,
    });
  });

  it('maps rooted OR jailbroken to the rooted signal; hookedProcess to hooked', async () => {
    h.isNative = true;
    // P2-6b (audit batch, 2026-07-15): full-shape verdict required. This verdict
    // includes `tampered:false` — the honest Android/iOS producers always emit it.
    h.checkIntegrity = vi.fn(async () => withCore({
      rooted: false,
      jailbroken: true,
      hookedProcess: true,
      emulator: false,
      tampered: false,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.rooted).toBe(true);
    expect(src.signals.hooked).toBe(true);
  });

  // 2026-07-16 owner-approved fix (regression from #1007 + #979): the 8 soft
  // environment signals (overlayActive, developerMode, virtualApp,
  // suspiciousPackage, thirdPartyKeyboard, mockLocation, networkProxy,
  // accessibilityService) must NOT set signals.rooted any more — that folding
  // combined with #979's ROOTED blockedActions caused a soft signal (e.g. plain
  // developer mode) to block seed BACKUP. GENUINE root (verdict.rooted /
  // verdict.jailbroken) still sets signals.rooted. The 8 soft signals now set
  // the new signals.elevated instead (WARN, backup allowed).
  it('genuine root/jailbreak alone (no soft signals) still maps to signals.rooted true, elevated false', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({ rooted: true }));
    const src = await nativeProbeSource();
    expect(src.signals.rooted).toBe(true);
    expect(src.signals.elevated).toBe(false);
  });

  it('a SOFT signal alone (e.g. developerMode) does NOT set signals.rooted — only signals.elevated', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({ developerMode: true }));
    const src = await nativeProbeSource();
    expect(src.signals.rooted).toBe(false);
    expect(src.signals.elevated).toBe(true);
  });

  it('accessibilityService alone does NOT set signals.rooted — only signals.elevated', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({ accessibilityService: true }));
    const src = await nativeProbeSource();
    expect(src.signals.rooted).toBe(false);
    expect(src.signals.elevated).toBe(true);
  });

  it('each of the 8 soft signals independently maps to elevated:true, rooted:false', async () => {
    const softFields = [
      'overlayActive', 'developerMode', 'virtualApp', 'suspiciousPackage',
      'thirdPartyKeyboard', 'mockLocation', 'networkProxy', 'accessibilityService',
    ];
    h.isNative = true;
    for (const field of softFields) {
      h.checkIntegrity = vi.fn(async () => withCore({ [field]: true }));
      const src = await nativeProbeSource();
      expect(src.signals.elevated, `${field} → elevated`).toBe(true);
      expect(src.signals.rooted, `${field} → rooted`).toBe(false);
    }
  });

  it('genuine root/jailbreak PLUS a soft signal keeps rooted:true (and elevated:true)', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({ rooted: true, developerMode: true }));
    const src = await nativeProbeSource();
    expect(src.signals.rooted).toBe(true);
    expect(src.signals.elevated).toBe(true);
  });

  it('all signals false (core + soft) → rooted false, elevated false', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({}));
    const src = await nativeProbeSource();
    expect(src.signals.rooted).toBe(false);
    expect(src.signals.elevated).toBe(false);
  });

  it('a hooked native verdict drives detect() to HOOKED', async () => {
    h.isNative = true;
    // P2-6b: full-shape verdict required.
    h.checkIntegrity = vi.fn(async () => withCore({
      rooted: false, hookedProcess: true, emulator: false, tampered: false,
    }));
    const src = await nativeProbeSource();
    expect(detect(src)).toBe(CONDITION.HOOKED);
  });

  it('a clean native verdict drives detect() to CLEAN', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({
      rooted: false, jailbroken: false, hookedProcess: false, emulator: false, tampered: false,
    }));
    const src = await nativeProbeSource();
    expect(detect(src)).toBe(CONDITION.CLEAN);
  });
});

describe('nativeProbeSource — fail closed (I4)', () => {
  it('plugin throws → { available: false }, never silently CLEAN', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => { throw new Error('boom'); });
    const src = await nativeProbeSource();
    expect(src.available).toBe(false);
    expect(detect(src)).toBe(CONDITION.INTEGRITY_UNAVAILABLE);
  });

  it('plugin module absent (import throws) → { available: false }', async () => {
    h.isNative = true;
    h.pluginPresent = false;
    const src = await nativeProbeSource();
    expect(src.available).toBe(false);
    expect(detect(src)).toBe(CONDITION.INTEGRITY_UNAVAILABLE);
  });

  it('plugin returns a non-object / null → { available: false } (no fabricated clean)', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => null);
    const src = await nativeProbeSource();
    expect(src.available).toBe(false);
    expect(detect(src)).toBe(CONDITION.INTEGRITY_UNAVAILABLE);
  });
});

describe('nativeProbeSource — I3 deniability (no wallet-set oracle)', () => {
  it('takes no arguments and is byte-identical regardless of any passed set handle', async () => {
    h.isNative = true;
    // P2-6b: full-shape verdict required.
    h.checkIntegrity = vi.fn(async () => withCore({
      rooted: true, hookedProcess: false, emulator: false, tampered: false,
    }));

    // The function MUST ignore any argument — it has no set parameter at all.
    const real = await nativeProbeSource({ set: 'real', walletSet: 'A' });
    const decoy = await nativeProbeSource({ set: 'decoy', walletSet: 'B' });

    expect(real).toEqual(decoy);
    // And it must never have received/used a set: the plugin call carries no set arg.
    for (const call of h.checkIntegrity.mock.calls) {
      expect(call.length).toBe(0);
    }
  });

  it('arity is 0 — there is structurally no wallet-set parameter', () => {
    expect(nativeProbeSource.length).toBe(0);
  });
});

// ── Item 13 — debuggerAttached folded into the hooked signal ─────────────────
// Item 12 added debuggerAttached to the iOS plugin verdict. nativeProbeSource
// must fold it into signals.hooked so the JS presignGate sees HOOKED → BLOCK
// rather than silently treating an attached debugger as a clean signal.
describe('nativeProbeSource — item 13: debuggerAttached → hooked', () => {
  it('debuggerAttached:true maps to signals.hooked true', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({
      hookedProcess: false,
      debuggerAttached: true,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.hooked).toBe(true);
  });

  it('debuggerAttached:true drives detect() to HOOKED', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({ debuggerAttached: true }));
    const src = await nativeProbeSource();
    expect(detect(src)).toBe(CONDITION.HOOKED);
  });

  it('hookedProcess:false + debuggerAttached:false → hooked false (no false positive)', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({
      hookedProcess: false,
      debuggerAttached: false,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.hooked).toBe(false);
  });

  it('hookedProcess:true OR debuggerAttached:true is sufficient for hooked', async () => {
    h.isNative = true;
    // hookedProcess fires, debuggerAttached absent (older plugin version)
    h.checkIntegrity = vi.fn(async () => withCore({ hookedProcess: true }));
    const srcA = await nativeProbeSource();
    expect(srcA.signals.hooked).toBe(true);
    // debuggerAttached fires, hookedProcess absent (iOS-specific signal)
    h.checkIntegrity = vi.fn(async () => withCore({ debuggerAttached: true }));
    const srcB = await nativeProbeSource();
    expect(srcB.signals.hooked).toBe(true);
  });
});

// ── Item 37 — accessibilityService folded into the elevated (WARN, backup OK) signal ──
// Android checkAccessibilityService() (item 36) returns accessibilityService:true
// when a user-installed (FLAG_SYSTEM == 0) accessibility service is active.
// Such a service can read the full UI tree and inject events — a keylogging /
// tapjacking risk during PIN entry. WARN tier. Android-only field.
//
// 2026-07-16 owner-approved fix: this soft signal no longer folds into `rooted`
// (that combined with #979's ROOTED blockedActions to block seed BACKUP for a
// benign accessibility-service state). It now folds into the new `elevated`
// signal — still WARN + biometric re-confirm, but backup is NOT blocked.
describe('nativeProbeSource — item 37: accessibilityService → elevated (WARN, backup allowed)', () => {
  it('accessibilityService:true maps to signals.elevated true, rooted false', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({
      rooted: false,
      jailbroken: false,
      overlayActive: false,
      developerMode: false,
      virtualApp: false,
      suspiciousPackage: false,
      thirdPartyKeyboard: false,
      mockLocation: false,
      networkProxy: false,
      accessibilityService: true,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.elevated).toBe(true);
    expect(src.signals.rooted).toBe(false);
  });

  it('accessibilityService:true drives detect() to ELEVATED (WARN), not ROOTED, HOOKED, or TAMPERED', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({ accessibilityService: true }));
    const src = await nativeProbeSource();
    expect(detect(src)).toBe(CONDITION.ELEVATED);
    expect(detect(src)).not.toBe(CONDITION.ROOTED);
    expect(detect(src)).not.toBe(CONDITION.HOOKED);
    expect(detect(src)).not.toBe(CONDITION.TAMPERED);
  });

  it('accessibilityService:false alone does not set elevated (no false positive)', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({
      rooted: false, jailbroken: false, overlayActive: false,
      developerMode: false, virtualApp: false, suspiciousPackage: false,
      thirdPartyKeyboard: false, mockLocation: false, networkProxy: false,
      accessibilityService: false,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.elevated).toBe(false);
  });

  it('any of the SOFT fields true is sufficient for signals.elevated (rooted stays false)', async () => {
    h.isNative = true;
    for (const field of ['overlayActive', 'developerMode',
                         'virtualApp', 'suspiciousPackage', 'thirdPartyKeyboard',
                         'mockLocation', 'networkProxy', 'accessibilityService']) {
      h.checkIntegrity = vi.fn(async () => withCore({ [field]: true }));
      const src = await nativeProbeSource();
      expect(src.signals.elevated, `${field} → elevated`).toBe(true);
      expect(src.signals.rooted, `${field} → rooted`).toBe(false);
    }
    // genuine root/jailbreak fields still map to signals.rooted, not elevated.
    for (const field of ['rooted', 'jailbroken']) {
      h.checkIntegrity = vi.fn(async () => withCore({ [field]: true }));
      const src = await nativeProbeSource();
      expect(src.signals.rooted, `${field} → rooted`).toBe(true);
    }
  });
});

// ── Item 35 — networkProxy folded into the elevated (WARN, backup OK) signal ──
// Android checkNetworkProxy() (item 34) returns networkProxy:true when a
// system proxy (Burp Suite, Charles, mitmproxy) is active — a potential MitM
// vector during HTTPS traffic. WARN tier. Android-only field; absent on iOS
// verdicts, treated as false by === true.
describe('nativeProbeSource — item 35: networkProxy → elevated (WARN, backup allowed)', () => {
  it('networkProxy:true maps to signals.elevated true, rooted false', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({
      rooted: false,
      jailbroken: false,
      overlayActive: false,
      developerMode: false,
      virtualApp: false,
      suspiciousPackage: false,
      thirdPartyKeyboard: false,
      mockLocation: false,
      networkProxy: true,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.elevated).toBe(true);
    expect(src.signals.rooted).toBe(false);
  });

  it('networkProxy:true drives detect() to ELEVATED (WARN), not ROOTED, HOOKED, or TAMPERED', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({ networkProxy: true }));
    const src = await nativeProbeSource();
    expect(detect(src)).toBe(CONDITION.ELEVATED);
    expect(detect(src)).not.toBe(CONDITION.ROOTED);
    expect(detect(src)).not.toBe(CONDITION.HOOKED);
    expect(detect(src)).not.toBe(CONDITION.TAMPERED);
  });

  it('networkProxy:false alone does not set elevated (no false positive)', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({
      rooted: false, jailbroken: false, overlayActive: false,
      developerMode: false, virtualApp: false, suspiciousPackage: false,
      thirdPartyKeyboard: false, mockLocation: false, networkProxy: false,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.elevated).toBe(false);
  });

  it('any of the SOFT fields true is sufficient for signals.elevated (rooted stays false)', async () => {
    h.isNative = true;
    for (const field of ['overlayActive', 'developerMode',
                         'virtualApp', 'suspiciousPackage', 'thirdPartyKeyboard',
                         'mockLocation', 'networkProxy']) {
      h.checkIntegrity = vi.fn(async () => withCore({ [field]: true }));
      const src = await nativeProbeSource();
      expect(src.signals.elevated, `${field} → elevated`).toBe(true);
      expect(src.signals.rooted, `${field} → rooted`).toBe(false);
    }
  });
});

// ── Item 33 — mockLocation folded into the elevated (WARN, backup OK) signal ──
// Android checkMockLocation() (item 32) returns mockLocation:true when a
// non-system package holds OPSTR_MOCK_LOCATION (API 23+) or the legacy
// ALLOW_MOCK_LOCATION setting is on. Fake GPS on a wallet device is an
// attack-context signal. WARN tier. Android-only field.
describe('nativeProbeSource — item 33: mockLocation → elevated (WARN, backup allowed)', () => {
  it('mockLocation:true maps to signals.elevated true, rooted false', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({
      rooted: false,
      jailbroken: false,
      overlayActive: false,
      developerMode: false,
      virtualApp: false,
      suspiciousPackage: false,
      thirdPartyKeyboard: false,
      mockLocation: true,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.elevated).toBe(true);
    expect(src.signals.rooted).toBe(false);
  });

  it('mockLocation:true drives detect() to ELEVATED (WARN), not ROOTED, HOOKED, or TAMPERED', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({ mockLocation: true }));
    const src = await nativeProbeSource();
    expect(detect(src)).toBe(CONDITION.ELEVATED);
    expect(detect(src)).not.toBe(CONDITION.ROOTED);
    expect(detect(src)).not.toBe(CONDITION.HOOKED);
    expect(detect(src)).not.toBe(CONDITION.TAMPERED);
  });

  it('mockLocation:false alone does not set elevated (no false positive)', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({
      rooted: false, jailbroken: false, overlayActive: false,
      developerMode: false, virtualApp: false, suspiciousPackage: false,
      thirdPartyKeyboard: false, mockLocation: false,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.elevated).toBe(false);
  });

  it('any of the SOFT fields true is sufficient for signals.elevated (rooted stays false)', async () => {
    h.isNative = true;
    for (const field of ['overlayActive', 'developerMode',
                         'virtualApp', 'suspiciousPackage', 'thirdPartyKeyboard', 'mockLocation']) {
      h.checkIntegrity = vi.fn(async () => withCore({ [field]: true }));
      const src = await nativeProbeSource();
      expect(src.signals.elevated, `${field} → elevated`).toBe(true);
      expect(src.signals.rooted, `${field} → rooted`).toBe(false);
    }
  });
});

// ── Item 31 — thirdPartyKeyboard folded into the elevated (WARN, backup OK) signal ──
// Android checkThirdPartyKeyboard() (item 30) returns thirdPartyKeyboard:true
// when the active IME lacks FLAG_SYSTEM — i.e. it was user-installed and could
// be a keylogger capturing PIN input during KEK enrollment. WARN tier.
// Android-only field; absent on iOS verdicts, treated as false by === true.
describe('nativeProbeSource — item 31: thirdPartyKeyboard → elevated (WARN, backup allowed)', () => {
  it('thirdPartyKeyboard:true maps to signals.elevated true, rooted false', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({
      rooted: false,
      jailbroken: false,
      overlayActive: false,
      developerMode: false,
      virtualApp: false,
      suspiciousPackage: false,
      thirdPartyKeyboard: true,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.elevated).toBe(true);
    expect(src.signals.rooted).toBe(false);
  });

  it('thirdPartyKeyboard:true drives detect() to ELEVATED (WARN), not ROOTED, HOOKED, or TAMPERED', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({ thirdPartyKeyboard: true }));
    const src = await nativeProbeSource();
    expect(detect(src)).toBe(CONDITION.ELEVATED);
    expect(detect(src)).not.toBe(CONDITION.ROOTED);
    expect(detect(src)).not.toBe(CONDITION.HOOKED);
    expect(detect(src)).not.toBe(CONDITION.TAMPERED);
  });

  it('thirdPartyKeyboard:false alone does not set elevated (no false positive)', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({
      rooted: false,
      jailbroken: false,
      overlayActive: false,
      developerMode: false,
      virtualApp: false,
      suspiciousPackage: false,
      thirdPartyKeyboard: false,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.elevated).toBe(false);
  });

  it('any of the SOFT fields (overlayActive/developerMode/virtualApp/suspiciousPackage/thirdPartyKeyboard) true is sufficient for elevated', async () => {
    h.isNative = true;
    for (const field of ['overlayActive', 'developerMode', 'virtualApp', 'suspiciousPackage', 'thirdPartyKeyboard']) {
      h.checkIntegrity = vi.fn(async () => withCore({ [field]: true }));
      const src = await nativeProbeSource();
      expect(src.signals.elevated, `${field} → elevated`).toBe(true);
      expect(src.signals.rooted, `${field} → rooted`).toBe(false);
    }
  });
});

// ── Item 29 — suspiciousPackage folded into the elevated (WARN, backup OK) signal ──
// Android checkSuspiciousPackages() (item 28) returns suspiciousPackage:true
// when a known root/hook tool package (Magisk Manager, LSPosed, SuperSU, etc.)
// is detected via PackageManager. This is a WARN-tier signal: the device is
// intentionally modified but our process is not necessarily compromised.
// Android-only field; absent on iOS verdicts, treated as false by === true.
describe('nativeProbeSource — item 29: suspiciousPackage → elevated (WARN, backup allowed)', () => {
  it('suspiciousPackage:true maps to signals.elevated true, rooted false', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({
      rooted: false,
      jailbroken: false,
      overlayActive: false,
      developerMode: false,
      virtualApp: false,
      suspiciousPackage: true,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.elevated).toBe(true);
    expect(src.signals.rooted).toBe(false);
  });

  it('suspiciousPackage:true drives detect() to ELEVATED (WARN), not ROOTED, HOOKED, or TAMPERED', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({ suspiciousPackage: true }));
    const src = await nativeProbeSource();
    expect(detect(src)).toBe(CONDITION.ELEVATED);
    expect(detect(src)).not.toBe(CONDITION.ROOTED);
    expect(detect(src)).not.toBe(CONDITION.HOOKED);
    expect(detect(src)).not.toBe(CONDITION.TAMPERED);
  });

  it('suspiciousPackage:false alone does not set elevated (no false positive)', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({
      rooted: false,
      jailbroken: false,
      overlayActive: false,
      developerMode: false,
      virtualApp: false,
      suspiciousPackage: false,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.elevated).toBe(false);
  });

  it('any of the SOFT fields (overlayActive/developerMode/virtualApp/suspiciousPackage) true is sufficient for elevated', async () => {
    h.isNative = true;
    for (const field of ['overlayActive', 'developerMode', 'virtualApp', 'suspiciousPackage']) {
      h.checkIntegrity = vi.fn(async () => withCore({ [field]: true }));
      const src = await nativeProbeSource();
      expect(src.signals.elevated, `${field} → elevated`).toBe(true);
      expect(src.signals.rooted, `${field} → rooted`).toBe(false);
    }
  });
});

// ── Item 27 — virtualApp folded into the elevated (WARN, backup OK) signal ────
// Android checkVirtualApp() (item 26) returns virtualApp:true when
// applicationInfo.sourceDir is under a known virtual container path
// (VirtualApp/io.va, Parallel Space, Island, etc.). Running inside such a
// container lets the host intercept binder calls, fake root/tamper signals,
// and proxy biometrics — so it belongs in the same WARN tier as elevated.
// Android-only field; absent on iOS verdicts and treated as false by === true.
describe('nativeProbeSource — item 27: virtualApp → elevated (WARN, backup allowed)', () => {
  it('virtualApp:true maps to signals.elevated true, rooted false', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({
      rooted: false,
      jailbroken: false,
      overlayActive: false,
      developerMode: false,
      virtualApp: true,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.elevated).toBe(true);
    expect(src.signals.rooted).toBe(false);
  });

  it('virtualApp:true drives detect() to ELEVATED (WARN), not ROOTED, HOOKED, or TAMPERED', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({ virtualApp: true }));
    const src = await nativeProbeSource();
    expect(detect(src)).toBe(CONDITION.ELEVATED);
    expect(detect(src)).not.toBe(CONDITION.ROOTED);
    expect(detect(src)).not.toBe(CONDITION.HOOKED);
    expect(detect(src)).not.toBe(CONDITION.TAMPERED);
  });

  it('virtualApp:false alone does not set elevated (no false positive)', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({
      rooted: false,
      jailbroken: false,
      overlayActive: false,
      developerMode: false,
      virtualApp: false,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.elevated).toBe(false);
  });

  it('any of the SOFT fields (overlayActive / developerMode / virtualApp) true is sufficient for elevated', async () => {
    h.isNative = true;
    for (const field of ['overlayActive', 'developerMode', 'virtualApp']) {
      h.checkIntegrity = vi.fn(async () => withCore({ [field]: true }));
      const src = await nativeProbeSource();
      expect(src.signals.elevated, `${field} → elevated`).toBe(true);
      expect(src.signals.rooted, `${field} → rooted`).toBe(false);
    }
  });
});

// ── Item 25 — developerMode folded into the elevated (WARN, backup OK) signal ──
// Android checkDeveloperMode() (item 24) returns developerMode:true when
// Settings.Global.ADB_ENABLED != 0 or DEVELOPMENT_SETTINGS_ENABLED != 0.
// USB debugging / developer options = adb-level attack surface (logcat,
// screenrecord, memory dump). Android-only field; no iOS equivalent.
// Maps to signals.elevated (→ CONDITION.ELEVATED → TIER.WARN, backup allowed):
// same tier as overlayActive — elevated risk, not a definitive compromise, and
// crucially NOT the same as genuine root (a real root/jailbreak still blocks
// seed backup via CONDITION.ROOTED).
describe('nativeProbeSource — item 25: developerMode → elevated (WARN, backup allowed)', () => {
  it('developerMode:true maps to signals.elevated true, rooted false', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({
      rooted: false,
      jailbroken: false,
      overlayActive: false,
      developerMode: true,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.elevated).toBe(true);
    expect(src.signals.rooted).toBe(false);
  });

  it('developerMode:true drives detect() to ELEVATED (WARN), not ROOTED, HOOKED, or TAMPERED', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({ developerMode: true }));
    const src = await nativeProbeSource();
    expect(detect(src)).toBe(CONDITION.ELEVATED);
    expect(detect(src)).not.toBe(CONDITION.ROOTED);
    expect(detect(src)).not.toBe(CONDITION.HOOKED);
    expect(detect(src)).not.toBe(CONDITION.TAMPERED);
  });

  it('developerMode:false alone does not set elevated (no false positive)', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({
      rooted: false,
      jailbroken: false,
      overlayActive: false,
      developerMode: false,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.elevated).toBe(false);
  });

  it('any of the SOFT fields (overlayActive / developerMode) true is sufficient for elevated; rooted/jailbroken still map to rooted', async () => {
    h.isNative = true;
    for (const field of ['overlayActive', 'developerMode']) {
      h.checkIntegrity = vi.fn(async () => withCore({ [field]: true }));
      const src = await nativeProbeSource();
      expect(src.signals.elevated, `${field} → elevated`).toBe(true);
      expect(src.signals.rooted, `${field} → rooted`).toBe(false);
    }
    for (const field of ['rooted', 'jailbroken']) {
      h.checkIntegrity = vi.fn(async () => withCore({ [field]: true }));
      const src = await nativeProbeSource();
      expect(src.signals.rooted, `${field} → rooted`).toBe(true);
    }
  });
});

// ── Item 19 — overlayActive folded into the elevated (WARN, backup OK) signal ──
// iOS checkOverlay() (UIAccessibilityIsAssistiveTouchRunning) returns
// overlayActive:true when an accessibility overlay is active. AssistiveTouch is
// legitimate, so the plugin comment explicitly says "must NOT trigger TIER.BLOCK
// on its own" — but WARN is appropriate (a presign CAUTION, not a block).
// Mapping to signals.elevated (→ CONDITION.ELEVATED → TIER.WARN, backup allowed)
// satisfies both constraints: the send flow is not blocked, seed backup is not
// blocked, and the user sees a caution notice.
describe('nativeProbeSource — item 19: overlayActive → elevated (WARN, backup allowed)', () => {
  it('overlayActive:true maps to signals.elevated true, rooted false', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({
      rooted: false,
      jailbroken: false,
      overlayActive: true,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.elevated).toBe(true);
    expect(src.signals.rooted).toBe(false);
  });

  it('overlayActive:true drives detect() to ELEVATED (WARN), not ROOTED, HOOKED, or TAMPERED', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({ overlayActive: true }));
    const src = await nativeProbeSource();
    expect(detect(src)).toBe(CONDITION.ELEVATED);
    expect(detect(src)).not.toBe(CONDITION.ROOTED);
    expect(detect(src)).not.toBe(CONDITION.HOOKED);
    expect(detect(src)).not.toBe(CONDITION.TAMPERED);
  });

  it('overlayActive:false alone does not set elevated (no false positive)', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({
      rooted: false,
      jailbroken: false,
      overlayActive: false,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.elevated).toBe(false);
  });

  it('overlayActive alone is sufficient for elevated; rooted/jailbroken alone still map to rooted', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({ overlayActive: true }));
    let src = await nativeProbeSource();
    expect(src.signals.elevated).toBe(true);
    expect(src.signals.rooted).toBe(false);
    for (const field of ['rooted', 'jailbroken']) {
      h.checkIntegrity = vi.fn(async () => withCore({ [field]: true }));
      src = await nativeProbeSource();
      expect(src.signals.rooted, `${field} → rooted`).toBe(true);
    }
  });
});

// ── Item 16 — screenCapture folded into the hooked signal ─────────────────────
// iOS checkScreenCapture (UIScreen.isCaptured) returns screenCapture:true when
// the screen is being mirrored via AirPlay or captured via iOS screen recording.
// During PIN entry or seed display this is a surveillance attack vector — the
// attacker can observe the user's input or recover key material from the video.
// nativeProbeSource folds screenCapture into signals.hooked so the presignGate
// sees HOOKED → BLOCK rather than treating active screen capture as clean.
describe('nativeProbeSource — item 16: screenCapture → hooked', () => {
  it('screenCapture:true maps to signals.hooked true', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({
      hookedProcess: false,
      debuggerAttached: false,
      screenCapture: true,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.hooked).toBe(true);
  });

  it('screenCapture:true drives detect() to HOOKED', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({ screenCapture: true }));
    const src = await nativeProbeSource();
    expect(detect(src)).toBe(CONDITION.HOOKED);
  });

  it('all three false → hooked false (no false positive)', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => withCore({
      hookedProcess: false,
      debuggerAttached: false,
      screenCapture: false,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.hooked).toBe(false);
  });

  it('any of hookedProcess / debuggerAttached / screenCapture true is sufficient', async () => {
    h.isNative = true;
    for (const field of ['hookedProcess', 'debuggerAttached', 'screenCapture']) {
      h.checkIntegrity = vi.fn(async () => withCore({ [field]: true }));
      const src = await nativeProbeSource();
      expect(src.signals.hooked).toBe(true);
    }
  });
});
