// src/lib/__tests__/featureCatalogue.test.js
//
// Honesty locks for the feature catalogue. Every feature must be exactly one of
// verified / roadmap. The retired 'built' and 'available' states are rejected.
import { describe, it, expect } from 'vitest';
import {
  FEATURE_CATEGORIES,
  STATUS,
  resolveStatus,
} from '../featureCatalogue';

const allFeatures = FEATURE_CATEGORIES.flatMap((c) => c.features);
const byName = (name) => allFeatures.find((f) => f.name === name);

describe('two-state enum', () => {
  it('every feature catalogues exactly one of verified | roadmap', () => {
    const valid = new Set([STATUS.VERIFIED, STATUS.ROADMAP]);
    const bad = allFeatures.filter((f) => !valid.has(f.status));
    expect(bad.map((f) => `${f.name}:${f.status}`)).toEqual([]);
  });

  it('resolves to exactly one of verified | roadmap', () => {
    for (const f of allFeatures) {
      expect([STATUS.VERIFIED, STATUS.ROADMAP]).toContain(resolveStatus(f));
    }
  });
});

describe('no retired status strings', () => {
  it('no feature uses the retired "available" string', () => {
    const stale = allFeatures.filter((f) => f.status === 'available');
    expect(stale.map((f) => f.name)).toEqual([]);
  });

  it('no feature uses the retired "built" string', () => {
    const stale = allFeatures.filter((f) => f.status === 'built');
    expect(stale.map((f) => f.name)).toEqual([]);
  });
});

describe('key features are verified', () => {
  it('Risk Scoring is verified', () => {
    expect(resolveStatus(byName('Risk Limits / Risk Scoring'))).toBe(STATUS.VERIFIED);
  });
  it('Portfolio Dashboard is verified', () => {
    expect(resolveStatus(byName('Portfolio Dashboard'))).toBe(STATUS.VERIFIED);
  });
  it('Audit Log is verified', () => {
    expect(resolveStatus(byName('Audit Log'))).toBe(STATUS.VERIFIED);
  });
});
