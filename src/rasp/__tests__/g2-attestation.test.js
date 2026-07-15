// Tests for G2 — remote attestation composition + probe source (src/rasp/attestation.js).
//
// Phase 2b, Option B (disclosed, deniability-gated, pre-sign only — signed off
// 2026-07-13, docs/rasp-attestation-egress-decision.md). This is the JS decision
// layer over the native Play Integrity (Android) / App Attest (iOS) plugins.
//
// HONESTY / INVARIANTS pinned here:
//   I3 deniability  — isDeniabilitySessionActive() is the FIRST check; a decoy/hidden
//                     session yields { available:false } and NEVER calls the verdict fn
//                     (no attestation egress under a deniability unlock → no set oracle).
//   I4 fail-closed  — non-native, verdict fn throws, or verdict.available !== true →
//                     { available:false } → detectAttestation → INTEGRITY_UNAVAILABLE,
//                     never a fabricated CLEAN / ALLOW.
//   Danger precedence — composeConditions() lets the stronger (more dangerous)
//                     condition win when the native probe and attestation legs disagree;
//                     an unknown/garbage condition is treated as MOST dangerous (I4).
//
// The verdict function is INJECTED (attestationProbeSource(_verdictFn)) so these unit
// tests never touch the real native bridge or a dynamic import.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  isNative: true,
  deniabilityActive: false,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => h.isNative },
}));

vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilitySessionActive: () => h.deniabilityActive,
}));

import {
  composeConditions,
  detectAttestation,
  attestationProbeSource,
} from '@/rasp/attestation.js';
import { CONDITION } from '@/rasp/conditions.js';

beforeEach(() => {
  h.isNative = true;
  h.deniabilityActive = false;
});

// ── composeConditions — danger precedence ──────────────────────────────────
// Strongest wins: TAMPERED > HOOKED > INTEGRITY_FAIL > EMULATOR > ROOTED >
//                 INTEGRITY_UNAVAILABLE > CLEAN
describe('composeConditions — danger precedence', () => {
  it('TAMPERED beats every other condition', () => {
    for (const other of [
      CONDITION.HOOKED,
      CONDITION.INTEGRITY_FAIL,
      CONDITION.EMULATOR,
      CONDITION.ROOTED,
      CONDITION.INTEGRITY_UNAVAILABLE,
      CONDITION.CLEAN,
    ]) {
      expect(composeConditions(CONDITION.TAMPERED, other)).toBe(CONDITION.TAMPERED);
      expect(composeConditions(other, CONDITION.TAMPERED)).toBe(CONDITION.TAMPERED);
    }
  });

  it('HOOKED beats INTEGRITY_FAIL', () => {
    expect(composeConditions(CONDITION.HOOKED, CONDITION.INTEGRITY_FAIL)).toBe(CONDITION.HOOKED);
    expect(composeConditions(CONDITION.INTEGRITY_FAIL, CONDITION.HOOKED)).toBe(CONDITION.HOOKED);
  });

  it('INTEGRITY_FAIL beats EMULATOR, ROOTED, INTEGRITY_UNAVAILABLE, and CLEAN', () => {
    for (const weaker of [
      CONDITION.EMULATOR,
      CONDITION.ROOTED,
      CONDITION.INTEGRITY_UNAVAILABLE,
      CONDITION.CLEAN,
    ]) {
      expect(composeConditions(CONDITION.INTEGRITY_FAIL, weaker)).toBe(CONDITION.INTEGRITY_FAIL);
      expect(composeConditions(weaker, CONDITION.INTEGRITY_FAIL)).toBe(CONDITION.INTEGRITY_FAIL);
    }
  });

  it('INTEGRITY_UNAVAILABLE beats CLEAN (unavailable is more dangerous than clean)', () => {
    expect(composeConditions(CONDITION.INTEGRITY_UNAVAILABLE, CONDITION.CLEAN)).toBe(
      CONDITION.INTEGRITY_UNAVAILABLE,
    );
    expect(composeConditions(CONDITION.CLEAN, CONDITION.INTEGRITY_UNAVAILABLE)).toBe(
      CONDITION.INTEGRITY_UNAVAILABLE,
    );
  });

  it('CLEAN composed with CLEAN stays CLEAN', () => {
    expect(composeConditions(CONDITION.CLEAN, CONDITION.CLEAN)).toBe(CONDITION.CLEAN);
  });

  it('an unknown / garbage condition is treated as MOST dangerous (fail-closed, I4)', () => {
    expect(composeConditions('garbage', CONDITION.TAMPERED)).toBe('garbage');
    expect(composeConditions(CONDITION.TAMPERED, 'garbage')).toBe('garbage');
    expect(composeConditions(undefined, CONDITION.CLEAN)).toBe(undefined);
  });

  it('is symmetric when one side is clearly stronger: compose(a,b) === compose(b,a)', () => {
    const pairs = [
      [CONDITION.TAMPERED, CONDITION.CLEAN],
      [CONDITION.HOOKED, CONDITION.ROOTED],
      [CONDITION.INTEGRITY_FAIL, CONDITION.EMULATOR],
      [CONDITION.ROOTED, CONDITION.INTEGRITY_UNAVAILABLE],
    ];
    for (const [a, b] of pairs) {
      expect(composeConditions(a, b)).toBe(composeConditions(b, a));
    }
  });
});

// ── detectAttestation — verdict → CONDITION ─────────────────────────────────
describe('detectAttestation — attestation verdict mapping', () => {
  it('available:false → INTEGRITY_UNAVAILABLE', () => {
    expect(detectAttestation({ available: false })).toBe(CONDITION.INTEGRITY_UNAVAILABLE);
  });

  it('available:true, attestationFailed:true → INTEGRITY_FAIL (→ BLOCK)', () => {
    expect(detectAttestation({ available: true, attestationFailed: true })).toBe(
      CONDITION.INTEGRITY_FAIL,
    );
  });

  it('available:true, attestationFailed:false → CLEAN (does not worsen the native probe)', () => {
    expect(detectAttestation({ available: true, attestationFailed: false })).toBe(CONDITION.CLEAN);
  });

  it('null → INTEGRITY_UNAVAILABLE (fail-closed)', () => {
    expect(detectAttestation(null)).toBe(CONDITION.INTEGRITY_UNAVAILABLE);
  });

  it('undefined → INTEGRITY_UNAVAILABLE (fail-closed)', () => {
    expect(detectAttestation(undefined)).toBe(CONDITION.INTEGRITY_UNAVAILABLE);
  });
});

// ── attestationProbeSource — I3 guard + fail-closed egress leg ──────────────
describe('attestationProbeSource — I3 deniability guard fires FIRST', () => {
  it('deniability active → { available:false } and the verdict fn is NEVER called', async () => {
    h.deniabilityActive = true;
    const verdictFn = vi.fn(async () => ({ available: true, attestationFailed: false }));
    const src = await attestationProbeSource(verdictFn);
    expect(src).toEqual({ available: false });
    expect(verdictFn).not.toHaveBeenCalled();
  });

  it('deniability guard wins even on a native platform (no egress under decoy/hidden)', async () => {
    h.isNative = true;
    h.deniabilityActive = true;
    const verdictFn = vi.fn(async () => ({ available: true, attestationFailed: true }));
    const src = await attestationProbeSource(verdictFn);
    expect(src.available).toBe(false);
    expect(verdictFn).not.toHaveBeenCalled();
  });
});

describe('attestationProbeSource — fail-closed (I4)', () => {
  it('non-native platform → { available:false }', async () => {
    h.isNative = false;
    const verdictFn = vi.fn(async () => ({ available: true, attestationFailed: false }));
    const src = await attestationProbeSource(verdictFn);
    expect(src).toEqual({ available: false });
    expect(verdictFn).not.toHaveBeenCalled();
  });

  it('verdict fn throws → { available:false } (never a fabricated clean)', async () => {
    const verdictFn = vi.fn(async () => {
      throw new Error('play services absent');
    });
    const src = await attestationProbeSource(verdictFn);
    expect(src).toEqual({ available: false });
  });

  it('verdict fn returns { available:false } → { available:false }', async () => {
    const verdictFn = vi.fn(async () => ({ available: false }));
    const src = await attestationProbeSource(verdictFn);
    expect(src).toEqual({ available: false });
  });

  it('verdict fn returns a non-object / null → { available:false }', async () => {
    const verdictFn = vi.fn(async () => null);
    const src = await attestationProbeSource(verdictFn);
    expect(src).toEqual({ available: false });
  });
});

describe('attestationProbeSource — genuine verdict pass-through', () => {
  it('available:true, attestationFailed:false → { available:true, attestationFailed:false }', async () => {
    const verdictFn = vi.fn(async () => ({ available: true, attestationFailed: false }));
    const src = await attestationProbeSource(verdictFn);
    expect(src).toEqual({ available: true, attestationFailed: false });
    expect(verdictFn).toHaveBeenCalledTimes(1);
  });

  it('available:true, attestationFailed:true → { available:true, attestationFailed:true }', async () => {
    const verdictFn = vi.fn(async () => ({ available: true, attestationFailed: true }));
    const src = await attestationProbeSource(verdictFn);
    expect(src).toEqual({ available: true, attestationFailed: true });
  });

  it('detectAttestation over a failed genuine verdict is INTEGRITY_FAIL (end-to-end)', async () => {
    const verdictFn = vi.fn(async () => ({ available: true, attestationFailed: true }));
    const src = await attestationProbeSource(verdictFn);
    expect(detectAttestation(src)).toBe(CONDITION.INTEGRITY_FAIL);
  });
});
