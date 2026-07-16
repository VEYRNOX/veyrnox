// src/rasp/__tests__/detect.test.js
//
// RASP v1 — environment detection (Phase 2a, no-egress self-attested probes).
// Verifies the honesty-critical properties:
//   - FAIL CLOSED (I4): no probe capability → INTEGRITY_UNAVAILABLE, NEVER CLEAN.
//     CLEAN is reachable ONLY when probes actually ran and found nothing.
//   - Danger precedence: the strongest signal wins.
//   - I3 deniability: detect()/classifyEnvironment() are set-blind — identical
//     output whichever set is "active".
//   - Composition: degrade(detect(...)) yields the right tier end-to-end.

import { describe, it, expect, afterEach } from 'vitest';
import { detect, classifyEnvironment, UNAVAILABLE_PROBE_SOURCE } from '../detect.js';
import { degrade } from '../degrade.js';
import { CONDITION, TIER } from '../conditions.js';

describe('classifyEnvironment — danger precedence (pure)', () => {
  it('all-clear signals classify CLEAN', () => {
    expect(classifyEnvironment({ tampered: false, hooked: false, emulator: false, rooted: false })).toBe(CONDITION.CLEAN);
  });
  it('empty signals object is CLEAN (caller asserts probes ran)', () => {
    expect(classifyEnvironment({})).toBe(CONDITION.CLEAN);
  });
  it('tampered outranks everything', () => {
    expect(classifyEnvironment({ tampered: true, hooked: true, emulator: true, rooted: true })).toBe(CONDITION.TAMPERED);
  });
  it('hooked outranks emulator and rooted', () => {
    expect(classifyEnvironment({ hooked: true, emulator: true, rooted: true })).toBe(CONDITION.HOOKED);
  });
  it('emulator outranks rooted', () => {
    expect(classifyEnvironment({ emulator: true, rooted: true })).toBe(CONDITION.EMULATOR);
  });
  it('rooted alone classifies ROOTED', () => {
    expect(classifyEnvironment({ rooted: true })).toBe(CONDITION.ROOTED);
  });

  // 2026-07-16 owner-approved fix: ELEVATED is a new, milder condition for the
  // 8 SOFT environment signals (dev mode, accessibility service, etc.) that
  // #1007 had previously folded into `rooted`. ROOTED must still win when both
  // are present (genuine root always outranks a soft signal).
  it('elevated alone classifies ELEVATED', () => {
    expect(classifyEnvironment({ elevated: true })).toBe(CONDITION.ELEVATED);
  });
  it('rooted outranks elevated when both are present', () => {
    expect(classifyEnvironment({ rooted: true, elevated: true })).toBe(CONDITION.ROOTED);
  });
  it('elevated outranks CLEAN (all-clear with elevated:false is CLEAN)', () => {
    expect(classifyEnvironment({ tampered: false, hooked: false, emulator: false, rooted: false, elevated: false })).toBe(CONDITION.CLEAN);
    expect(classifyEnvironment({ tampered: false, hooked: false, emulator: false, rooted: false, elevated: true })).toBe(CONDITION.ELEVATED);
  });
  it('tampered/hooked/emulator all outrank elevated', () => {
    expect(classifyEnvironment({ tampered: true, elevated: true })).toBe(CONDITION.TAMPERED);
    expect(classifyEnvironment({ hooked: true, elevated: true })).toBe(CONDITION.HOOKED);
    expect(classifyEnvironment({ emulator: true, elevated: true })).toBe(CONDITION.EMULATOR);
  });
});

describe('detect — FAIL CLOSED (the honesty boundary)', () => {
  it('defaults to INTEGRITY_UNAVAILABLE with no probe source (never fake-clean)', () => {
    expect(detect()).toBe(CONDITION.INTEGRITY_UNAVAILABLE);
    expect(detect()).not.toBe(CONDITION.CLEAN);
  });
  it('returns UNAVAILABLE for an unavailable source', () => {
    expect(detect(UNAVAILABLE_PROBE_SOURCE)).toBe(CONDITION.INTEGRITY_UNAVAILABLE);
    expect(detect({ available: false })).toBe(CONDITION.INTEGRITY_UNAVAILABLE);
  });
  it('does NOT treat signals-without-available as a clean evaluation', () => {
    // A source that forgot to set available:true must NOT yield CLEAN.
    expect(detect({ signals: { rooted: false } })).toBe(CONDITION.INTEGRITY_UNAVAILABLE);
  });
  it('requires available === true strictly (truthy is not enough)', () => {
    expect(detect({ available: 1, signals: {} })).toBe(CONDITION.INTEGRITY_UNAVAILABLE);
    expect(detect({ available: 'yes', signals: {} })).toBe(CONDITION.INTEGRITY_UNAVAILABLE);
  });
  it('classifies real signals when the source is genuinely available (all four booleans required, P2-6a)', () => {
    // P2-6a (audit batch, 2026-07-15): detect() now requires all four boolean
    // signal fields — a partial shape fails closed (see partial-shape tests below).
    const allFalse = { rooted: false, hooked: false, emulator: false, tampered: false };
    expect(detect({ available: true, signals: allFalse })).toBe(CONDITION.CLEAN);
    expect(detect({ available: true, signals: { ...allFalse, rooted: true } })).toBe(CONDITION.ROOTED);
    expect(detect({ available: true, signals: { ...allFalse, tampered: true } })).toBe(CONDITION.TAMPERED);
  });
});

describe('detect → degrade composition (end-to-end tiers)', () => {
  it('no capability → WARN with biometric re-confirm', () => {
    const a = degrade(detect());
    expect(a.tier).toBe(TIER.WARN);
    expect(a.requiresBiometric).toBe(true);
  });
  it('tampered → BLOCK, signing refused', () => {
    const a = degrade(detect({
      available: true,
      signals: { rooted: false, hooked: false, emulator: false, tampered: true },
    }));
    expect(a.tier).toBe(TIER.BLOCK);
    expect(a.blockedActions).toContain('sign');
  });
  it('clean (probes ran, nothing found) → ALLOW', () => {
    const a = degrade(detect({
      available: true,
      signals: { rooted: false, hooked: false, emulator: false, tampered: false },
    }));
    expect(a.tier).toBe(TIER.ALLOW);
  });
});

describe('I3 deniability — detection is set-blind', () => {
  afterEach(() => { delete globalThis.__VEYRNOX_ACTIVE_SET__; });
  function detectUnderActiveSet(source, activeSet) {
    globalThis.__VEYRNOX_ACTIVE_SET__ = activeSet;
    try { return detect(source); } finally { delete globalThis.__VEYRNOX_ACTIVE_SET__; }
  }
  it('identical output under real vs decoy for every source kind', () => {
    const allFalse = { rooted: false, hooked: false, emulator: false, tampered: false };
    const sources = [
      undefined,
      { available: false },
      { available: true, signals: allFalse },
      { available: true, signals: { ...allFalse, rooted: true } },
    ];
    for (const s of sources) {
      expect(detectUnderActiveSet(s, 'real')).toBe(detectUnderActiveSet(s, 'decoy'));
    }
  });
  it('classifyEnvironment accepts no wallet-set handle (arity 1)', () => {
    expect(classifyEnvironment.length).toBe(1);
  });
});

describe('scope guard — probes never forge an ATTESTED condition (2b is parked)', () => {
  // The on-device probes (Option A) must only ever emit the four runtime
  // conditions or CLEAN. INTEGRITY_FAIL is an ATTESTATION outcome (the parked 2b
  // leg); classifyEnvironment must never produce it, no matter the signal combo.
  const ALLOWED = [CONDITION.TAMPERED, CONDITION.HOOKED, CONDITION.EMULATOR, CONDITION.ROOTED, CONDITION.CLEAN];
  it('every signal combination classifies to a probe condition, never INTEGRITY_FAIL', () => {
    const keys = ['tampered', 'hooked', 'emulator', 'rooted'];
    for (let mask = 0; mask < 16; mask++) {
      const signals = Object.fromEntries(keys.map((k, i) => [k, Boolean(mask & (1 << i))]));
      const out = classifyEnvironment(signals);
      expect(ALLOWED).toContain(out);
      expect(out).not.toBe(CONDITION.INTEGRITY_FAIL);
    }
  });
  it('the default probe source is honestly unavailable and frozen', () => {
    expect(UNAVAILABLE_PROBE_SOURCE.available).toBe(false);
    expect(Object.isFrozen(UNAVAILABLE_PROBE_SOURCE)).toBe(true);
  });
});
