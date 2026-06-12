// src/rasp/__tests__/degrade.test.js
//
// RASP v1 — UNAUDITED-PROVISIONAL.
//
// degrade(condition) is the PURE condition → response-tier mapping. It is the I3
// line-item subject (§5): it takes NO wallet-set handle, and its output is a pure
// function of the detector condition. These tests pin the §4 degradation ladder
// (three tiers) and the I4 fail-closed default (unknown condition blocks, never
// allows).

import { describe, it, expect } from 'vitest';
import { degrade } from '../degrade.js';
import { CONDITION, TIER } from '../conditions.js';

// Every artifact carries the SAME fixed key set, whatever the condition — a
// uniform shape is what lets the I3 test assert structural identity across sets.
const ARTIFACT_KEYS = ['tier', 'sentence', 'blockedActions', 'permitsTestnet', 'requiresBiometric'];

describe('degrade — §4 degradation ladder (condition → tier)', () => {
  it('CLEAN → allow: no banner, no blocks, normal sign', () => {
    const a = degrade(CONDITION.CLEAN);
    expect(a.tier).toBe(TIER.ALLOW);
    expect(a.sentence).toBeNull();
    expect(a.blockedActions).toEqual([]);
    expect(a.permitsTestnet).toBe(true);
    expect(a.requiresBiometric).toBe(false);
  });

  it('ROOTED → warn-before-sign: one sentence + biometric re-confirm, no blocks', () => {
    const a = degrade(CONDITION.ROOTED);
    expect(a.tier).toBe(TIER.WARN);
    expect(typeof a.sentence).toBe('string');
    expect(a.sentence.length).toBeGreaterThan(0);
    expect(a.blockedActions).toEqual([]);
    expect(a.requiresBiometric).toBe(true);
    expect(a.permitsTestnet).toBe(true);
  });

  it('INTEGRITY_UNAVAILABLE → warn (cautious tier per §2/I4), honest copy', () => {
    const a = degrade(CONDITION.INTEGRITY_UNAVAILABLE);
    expect(a.tier).toBe(TIER.WARN);
    expect(typeof a.sentence).toBe('string');
    expect(a.requiresBiometric).toBe(true);
    expect(a.blockedActions).toEqual([]);
  });

  it('EMULATOR → block-signing, but testnet permitted (dev/QA affordance)', () => {
    const a = degrade(CONDITION.EMULATOR);
    expect(a.tier).toBe(TIER.BLOCK);
    expect(a.blockedActions).toContain('sign');
    expect(a.permitsTestnet).toBe(true);
    // No destructive override on environment risk: cannot biometric your way past.
    expect(a.requiresBiometric).toBe(false);
  });

  it('INTEGRITY_FAIL → block-signing, testnet NOT permitted (attested hostile)', () => {
    const a = degrade(CONDITION.INTEGRITY_FAIL);
    expect(a.tier).toBe(TIER.BLOCK);
    expect(a.blockedActions).toContain('sign');
    expect(a.permitsTestnet).toBe(false);
  });

  it('HOOKED → block-signing: refuse sign AND sensitive paths', () => {
    const a = degrade(CONDITION.HOOKED);
    expect(a.tier).toBe(TIER.BLOCK);
    for (const action of ['sign', 'seed-reveal', 'export', 'import']) {
      expect(a.blockedActions).toContain(action);
    }
    expect(a.permitsTestnet).toBe(false);
    expect(a.requiresBiometric).toBe(false);
  });

  it('TAMPERED → block-signing (strongest): refuse sign AND sensitive paths', () => {
    const a = degrade(CONDITION.TAMPERED);
    expect(a.tier).toBe(TIER.BLOCK);
    for (const action of ['sign', 'seed-reveal', 'export', 'import']) {
      expect(a.blockedActions).toContain(action);
    }
    expect(a.permitsTestnet).toBe(false);
  });
});

describe('degrade — uniform artifact shape', () => {
  it('returns the same fixed key set for every condition', () => {
    for (const condition of Object.values(CONDITION)) {
      const a = degrade(condition);
      expect(Object.keys(a).sort()).toEqual([...ARTIFACT_KEYS].sort());
    }
  });
});

describe('degrade — I4 fail closed', () => {
  it('an unknown condition blocks (never allows)', () => {
    const a = degrade('something-we-never-defined');
    expect(a.tier).toBe(TIER.BLOCK);
    expect(a.permitsTestnet).toBe(false);
    expect(a.blockedActions).toContain('sign');
  });

  it('undefined / null condition blocks (never allows)', () => {
    for (const bad of [undefined, null]) {
      const a = degrade(bad);
      expect(a.tier).toBe(TIER.BLOCK);
      expect(a.permitsTestnet).toBe(false);
    }
  });

  it('never returns ALLOW for a near-miss of the CLEAN constant', () => {
    // Condition values are lowercase; 'CLEAN' is NOT a defined value, so it must
    // fail closed rather than coincidentally allow.
    const a = degrade('CLEAN');
    expect(a.tier).not.toBe(TIER.ALLOW);
    expect(a.tier).toBe(TIER.BLOCK);
  });
});
