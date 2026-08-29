// M-5 (weekly audit 2026-08-25) — iOS active screen mirroring must block SEED REVEAL.
//
// THE BUG. nativeProbe.js folded `screenCapture` (iOS UIScreen.isCaptured — active
// AirPlay mirroring / ReplayKit recording) into the shared `elevated` axis, and
// CONDITION.ELEVATED carries `blockedActions: []`. So sensitiveGate(artifact,
// 'seed-reveal') returned blocked:false and the full mnemonic rendered onto a screen
// that is being transmitted to a remote observer.
//
// WHY THE ANDROID GRADING DOES NOT TRANSFER. The #1108 downgrade to WARN is justified
// on Android by MainActivity's unconditional FLAG_SECURE, which blocks the capture at
// the OS layer (RaspIntegrityPlugin.kt:89-95). iOS has no FLAG_SECURE equivalent and
// says so honestly — applyScreenshotProtection is an HONEST-DISABLED placeholder
// (RaspIntegrityPlugin.m). The iOS early gate (earlyCheckScreenCapture) only catches
// mirroring that is already active AT LAUNCH; mirroring started mid-session reaches
// checkIntegrity and, before this fix, was graded ELEVATED → reveal allowed.
//
// SCOPE. Seed REVEAL only. Export/import write key material to a FILE, not to the
// screen, so mirroring does not capture them — blocking those would be over-blocking.
// Signing is not blocked either: a tx preview is not key material.
//
// NOT DEVICE-VERIFIED. This grading change has never been exercised on a real iPhone
// with a live AirPlay session.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  isNative: true,
  platform: 'ios',
  checkIntegrity: null,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => h.isNative,
    getPlatform: () => h.platform,
  },
}));

vi.mock('@/rasp/raspIntegrityPlugin', () => ({
  get RaspIntegrity() {
    return {
      checkIntegrity: (...args) =>
        h.checkIntegrity ? h.checkIntegrity(...args) : Promise.resolve({}),
    };
  },
}));

import { nativeProbeSource } from '@/rasp/nativeProbe.js';
import { detect } from '@/rasp/detect.js';
import { degrade } from '@/rasp/degrade.js';
import { sensitiveGate } from '@/rasp/sensitiveGate.js';
import { composeConditions } from '@/rasp/attestation.js';
import { CONDITION, TIER } from '@/rasp/conditions.js';

const CORE = Object.freeze({
  rooted: false,
  jailbroken: false,
  hookedProcess: false,
  emulator: false,
  tampered: false,
});
const withCore = (partial = {}) => ({ ...CORE, ...partial });

beforeEach(() => {
  h.isNative = true;
  h.platform = 'ios';
  h.checkIntegrity = null;
});

describe('M-5 — iOS: active screen mirroring blocks seed reveal', () => {
  it('screenCapture:true on iOS sets its OWN signal, not the elevated union', async () => {
    h.checkIntegrity = vi.fn(async () => withCore({ screenCapture: true }));
    const src = await nativeProbeSource();
    expect(src.signals.screenCapture).toBe(true);
    expect(src.signals.elevated).toBe(false);
    // Still not Frida-severity — #1108's finding stands.
    expect(src.signals.hooked).toBe(false);
    expect(src.signals.rooted).toBe(false);
  });

  it('detect() grades it SCREEN_CAPTURE, not ELEVATED', async () => {
    h.checkIntegrity = vi.fn(async () => withCore({ screenCapture: true }));
    const src = await nativeProbeSource();
    expect(detect(src)).toBe(CONDITION.SCREEN_CAPTURE);
  });

  it('the seed-reveal gate BLOCKS while mirroring is active', async () => {
    h.checkIntegrity = vi.fn(async () => withCore({ screenCapture: true }));
    const artifact = degrade(detect(await nativeProbeSource()));
    const gate = sensitiveGate(artifact, 'seed-reveal');
    expect(gate.blocked).toBe(true);
    expect(gate.sentence).toBe(artifact.sentence);
  });

  it('does NOT over-block: export, import and sign still pass', async () => {
    h.checkIntegrity = vi.fn(async () => withCore({ screenCapture: true }));
    const artifact = degrade(detect(await nativeProbeSource()));
    for (const action of ['export', 'import', 'sign']) {
      expect(sensitiveGate(artifact, action).blocked, action).toBe(false);
    }
  });

  it('a genuinely soft signal on iOS is still only ELEVATED (reveal allowed)', async () => {
    h.checkIntegrity = vi.fn(async () => withCore({ developerMode: true }));
    const src = await nativeProbeSource();
    expect(src.signals.screenCapture).toBe(false);
    expect(detect(src)).toBe(CONDITION.ELEVATED);
    expect(sensitiveGate(degrade(CONDITION.ELEVATED), 'seed-reveal').blocked).toBe(false);
  });

  it('mirroring PLUS genuine jailbreak still grades ROOTED (the stronger block wins)', async () => {
    h.checkIntegrity = vi.fn(async () => withCore({ jailbroken: true, screenCapture: true }));
    const src = await nativeProbeSource();
    expect(detect(src)).toBe(CONDITION.ROOTED);
    expect(sensitiveGate(degrade(detect(src)), 'seed-reveal').blocked).toBe(true);
  });
});

describe('M-5 — Android keeps its WARN grading (FLAG_SECURE genuinely covers it)', () => {
  beforeEach(() => { h.platform = 'android'; });

  it('screenCapture:true on Android stays on the elevated axis', async () => {
    h.checkIntegrity = vi.fn(async () => withCore({ screenCapture: true }));
    const src = await nativeProbeSource();
    expect(src.signals.elevated).toBe(true);
    expect(src.signals.screenCapture).toBe(false);
    expect(detect(src)).toBe(CONDITION.ELEVATED);
  });

  it('Android seed reveal is NOT blocked by mirroring (unchanged behaviour)', async () => {
    h.checkIntegrity = vi.fn(async () => withCore({ screenCapture: true }));
    const artifact = degrade(detect(await nativeProbeSource()));
    expect(sensitiveGate(artifact, 'seed-reveal').blocked).toBe(false);
  });
});

describe('M-5 — SCREEN_CAPTURE condition policy', () => {
  it('is WARN tier with seed-reveal the only blocked action', () => {
    const a = degrade(CONDITION.SCREEN_CAPTURE);
    expect(a.tier).toBe(TIER.WARN);
    expect(a.blockedActions).toEqual(['seed-reveal']);
  });

  it('copy is honest: describes mirroring, claims no prevention, no root/jailbreak claim', () => {
    const s = degrade(CONDITION.SCREEN_CAPTURE).sentence.toLowerCase();
    expect(s.length).toBeGreaterThan(0);
    expect(s).not.toContain('rooted');
    expect(s).not.toContain('jailbroken');
    // Must not promise a specific gate (same rule as the other WARN copy).
    expect(s).not.toContain('biometric');
    expect(s).toMatch(/mirror|record|captur/);
  });

  it('composes above CLEAN/ELEVATED and below every genuine-compromise condition', () => {
    for (const weaker of [CONDITION.CLEAN, CONDITION.ELEVATED]) {
      expect(composeConditions(CONDITION.SCREEN_CAPTURE, weaker)).toBe(CONDITION.SCREEN_CAPTURE);
      expect(composeConditions(weaker, CONDITION.SCREEN_CAPTURE)).toBe(CONDITION.SCREEN_CAPTURE);
    }
    for (const stronger of [
      CONDITION.INTEGRITY_UNAVAILABLE,
      CONDITION.ROOTED,
      CONDITION.EMULATOR,
      CONDITION.INTEGRITY_FAIL,
      CONDITION.HOOKED,
      CONDITION.TAMPERED,
    ]) {
      expect(composeConditions(CONDITION.SCREEN_CAPTURE, stronger)).toBe(stronger);
      expect(composeConditions(stronger, CONDITION.SCREEN_CAPTURE)).toBe(stronger);
    }
  });
});
