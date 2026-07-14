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
  it('returns available:true with the four OS signals when the plugin runs', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => ({
      rooted: false,
      jailbroken: false,
      hookedProcess: false,
      emulator: false,
    }));
    const src = await nativeProbeSource();
    expect(src.available).toBe(true);
    expect(src.signals).toEqual({
      rooted: false,
      hooked: false,
      emulator: false,
      tampered: false,
    });
  });

  it('maps rooted OR jailbroken to the rooted signal; hookedProcess to hooked', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => ({
      rooted: false,
      jailbroken: true,
      hookedProcess: true,
      emulator: false,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.rooted).toBe(true);
    expect(src.signals.hooked).toBe(true);
  });

  it('a hooked native verdict drives detect() to HOOKED', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => ({ hookedProcess: true }));
    const src = await nativeProbeSource();
    expect(detect(src)).toBe(CONDITION.HOOKED);
  });

  it('a clean native verdict drives detect() to CLEAN', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => ({
      rooted: false, jailbroken: false, hookedProcess: false, emulator: false,
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
    h.checkIntegrity = vi.fn(async () => ({ rooted: true }));

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
    h.checkIntegrity = vi.fn(async () => ({
      hookedProcess: false,
      debuggerAttached: true,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.hooked).toBe(true);
  });

  it('debuggerAttached:true drives detect() to HOOKED', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => ({ debuggerAttached: true }));
    const src = await nativeProbeSource();
    expect(detect(src)).toBe(CONDITION.HOOKED);
  });

  it('hookedProcess:false + debuggerAttached:false → hooked false (no false positive)', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => ({
      hookedProcess: false,
      debuggerAttached: false,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.hooked).toBe(false);
  });

  it('hookedProcess:true OR debuggerAttached:true is sufficient for hooked', async () => {
    h.isNative = true;
    // hookedProcess fires, debuggerAttached absent (older plugin version)
    h.checkIntegrity = vi.fn(async () => ({ hookedProcess: true }));
    const srcA = await nativeProbeSource();
    expect(srcA.signals.hooked).toBe(true);
    // debuggerAttached fires, hookedProcess absent (iOS-specific signal)
    h.checkIntegrity = vi.fn(async () => ({ debuggerAttached: true }));
    const srcB = await nativeProbeSource();
    expect(srcB.signals.hooked).toBe(true);
  });
});

// ── Item 25 — developerMode folded into the rooted (WARN) signal ─────────────
// Android checkDeveloperMode() (item 24) returns developerMode:true when
// Settings.Global.ADB_ENABLED != 0 or DEVELOPMENT_SETTINGS_ENABLED != 0.
// USB debugging / developer options = adb-level attack surface (logcat,
// screenrecord, memory dump). Android-only field; no iOS equivalent.
// Maps to signals.rooted (→ CONDITION.ROOTED → TIER.WARN): same tier as
// overlayActive and jailbroken — elevated risk, not a definitive compromise.
describe('nativeProbeSource — item 25: developerMode → rooted (WARN)', () => {
  it('developerMode:true maps to signals.rooted true', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => ({
      rooted: false,
      jailbroken: false,
      overlayActive: false,
      developerMode: true,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.rooted).toBe(true);
  });

  it('developerMode:true drives detect() to ROOTED (WARN), not HOOKED or TAMPERED', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => ({ developerMode: true }));
    const src = await nativeProbeSource();
    expect(detect(src)).toBe(CONDITION.ROOTED);
    expect(detect(src)).not.toBe(CONDITION.HOOKED);
    expect(detect(src)).not.toBe(CONDITION.TAMPERED);
  });

  it('developerMode:false alone does not set rooted (no false positive)', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => ({
      rooted: false,
      jailbroken: false,
      overlayActive: false,
      developerMode: false,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.rooted).toBe(false);
  });

  it('any of rooted / jailbroken / overlayActive / developerMode true is sufficient', async () => {
    h.isNative = true;
    for (const field of ['rooted', 'jailbroken', 'overlayActive', 'developerMode']) {
      h.checkIntegrity = vi.fn(async () => ({ [field]: true }));
      const src = await nativeProbeSource();
      expect(src.signals.rooted).toBe(true);
    }
  });
});

// ── Item 19 — overlayActive folded into the rooted (WARN) signal ─────────────
// iOS checkOverlay() (UIAccessibilityIsAssistiveTouchRunning) returns
// overlayActive:true when an accessibility overlay is active. AssistiveTouch is
// legitimate, so the plugin comment explicitly says "must NOT trigger TIER.BLOCK
// on its own" — but WARN is appropriate (a presign CAUTION, not a block).
// Mapping to signals.rooted (→ CONDITION.ROOTED → TIER.WARN) satisfies both
// constraints: the send flow is not blocked and the user sees a caution notice.
describe('nativeProbeSource — item 19: overlayActive → rooted (WARN)', () => {
  it('overlayActive:true maps to signals.rooted true', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => ({
      rooted: false,
      jailbroken: false,
      overlayActive: true,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.rooted).toBe(true);
  });

  it('overlayActive:true drives detect() to ROOTED (WARN), not HOOKED or TAMPERED', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => ({ overlayActive: true }));
    const src = await nativeProbeSource();
    expect(detect(src)).toBe(CONDITION.ROOTED);
    expect(detect(src)).not.toBe(CONDITION.HOOKED);
    expect(detect(src)).not.toBe(CONDITION.TAMPERED);
  });

  it('overlayActive:false alone does not set rooted (no false positive)', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => ({
      rooted: false,
      jailbroken: false,
      overlayActive: false,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.rooted).toBe(false);
  });

  it('any of rooted / jailbroken / overlayActive being true is sufficient', async () => {
    h.isNative = true;
    for (const field of ['rooted', 'jailbroken', 'overlayActive']) {
      h.checkIntegrity = vi.fn(async () => ({ [field]: true }));
      const src = await nativeProbeSource();
      expect(src.signals.rooted).toBe(true);
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
    h.checkIntegrity = vi.fn(async () => ({
      hookedProcess: false,
      debuggerAttached: false,
      screenCapture: true,
    }));
    const src = await nativeProbeSource();
    expect(src.signals.hooked).toBe(true);
  });

  it('screenCapture:true drives detect() to HOOKED', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => ({ screenCapture: true }));
    const src = await nativeProbeSource();
    expect(detect(src)).toBe(CONDITION.HOOKED);
  });

  it('all three false → hooked false (no false positive)', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => ({
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
      h.checkIntegrity = vi.fn(async () => ({ [field]: true }));
      const src = await nativeProbeSource();
      expect(src.signals.hooked).toBe(true);
    }
  });
});
