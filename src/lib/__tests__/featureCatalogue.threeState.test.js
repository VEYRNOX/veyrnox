// src/lib/__tests__/featureCatalogue.threeState.test.js
//
// Renders nothing — this pins the SHAPE of what the Features page will show,
// which is the part that regressed. PR #1185 collapsed three states to two by
// deleting the evidence gate, and the resulting page showed 48 features teal
// with zero txids behind them. A count assertion is the cheapest thing that
// goes red if that happens again.
//
// Deliberately NOT asserting exact totals: the catalogue grows most weeks and a
// brittle "6 Verified" would be edited to match rather than investigated. What
// must hold is the INVARIANT — every teal badge is backed by a real txid, and
// the amber state is actually in use rather than being a dead enum value.
import { describe, it, expect } from 'vitest';
import {
  FEATURE_CATEGORIES,
  STATUS,
  resolveStatus,
  verifiedFeatureNames,
} from '../featureCatalogue';

const all = FEATURE_CATEGORIES.flatMap((c) => c.features);
const countOf = (s) => all.filter((f) => resolveStatus(f) === s).length;

describe('Features page — three-state shape', () => {
  it('uses all three states', () => {
    expect(countOf(STATUS.VERIFIED), 'no verified features — evidence file empty or gate broken').toBeGreaterThan(0);
    expect(countOf(STATUS.BUILT), 'no built features — the amber state is dead again (PR #1185 regression)').toBeGreaterThan(0);
    expect(countOf(STATUS.ROADMAP)).toBeGreaterThan(0);
  });

  it('the three counts partition the catalogue exactly', () => {
    expect(countOf(STATUS.VERIFIED) + countOf(STATUS.BUILT) + countOf(STATUS.ROADMAP)).toBe(all.length);
  });

  // The regression in one line: verified must never be the majority state
  // unless the evidence file has genuinely caught up. 7 txid entries cannot
  // back 50+ green badges.
  it('verified count never exceeds the number of txid evidence entries', () => {
    expect(countOf(STATUS.VERIFIED)).toBeLessThanOrEqual(verifiedFeatureNames().size);
  });

  it('every verified feature names an evidence entry that exists', () => {
    const names = verifiedFeatureNames();
    const unbacked = all
      .filter((f) => resolveStatus(f) === STATUS.VERIFIED)
      .map((f) => f.verifiedBy ?? f.name)
      .filter((k) => !names.has(k));
    expect(unbacked).toEqual([]);
  });
});
