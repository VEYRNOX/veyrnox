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

  // FLIPPED 2026-09-19. This used to assert the opposite — /submitted is not
  // approved/ and /not yet publicly listed/ — and it was right when written.
  // The app published on or before 2026-09-11 and both phrases went false, so
  // the pin was enforcing a falsehood. That is the tripwire working: a pin that
  // names the honesty property rather than the fact is what sent a reader back
  // here. Evidence for the flip, so the next reader can re-derive it rather
  // than trust this comment: the public listing at
  // play.google.com/store/apps/details?id=com.veyrnox.app returns 200 in US and
  // GB and renders "Updated on Sep 11, 2026", while a bogus package id on the
  // same host returns 404 — a draft or closed-testing-only app has no public
  // listing. The property now pinned is the NEW limit of what was checked:
  // a public page read is not a Play Developer API read, so the copy must not
  // claim a production versionCode it never looked up.
  it('claims publication only as far as the evidence goes, and names the gap (I4)', () => {
    const feature = byName('Android App');
    expect(feature.explanation).toMatch(/now published/i);
    // Must not silently upgrade a public-listing read into an API read.
    expect(feature.explanation).toMatch(/not of the play developer api/i);
    expect(feature.explanation).toMatch(/versionCode is live in production is unconfirmed/i);
    // The retired claims must not creep back in.
    expect(feature.explanation).not.toMatch(/not yet publicly listed/i);
    expect(feature.explanation).not.toMatch(/cannot report until the app publishes/i);
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

// The iOS entry had NO pins at all, and that is exactly why it rotted: it still
// said "published to TestFlight (1.0.1 Build 11, READY_FOR_BETA_TESTING)" and
// "no App Store review submission made" on 2026-09-19, six weeks after 1.0
// shipped and eight days after 1.0.1 was approved. The Android entry beside it
// carried pins and stayed broadly honest. Absence of a pin is not neutrality.
describe('iOS App catalogue copy', () => {
  it('carries no build number — the same decay the Android entry already avoids', () => {
    const feature = byName('iOS App');
    expect(feature.explanation).not.toMatch(/build\s*\d+/i);
    expect(feature.summary).not.toMatch(/build\s*\d+/i);
  });

  it('does not describe a shipped app as pre-release', () => {
    const feature = byName('iOS App');
    expect(feature.explanation).not.toMatch(/READY_FOR_BETA_TESTING/i);
    expect(feature.explanation).not.toMatch(/no App Store review submission made/i);
    expect(feature.explanation).not.toMatch(/submission on hold/i);
  });

  it('states the live status and keeps the caveats that are still open (I4)', () => {
    const feature = byName('iOS App');
    expect(feature.explanation).toMatch(/live on the App Store/i);
    expect(feature.explanation).toMatch(/READY_FOR_SALE/);
    // Shipping is not auditing. These must survive any future copy edit.
    expect(feature.explanation).toMatch(/rasp on an App Store install is not device-verified/i);
    expect(feature.explanation).toMatch(/no independent\s+security audit/i);
  });

  // Status stays BUILT deliberately. A live store listing is not the project's
  // 'verified' bar (CLAUDE.md: verified needs an on-chain txid the owner
  // supplies), and promoting it here would quietly redefine that vocabulary.
  it('stays at built, not verified', () => {
    expect(byName('iOS App').status).toBe('built');
    expect(byName('Android App').status).toBe('built');
  });
});
