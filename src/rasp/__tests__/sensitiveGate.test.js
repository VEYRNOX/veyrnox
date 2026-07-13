// G4 — RASP gate for sensitive non-sign actions: seed-reveal, export, import.
//
// `degrade()` populates `blockedActions` with the SENSITIVE set for the strongest
// BLOCK tiers (HOOKED, TAMPERED, INTEGRITY_FAIL, fail-closed). `sensitiveGate`
// consumes that set at seed-reveal / export / import entry points so a BLOCK-tier
// environment cannot exfiltrate key material via those paths.
//
// WARN tiers (ROOTED, INTEGRITY_UNAVAILABLE) have `blockedActions: []` — seed
// access is allowed on WARN (the biometric re-confirm gate from B5 already covers
// the send path; a separate WARN block on reveal is disproportionate and would
// deadlock recovery on a degraded device). Callers may still surface the WARN
// sentence to inform the user.
//
// I3: `sensitiveGate` is pure — no egress, no wallet-set handle. Safe to call in
// any session type (real or decoy). The `blockedActions` set is symmetric by
// construction (degrade() is I3-pure).

import { describe, it, expect } from 'vitest';
import { sensitiveGate } from '../sensitiveGate.js';
import { degrade } from '../degrade.js';
import { CONDITION } from '../conditions.js';

// ── Core gate logic ──────────────────────────────────────────────────────────

describe('sensitiveGate — core blocking logic', () => {
  it('blocks seed-reveal on HOOKED (blockedActions includes seed-reveal)', () => {
    const artifact = degrade(CONDITION.HOOKED);
    const result = sensitiveGate(artifact, 'seed-reveal');
    expect(result.blocked).toBe(true);
    expect(result.sentence).toBeTruthy();
  });

  it('blocks export on TAMPERED', () => {
    const artifact = degrade(CONDITION.TAMPERED);
    expect(sensitiveGate(artifact, 'export').blocked).toBe(true);
  });

  it('blocks import on INTEGRITY_FAIL', () => {
    const artifact = degrade(CONDITION.INTEGRITY_FAIL);
    expect(sensitiveGate(artifact, 'import').blocked).toBe(true);
  });

  it('blocks sign on HOOKED (present in sensitiveGate for completeness)', () => {
    const artifact = degrade(CONDITION.HOOKED);
    expect(sensitiveGate(artifact, 'sign').blocked).toBe(true);
  });

  it('does NOT block seed-reveal on EMULATOR (only sign is blocked)', () => {
    const artifact = degrade(CONDITION.EMULATOR);
    expect(sensitiveGate(artifact, 'seed-reveal').blocked).toBe(false);
  });

  it('does NOT block export on EMULATOR', () => {
    const artifact = degrade(CONDITION.EMULATOR);
    expect(sensitiveGate(artifact, 'export').blocked).toBe(false);
  });
});

// ── WARN tiers do not hard-block access ─────────────────────────────────────

describe('sensitiveGate — WARN conditions pass through', () => {
  it('ROOTED does not block seed-reveal (blockedActions is empty for WARN)', () => {
    const artifact = degrade(CONDITION.ROOTED);
    expect(sensitiveGate(artifact, 'seed-reveal').blocked).toBe(false);
  });

  it('INTEGRITY_UNAVAILABLE does not block export', () => {
    const artifact = degrade(CONDITION.INTEGRITY_UNAVAILABLE);
    expect(sensitiveGate(artifact, 'export').blocked).toBe(false);
  });

  it('returns null sentence when not blocked (no sentence to surface)', () => {
    const artifact = degrade(CONDITION.ROOTED);
    expect(sensitiveGate(artifact, 'seed-reveal').sentence).toBeNull();
  });
});

// ── ALLOW condition ──────────────────────────────────────────────────────────

describe('sensitiveGate — ALLOW passes all actions', () => {
  it('CLEAN allows seed-reveal', () => {
    expect(sensitiveGate(degrade(CONDITION.CLEAN), 'seed-reveal').blocked).toBe(false);
  });

  it('CLEAN returns null sentence', () => {
    expect(sensitiveGate(degrade(CONDITION.CLEAN), 'export').sentence).toBeNull();
  });
});

// ── Null/undefined artifact (during async probe load) ────────────────────────

describe('sensitiveGate — null artifact is safe (not blocked)', () => {
  it('null artifact → not blocked (probe still loading)', () => {
    expect(sensitiveGate(null, 'seed-reveal').blocked).toBe(false);
  });

  it('undefined artifact → not blocked', () => {
    expect(sensitiveGate(undefined, 'export').blocked).toBe(false);
  });

  it('null artifact → null sentence', () => {
    expect(sensitiveGate(null, 'import').sentence).toBeNull();
  });
});

// ── Sentence is forwarded when blocked ───────────────────────────────────────

describe('sensitiveGate — blocked result carries the degrade sentence', () => {
  it('blocked result sentence matches the degrade artifact sentence', () => {
    const artifact = degrade(CONDITION.HOOKED);
    const result = sensitiveGate(artifact, 'seed-reveal');
    expect(result.sentence).toBe(artifact.sentence);
  });
});
