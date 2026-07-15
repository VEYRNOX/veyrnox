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
    // P2-6b (audit batch, 2026-07-15): full-shape verdict required.
    h.checkIntegrity = vi.fn(async () => ({
      rooted: false,
      jailbroken: false,
      hookedProcess: false,
      emulator: false,
      tampered: false,
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
    // P2-6b (audit batch, 2026-07-15): full-shape verdict required. This verdict
    // includes `tampered:false` — the honest Android/iOS producers always emit it.
    h.checkIntegrity = vi.fn(async () => ({
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

  it('a hooked native verdict drives detect() to HOOKED', async () => {
    h.isNative = true;
    // P2-6b: full-shape verdict required.
    h.checkIntegrity = vi.fn(async () => ({
      rooted: false, hookedProcess: true, emulator: false, tampered: false,
    }));
    const src = await nativeProbeSource();
    expect(detect(src)).toBe(CONDITION.HOOKED);
  });

  it('a clean native verdict drives detect() to CLEAN', async () => {
    h.isNative = true;
    h.checkIntegrity = vi.fn(async () => ({
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
    h.checkIntegrity = vi.fn(async () => ({
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
