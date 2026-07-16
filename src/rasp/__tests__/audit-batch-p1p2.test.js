// Audit batch — P1-2 (sensitiveGate fail-closed on null), P2-3 (attestation
// DEMO gap), P2-6 (shape fragility across detect / nativeProbe / attestation).
//
// All three are fail-open → fail-closed conversions (I4). None touch keys (I1).
// None add wallet-set handles (I3 preserved).
//
// P2-6 in particular is DEFENSE-IN-DEPTH against a compromised bridge: the honest
// producers (nativeProbe.js, browserProbe.js) always emit full-shape verdicts, so
// this fix only refuses garbage/partial shapes a future bridge bug or hostile
// tampering could inject.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── P1-2 — sensitiveGate must fail CLOSED on null/undefined artifact ─────────

import { sensitiveGate } from '@/rasp/sensitiveGate.js';

describe('P1-2 — sensitiveGate fail-closed on null/undefined artifact', () => {
  it('null artifact → blocked:true, honest sentence', () => {
    const r = sensitiveGate(null, 'seed-reveal');
    expect(r.blocked).toBe(true);
    expect(typeof r.sentence).toBe('string');
    expect(r.sentence.length).toBeGreaterThan(0);
  });
  it('undefined artifact → blocked:true for export', () => {
    expect(sensitiveGate(undefined, 'export').blocked).toBe(true);
  });
  it('null artifact → blocked:true for import', () => {
    const r = sensitiveGate(null, 'import');
    expect(r.blocked).toBe(true);
    expect(r.sentence).not.toBeNull();
  });
});

// ── P2-3 — attestation.js must gate on isDeniabilityOrDemoActive (not just session)

const h = vi.hoisted(() => ({
  isNative: true,
  denyOrDemo: false,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => h.isNative },
}));

vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilitySessionActive: () => false, // legacy; new code must use the DEMO-aware helper
  isDeniabilityOrDemoActive: () => h.denyOrDemo,
}));

import { attestationProbeSource, detectAttestation } from '@/rasp/attestation.js';
import { CONDITION } from '@/rasp/conditions.js';

beforeEach(() => {
  h.isNative = true;
  h.denyOrDemo = false;
});

describe('P2-3 — attestationProbeSource honours DEMO flag (isDeniabilityOrDemoActive)', () => {
  it('DEMO flag (or deniability) active → { available:false }, verdict fn NEVER called', async () => {
    h.denyOrDemo = true;
    const verdictFn = vi.fn(async () => ({ available: true, attestationFailed: false }));
    const src = await attestationProbeSource(verdictFn);
    expect(src).toEqual({ available: false });
    expect(verdictFn).not.toHaveBeenCalled();
  });

  it('DEMO/deniability off → bridge is called normally (no false-positive gate)', async () => {
    h.denyOrDemo = false;
    const verdictFn = vi.fn(async () => ({ available: true, attestationFailed: false }));
    const src = await attestationProbeSource(verdictFn);
    expect(verdictFn).toHaveBeenCalledTimes(1);
    expect(src).toEqual({ available: true, attestationFailed: false });
  });
});

// ── P2-6c — attestation shape validation: attestationFailed must be boolean ──

describe('P2-6c — detectAttestation refuses partial attestation shapes (fail-closed)', () => {
  it('{ available:true } (missing attestationFailed) → INTEGRITY_UNAVAILABLE', () => {
    expect(detectAttestation({ available: true })).toBe(CONDITION.INTEGRITY_UNAVAILABLE);
  });
  it('{ available:true, attestationFailed:"no" } (non-boolean) → INTEGRITY_UNAVAILABLE', () => {
    expect(detectAttestation({ available: true, attestationFailed: 'no' })).toBe(
      CONDITION.INTEGRITY_UNAVAILABLE,
    );
  });
  it('{ available:true, attestationFailed:false } (well-formed CLEAN) → CLEAN', () => {
    expect(detectAttestation({ available: true, attestationFailed: false })).toBe(CONDITION.CLEAN);
  });
  it('{ available:true, attestationFailed:true } → INTEGRITY_FAIL', () => {
    expect(detectAttestation({ available: true, attestationFailed: true })).toBe(
      CONDITION.INTEGRITY_FAIL,
    );
  });
});

// P2-6c — the probe source normaliser must also refuse partial bridge output.
describe('P2-6c — attestationProbeSource refuses partial bridge verdicts', () => {
  it('verdict { available:true } (no attestationFailed) → { available:false }', async () => {
    const verdictFn = vi.fn(async () => ({ available: true }));
    const src = await attestationProbeSource(verdictFn);
    expect(src).toEqual({ available: false });
  });
  it('verdict { available:true, attestationFailed:"failed" } (non-boolean) → { available:false }', async () => {
    const verdictFn = vi.fn(async () => ({ available: true, attestationFailed: 'failed' }));
    const src = await attestationProbeSource(verdictFn);
    expect(src).toEqual({ available: false });
  });
});

// ── P2-6a — detect() shape validation (four boolean signals required) ────────

import { detect } from '@/rasp/detect.js';

describe('P2-6a — detect() refuses partial signals (fail-closed)', () => {
  it('{ available:true, signals:{} } → INTEGRITY_UNAVAILABLE (was CLEAN — fail-open bug)', () => {
    expect(detect({ available: true, signals: {} })).toBe(CONDITION.INTEGRITY_UNAVAILABLE);
  });
  it('{ available:true, signals:{ rooted:false, hooked:false } } (two missing) → INTEGRITY_UNAVAILABLE', () => {
    expect(
      detect({ available: true, signals: { rooted: false, hooked: false } }),
    ).toBe(CONDITION.INTEGRITY_UNAVAILABLE);
  });
  it('{ available:true, signals:{ rooted:"no", hooked:false, emulator:false, tampered:false } } (non-boolean) → INTEGRITY_UNAVAILABLE', () => {
    expect(
      detect({
        available: true,
        signals: { rooted: 'no', hooked: false, emulator: false, tampered: false },
      }),
    ).toBe(CONDITION.INTEGRITY_UNAVAILABLE);
  });
  it('{ available:true, signals: all-four-false } → CLEAN (well-formed pass)', () => {
    expect(
      detect({
        available: true,
        signals: { rooted: false, hooked: false, emulator: false, tampered: false },
      }),
    ).toBe(CONDITION.CLEAN);
  });
  it('{ available:true, signals: all-four booleans, hooked:true } → HOOKED', () => {
    expect(
      detect({
        available: true,
        signals: { rooted: false, hooked: true, emulator: false, tampered: false },
      }),
    ).toBe(CONDITION.HOOKED);
  });
});

// ── P2-6b — nativeProbe adapter shape validation ─────────────────────────────
//
// Mocked isolate: the module under test is `nativeProbe.js`. We drive it through
// an injected fake Capacitor + fake RaspIntegrity by re-mocking below.

describe('P2-6b — nativeProbe rejects partial bridge verdicts (structural test)', async () => {
  // Fresh vi.mock scope in a nested describe won't propagate; run through a fresh
  // dynamic import with distinct mocks.
  vi.resetModules();

  vi.doMock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => true },
  }));

  const state = { verdict: null };
  vi.doMock('@/rasp/raspIntegrityPlugin', () => ({
    RaspIntegrity: {
      checkIntegrity: async () => state.verdict,
    },
  }));

  const { nativeProbeSource } = await import('@/rasp/nativeProbe.js');

  it('{} (empty) → { available:false } (was fabricated CLEAN — fail-open bug)', async () => {
    state.verdict = {};
    const src = await nativeProbeSource();
    expect(src).toEqual({ available: false });
  });
  it('{ hookedProcess:true } (only one field) → { available:false }', async () => {
    state.verdict = { hookedProcess: true };
    const src = await nativeProbeSource();
    expect(src).toEqual({ available: false });
  });
  it('{ rooted:"yes", hookedProcess:false, emulator:false, tampered:false } (non-boolean) → { available:false }', async () => {
    state.verdict = { rooted: 'yes', hookedProcess: false, emulator: false, tampered: false };
    const src = await nativeProbeSource();
    expect(src).toEqual({ available: false });
  });
  it('iOS-shape { jailbroken, hookedProcess, emulator, tampered } (rooted absent) → available:true (union compat preserved)', async () => {
    state.verdict = { jailbroken: false, hookedProcess: false, emulator: false, tampered: false };
    const src = await nativeProbeSource();
    expect(src.available).toBe(true);
    // 2026-07-16: `elevated` is now a fifth signal alongside the original four.
    expect(src.signals).toEqual({ rooted: false, hooked: false, emulator: false, tampered: false, elevated: false });
  });
  it('full Android-shape → available:true, correctly mapped', async () => {
    state.verdict = { rooted: true, hookedProcess: false, emulator: false, tampered: false };
    const src = await nativeProbeSource();
    expect(src.available).toBe(true);
    expect(src.signals.rooted).toBe(true);
  });
});
