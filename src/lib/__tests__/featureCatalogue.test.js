// src/lib/__tests__/featureCatalogue.test.js
//
// Honesty locks for the feature catalogue.
//
// THREE states — verified / built / roadmap — restored 2026-08-24. PR #145
// introduced them precisely to "stop conflating built with verified"; PR #1185
// ("promote all Built features to Verified/Green") collapsed them back to two
// and deleted the evidence gate in resolveStatus(). This file previously
// enforced that collapse, asserting that 'built' was a RETIRED string and that
// three code-complete features resolved to VERIFIED with no txid behind them.
//
// The load-bearing property is that `verified` cannot be asserted by
// inspection: it is earned only by a txid entry in docs/verified-evidence.json.
// Tests below assert BOTH directions — the downgrade AND the promotion — so a
// gate that simply returned 'built' for everything would fail too.
import { describe, it, expect } from 'vitest';
import {
  FEATURE_CATEGORIES,
  STATUS,
  resolveStatus,
  verifiedFeatureNames,
} from '../featureCatalogue';

const allFeatures = FEATURE_CATEGORIES.flatMap((c) => c.features);
const byName = (name) => allFeatures.find((f) => f.name === name);

describe('three-state enum', () => {
  it('every feature catalogues exactly one of verified | built | roadmap', () => {
    const valid = new Set([STATUS.VERIFIED, STATUS.BUILT, STATUS.ROADMAP]);
    const bad = allFeatures.filter((f) => !valid.has(f.status));
    expect(bad.map((f) => `${f.name}:${f.status}`)).toEqual([]);
  });

  it('resolves to exactly one of verified | built | roadmap', () => {
    for (const f of allFeatures) {
      expect([STATUS.VERIFIED, STATUS.BUILT, STATUS.ROADMAP]).toContain(resolveStatus(f));
    }
  });
});

describe('no retired status strings', () => {
  it('no feature uses the retired "available" string', () => {
    const stale = allFeatures.filter((f) => f.status === 'available');
    expect(stale.map((f) => f.name)).toEqual([]);
  });
});

describe('verified is earned by evidence, never by inspection', () => {
  // The downgrade. A hand-typed 'verified' with no txid must render 'built'.
  it('downgrades a hand-typed verified with no evidence entry to built', () => {
    expect(resolveStatus({ status: STATUS.VERIFIED, name: 'No Such Feature' })).toBe(STATUS.BUILT);
  });

  // The promotion. Without this, a gate hardcoded to return 'built' would pass
  // every other case in this block.
  it('honours verified when a matching txid entry exists', () => {
    const names = verifiedFeatureNames();
    expect(names.size, 'evidence file should carry txid entries').toBeGreaterThan(0);
    const key = [...names][0];
    expect(resolveStatus({ status: STATUS.VERIFIED, name: key })).toBe(STATUS.VERIFIED);
    expect(resolveStatus({ status: STATUS.VERIFIED, name: 'x', verifiedBy: key })).toBe(STATUS.VERIFIED);
  });

  it('never promotes roadmap, whatever the evidence file says', () => {
    const key = [...verifiedFeatureNames()][0];
    expect(resolveStatus({ status: STATUS.ROADMAP, name: key })).toBe(STATUS.ROADMAP);
  });

  it('every catalogue entry resolving to verified has a real evidence entry', () => {
    const names = verifiedFeatureNames();
    const unbacked = allFeatures
      .filter((f) => resolveStatus(f) === STATUS.VERIFIED)
      .filter((f) => !names.has(f.verifiedBy ?? f.name));
    expect(unbacked.map((f) => f.name)).toEqual([]);
  });
});

// These three were lifted out of `roadmap` by PR #145 — which placed them at
// BUILT, not verified, because none has a txid. PR #1185's flattening is what
// made them assert VERIFIED. Restored to what the evidence actually supports:
// the code is present (never roadmap), and nothing on-chain proves it.
describe('key features are built, not roadmap — and not verified either', () => {
  for (const name of ['Risk Limits / Risk Scoring', 'Portfolio Dashboard', 'Audit Log']) {
    it(`${name} resolves to built`, () => {
      const f = byName(name);
      expect(f, `${name} missing from the catalogue`).toBeTruthy();
      expect(resolveStatus(f)).toBe(STATUS.BUILT);
    });
  }
});

describe('release-track wording stays current', () => {
  it('Android App cites the current 1.0.1 / versionCode 10 train, not the retired versionCode 6 copy', () => {
    const feature = byName('Android App');
    expect(feature.explanation).toContain('1.0.1 / versionCode 10');
    expect(feature.explanation).not.toContain('versionCode 6');
    expect(feature.explanation).toContain('Pre-launch report');
  });
});
