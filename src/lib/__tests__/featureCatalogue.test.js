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
  // This block used to pin the literal string '1.0.1 / versionCode 10'. That is
  // why the copy still said versionCode 10 while build.gradle was at 48 — the
  // pin FROZE a decaying number and made correcting it a test change nobody had
  // a reason to make. It also let the surrounding sentences go false unnoticed:
  // the copy claimed submission "remains on hold" and that no review submission
  // had been made, for a day after both stores were submitted (2026-09-08).
  //
  // So these assert the HONESTY PROPERTIES that must hold, not a build number.
  // Each one names a specific way this copy has been or could go wrong.
  it('carries no versionCode at all — a build number a user cannot act on only decays', () => {
    const feature = byName('Android App');
    expect(feature.explanation).not.toMatch(/versionCode\s*\d+/i);
    expect(feature.summary).not.toMatch(/versionCode\s*\d+/i);
    // The release train still identifies the entry; only the build number goes.
    expect(feature.explanation).toContain('1.0.1');
  });

  it('says submitted for review, and does not imply the hold is still in force', () => {
    const feature = byName('Android App');
    expect(feature.explanation).toMatch(/submitted for google play review/i);
    // The two sentences that went false on 2026-09-08.
    expect(feature.explanation).not.toMatch(/remains on hold/i);
    expect(feature.explanation).not.toMatch(/no production review submission made/i);
  });

  it('does not let "submitted" read as approved, published, or listed (I4)', () => {
    const feature = byName('Android App');
    expect(feature.explanation).toMatch(/submitted is not approved/i);
    expect(feature.explanation).toMatch(/not yet publicly listed/i);
  });

  it('still discloses the Pre-launch report gap and that the Robo run is on an earlier build', () => {
    const feature = byName('Android App');
    expect(feature.explanation).toMatch(/pre-launch report/i);
    // F-2 (diff-2026-09-09): no Robo run exists for the submitted build. If that
    // is ever closed by a real run on the submitted versionCode, this assertion
    // is the thing that sends you back here to update the copy.
    expect(feature.explanation).toMatch(/earlier build/i);
    expect(feature.explanation).toMatch(/rasp on a play install is not device-verified/i);
  });
});
