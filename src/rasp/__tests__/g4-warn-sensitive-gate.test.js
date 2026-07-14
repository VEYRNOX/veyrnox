// src/rasp/__tests__/g4-warn-sensitive-gate.test.js
//
// G4 — WARN-tier sensitive-action gate (seed-reveal / export / import).
//
// DESIGN DECISION (G4 remainder, 2026-07-14):
//   The SENSITIVE set (['sign','seed-reveal','export','import']) previously
//   appeared only in BLOCK-tier conditions (INTEGRITY_FAIL, HOOKED, TAMPERED).
//   For WARN-tier conditions (ROOTED, INTEGRITY_UNAVAILABLE), blockedActions
//   was empty — seed-reveal, export, and import passed through on a detected-rooted
//   or probe-unavailable device.
//
//   This is closed by extending ROOTED and INTEGRITY_UNAVAILABLE to block
//   ['seed-reveal','export','import'] (without 'sign': the sign path is
//   handled separately by requiresBiometric re-confirm in SendCrypto.jsx B5,
//   so blocking sign here would double-gate it).
//
//   The TIER stays WARN; this is NOT a promotion to BLOCK. The sensitiveGate
//   callers (useRevealWithReauth, PersonalBackup, WalletEntry) already show
//   a blocked-action toast and return early whenever gate.blocked is true —
//   no UI changes needed, just the policy extension here.
//
// INTERNAL · BUILT · not device-verified · not independently audited.

import { describe, it, expect } from 'vitest';
import { degrade } from '../degrade.js';
import { sensitiveGate } from '../sensitiveGate.js';
import { CONDITION, TIER } from '../conditions.js';

const WARN_SENSITIVE = ['seed-reveal', 'export', 'import'];

describe('G4 ROOTED — blocks sensitive key-access actions (not sign)', () => {
  it('still maps to TIER.WARN (not promoted to BLOCK)', () => {
    expect(degrade(CONDITION.ROOTED).tier).toBe(TIER.WARN);
  });

  it('blockedActions includes seed-reveal', () => {
    expect(degrade(CONDITION.ROOTED).blockedActions).toContain('seed-reveal');
  });

  it('blockedActions includes export', () => {
    expect(degrade(CONDITION.ROOTED).blockedActions).toContain('export');
  });

  it('blockedActions includes import', () => {
    expect(degrade(CONDITION.ROOTED).blockedActions).toContain('import');
  });

  it('blockedActions does NOT include sign (sign handled by requiresBiometric re-confirm)', () => {
    // ROOTED uses requiresBiometric: true + CAUTION checkbox for sign — not a hard block.
    // Adding sign to blockedActions would double-gate and conflict with SendCrypto.jsx B5.
    expect(degrade(CONDITION.ROOTED).blockedActions).not.toContain('sign');
  });

  it('requiresBiometric is still true (B5 biometric re-confirm required for sign)', () => {
    expect(degrade(CONDITION.ROOTED).requiresBiometric).toBe(true);
  });

  it.each(WARN_SENSITIVE)('sensitiveGate blocks %s on a ROOTED artifact', (action) => {
    const artifact = degrade(CONDITION.ROOTED);
    expect(sensitiveGate(artifact, action).blocked).toBe(true);
  });
});

describe('G4 INTEGRITY_UNAVAILABLE — blocks sensitive key-access actions', () => {
  it('still maps to TIER.WARN', () => {
    expect(degrade(CONDITION.INTEGRITY_UNAVAILABLE).tier).toBe(TIER.WARN);
  });

  it('blockedActions includes seed-reveal', () => {
    expect(degrade(CONDITION.INTEGRITY_UNAVAILABLE).blockedActions).toContain('seed-reveal');
  });

  it('blockedActions includes export', () => {
    expect(degrade(CONDITION.INTEGRITY_UNAVAILABLE).blockedActions).toContain('export');
  });

  it('blockedActions includes import', () => {
    expect(degrade(CONDITION.INTEGRITY_UNAVAILABLE).blockedActions).toContain('import');
  });

  it('blockedActions does NOT include sign', () => {
    expect(degrade(CONDITION.INTEGRITY_UNAVAILABLE).blockedActions).not.toContain('sign');
  });

  it.each(WARN_SENSITIVE)('sensitiveGate blocks %s on an INTEGRITY_UNAVAILABLE artifact', (action) => {
    const artifact = degrade(CONDITION.INTEGRITY_UNAVAILABLE);
    expect(sensitiveGate(artifact, action).blocked).toBe(true);
  });
});

describe('G4 CLEAN — sensitiveGate does NOT block on a clean device', () => {
  it.each(WARN_SENSITIVE)('sensitiveGate does not block %s on CLEAN', (action) => {
    const artifact = degrade(CONDITION.CLEAN);
    expect(sensitiveGate(artifact, action).blocked).toBe(false);
  });
});

describe('G4 BLOCK tiers — sensitive actions still blocked (regression)', () => {
  const BLOCK_CONDITIONS = [CONDITION.HOOKED, CONDITION.TAMPERED, CONDITION.INTEGRITY_FAIL];

  it.each(BLOCK_CONDITIONS)('%s still blocks seed-reveal', (cond) => {
    expect(degrade(cond).blockedActions).toContain('seed-reveal');
  });

  it.each(BLOCK_CONDITIONS)('%s still blocks export', (cond) => {
    expect(degrade(cond).blockedActions).toContain('export');
  });

  it.each(BLOCK_CONDITIONS)('%s still blocks import', (cond) => {
    expect(degrade(cond).blockedActions).toContain('import');
  });
});
