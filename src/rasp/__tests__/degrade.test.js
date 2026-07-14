// src/rasp/__tests__/degrade.test.js
//
// RASP v1 — PROVISIONAL — independent audit complete (ECC 2026-06-23, §24;
// browser lane confirmed genuinely blocking at the wired call-site, no egress;
// M-4 stale-comment fix). Still BUILT, not 'verified'.
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
// RASP-A4 (2026-07-05 internal audit, MEDIUM): `permitsTestnet` was a DEAD field
// with zero live consumers (compose.js maps BLOCK → signerReachable:false for every
// send, testnet included), so it was removed entirely — a dead API field in a
// security module is a maintenance hazard. The artifact shape no longer carries it.
const ARTIFACT_KEYS = ['tier', 'sentence', 'blockedActions', 'requiresBiometric'];

describe('degrade — §4 degradation ladder (condition → tier)', () => {
  it('CLEAN → allow: no banner, no blocks, normal sign', () => {
    const a = degrade(CONDITION.CLEAN);
    expect(a.tier).toBe(TIER.ALLOW);
    expect(a.sentence).toBeNull();
    expect(a.blockedActions).toEqual([]);
    expect(a.requiresBiometric).toBe(false);
    expect(a).not.toHaveProperty('permitsTestnet'); // RASP-A4: dead field removed
  });

  it('ROOTED → warn-before-sign: one sentence + biometric re-confirm, sensitive paths blocked', () => {
    const a = degrade(CONDITION.ROOTED);
    expect(a.tier).toBe(TIER.WARN);
    expect(typeof a.sentence).toBe('string');
    expect(a.sentence.length).toBeGreaterThan(0);
    // G4 (2026-07-14): seed-reveal/export/import blocked at WARN tier.
    // 'sign' is NOT blocked here — handled by requiresBiometric B5 flow.
    for (const action of ['seed-reveal', 'export', 'import']) {
      expect(a.blockedActions).toContain(action);
    }
    expect(a.blockedActions).not.toContain('sign');
    expect(a.requiresBiometric).toBe(true);
  });

  it('INTEGRITY_UNAVAILABLE → warn (cautious tier per §2/I4), sensitive paths blocked', () => {
    const a = degrade(CONDITION.INTEGRITY_UNAVAILABLE);
    expect(a.tier).toBe(TIER.WARN);
    expect(typeof a.sentence).toBe('string');
    expect(a.requiresBiometric).toBe(true);
    // G4 (2026-07-14): same seed-reveal/export/import block as ROOTED (I4 fail-closed).
    for (const action of ['seed-reveal', 'export', 'import']) {
      expect(a.blockedActions).toContain(action);
    }
    expect(a.blockedActions).not.toContain('sign');
  });

  it('EMULATOR → block-signing (no testnet carve-out; dead field removed)', () => {
    const a = degrade(CONDITION.EMULATOR);
    expect(a.tier).toBe(TIER.BLOCK);
    expect(a.blockedActions).toContain('sign');
    // RASP-A4: `permitsTestnet` was never enforced (compose.js blocks every send
    // at BLOCK, testnet included), so the dead field is gone entirely.
    expect(a).not.toHaveProperty('permitsTestnet');
    // No destructive override on environment risk: cannot biometric your way past.
    expect(a.requiresBiometric).toBe(false);
  });

  it('INTEGRITY_FAIL → block-signing (attested hostile)', () => {
    const a = degrade(CONDITION.INTEGRITY_FAIL);
    expect(a.tier).toBe(TIER.BLOCK);
    expect(a.blockedActions).toContain('sign');
    expect(a).not.toHaveProperty('permitsTestnet');
  });

  it('HOOKED → block-signing: refuse sign AND sensitive paths', () => {
    const a = degrade(CONDITION.HOOKED);
    expect(a.tier).toBe(TIER.BLOCK);
    for (const action of ['sign', 'seed-reveal', 'export', 'import']) {
      expect(a.blockedActions).toContain(action);
    }
    expect(a.requiresBiometric).toBe(false);
  });

  it('TAMPERED → block-signing (strongest): refuse sign AND sensitive paths', () => {
    const a = degrade(CONDITION.TAMPERED);
    expect(a.tier).toBe(TIER.BLOCK);
    for (const action of ['sign', 'seed-reveal', 'export', 'import']) {
      expect(a.blockedActions).toContain(action);
    }
  });
});

describe('degrade — honest copy (I4): copy must not promise unenforced behavior', () => {
  // permitsTestnet and requiresBiometric are TARGET fields not consumed by the
  // live gate (compose.js maps BLOCK→signerReachable:false for ALL sends incl.
  // testnet, and WARN→proceed with NO biometric step). The user-facing copy must
  // therefore NOT promise a testnet carve-out or an enforced biometric re-confirm.

  it('EMULATOR copy does NOT promise testnet (the carve-out is unwired)', () => {
    const a = degrade(CONDITION.EMULATOR);
    expect(a.sentence.toLowerCase()).not.toContain('testnet');
  });

  it('WARN copy does NOT promise an enforced biometric re-confirm', () => {
    for (const condition of [CONDITION.ROOTED, CONDITION.INTEGRITY_UNAVAILABLE]) {
      const a = degrade(condition);
      expect(a.tier).toBe(TIER.WARN);
      expect(a.sentence.toLowerCase()).not.toContain('biometric');
    }
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
    expect(a.blockedActions).toContain('sign');
    expect(a).not.toHaveProperty('permitsTestnet');
  });

  it('undefined / null condition blocks (never allows)', () => {
    for (const bad of [undefined, null]) {
      const a = degrade(bad);
      expect(a.tier).toBe(TIER.BLOCK);
      expect(a.blockedActions).toContain('sign');
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
