// src/lib/__tests__/catalogueClassificationDrift.test.js
//
// Drift guard between the two feature-state surfaces and the single source of
// truth.
//
//   featureClassification.js  — SOURCE OF TRUTH. Route → { verdict } where
//                               verdict is 'live' | 'disabled' | 'cut'.
//   featureCatalogue.js       — human-facing three-state catalogue (verified |
//                               built | roadmap), keyed by feature NAME.
//
// These drifted before (PR #229): routes went `live` in classification while
// their catalogue entries still said `roadmap`, and the catalogue cited routes
// in prose that no longer matched their real verdict. The catalogue's own
// header anticipated this ("PR-B will DERIVE built from … status tags so CI
// catches any future drift"). This is that guard.
//
// Mechanism: a catalogue entry signals "this feature is shipped on route /x" by
// citing the route in its explanation prose, e.g. "Built (/net-worth)". That
// citation is a load-bearing CLAIM, so we hold it to the source of truth:
//
//   1. Any route a catalogue entry cites MUST exist in CLASSIFICATION — no
//      citing a route that was renamed or removed.
//   2. Any cited route MUST have verdict 'live' — the catalogue may not cite a
//      cut/disabled route as evidence that a feature is built.
//   3. A feature that cites a live route may NOT resolve to `roadmap` — that is
//      exactly the understatement drift PR #229 fixed.
//
// This is intentionally conservative: it validates the claims the catalogue
// actually makes (cited routes) rather than trying to map every feature name to
// a route. It cannot prove completeness, but it makes the specific drift that
// bit us un-mergeable.
import { describe, it, expect } from 'vitest';
import { FEATURE_CATEGORIES, resolveStatus, STATUS } from '../featureCatalogue';
import { CLASSIFICATION } from '../featureClassification';

const allFeatures = FEATURE_CATEGORIES.flatMap((c) => c.features);

// A route is "cited" when it appears as "(/route" in the explanation prose —
// the convention every built/route-backed entry uses ("Built (/net-worth)").
const citedRoutes = (feature) =>
  [...(feature.explanation ?? '').matchAll(/\((\/[a-z0-9-]+)/g)].map((m) => m[1]);

describe('catalogue ↔ classification drift guard', () => {
  it('every route a catalogue entry cites exists in CLASSIFICATION', () => {
    const dangling = [];
    for (const f of allFeatures) {
      for (const r of citedRoutes(f)) {
        if (!(r in CLASSIFICATION)) dangling.push(`${f.name} → ${r}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it('every cited route is live in CLASSIFICATION (no citing cut/disabled routes as built)', () => {
    const wrong = [];
    for (const f of allFeatures) {
      for (const r of citedRoutes(f)) {
        const verdict = CLASSIFICATION[r]?.verdict;
        if (verdict && verdict !== 'live') wrong.push(`${f.name} cites ${r} (verdict=${verdict})`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('a feature that cites a live route is never shown as roadmap', () => {
    const understated = [];
    for (const f of allFeatures) {
      const hasLiveRoute = citedRoutes(f).some((r) => CLASSIFICATION[r]?.verdict === 'live');
      if (hasLiveRoute && resolveStatus(f) === STATUS.ROADMAP) understated.push(f.name);
    }
    expect(understated).toEqual([]);
  });
});
