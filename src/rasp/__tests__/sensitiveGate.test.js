// G4 — RASP gate for sensitive non-sign actions: seed-reveal, export, import.
//
// `degrade()` populates `blockedActions` with the SENSITIVE set for the strongest
// BLOCK tiers (HOOKED, TAMPERED, INTEGRITY_FAIL, fail-closed). `sensitiveGate`
// consumes that set at seed-reveal / export / import entry points so a BLOCK-tier
// environment cannot exfiltrate key material via those paths.
//
// G4 (2026-07-14): WARN tiers (ROOTED, INTEGRITY_UNAVAILABLE) also block
// seed-reveal / export / import — a detected-rooted or probe-unavailable device
// must not expose seed material. 'sign' is intentionally NOT blocked at WARN:
// it is handled by requiresBiometric re-confirm in SendCrypto.jsx B5.
// EMULATOR (BLOCK tier) still blocks only 'sign' to preserve E2E test infra.
//
// I3: `sensitiveGate` is pure — no egress, no wallet-set handle. Safe to call in
// any session type (real or decoy). The `blockedActions` set is symmetric by
// construction (degrade() is I3-pure).
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

// ── WARN tiers block sensitive key-access paths (G4, 2026-07-14) ────────────

describe('sensitiveGate — WARN conditions block seed-reveal/export/import', () => {
  it('ROOTED blocks seed-reveal (G4: seed must not be exposed on a rooted device)', () => {
    const artifact = degrade(CONDITION.ROOTED);
    expect(sensitiveGate(artifact, 'seed-reveal').blocked).toBe(true);
  });

  it('INTEGRITY_UNAVAILABLE blocks export (I4: fail closed when integrity unknown)', () => {
    const artifact = degrade(CONDITION.INTEGRITY_UNAVAILABLE);
    expect(sensitiveGate(artifact, 'export').blocked).toBe(true);
  });

  it('ROOTED — blocked result carries the degrade sentence (not null)', () => {
    const artifact = degrade(CONDITION.ROOTED);
    const result = sensitiveGate(artifact, 'seed-reveal');
    expect(result.sentence).toBe(artifact.sentence);
    expect(result.sentence).toBeTruthy();
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
