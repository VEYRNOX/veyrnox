// src/lib/__tests__/featureCatalogue.test.js
//
// Honesty locks for the three-state feature catalogue (features-status-schema
// brief, PR-A). The catalogue must render exactly one of verified / built /
// roadmap, and `verified` must be IMPOSSIBLE to assert by hand — it requires a
// real testnet txid in docs/verified-evidence.json. Code inspection never
// promotes a feature to verified.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  FEATURE_CATEGORIES,
  STATUS,
  resolveStatus,
  verifiedFeatureNames,
} from '../featureCatalogue';

const here = dirname(fileURLToPath(import.meta.url));
const allFeatures = FEATURE_CATEGORIES.flatMap((c) => c.features);
const byName = (name) => allFeatures.find((f) => f.name === name);

describe('three-state enum', () => {
  it('every feature catalogues exactly one of verified | built | roadmap', () => {
    const valid = new Set([STATUS.VERIFIED, STATUS.BUILT, STATUS.ROADMAP]);
    const bad = allFeatures.filter((f) => !valid.has(f.status));
    expect(bad.map((f) => `${f.name}:${f.status}`)).toEqual([]);
  });

  it('resolves to exactly one of the three states', () => {
    for (const f of allFeatures) {
      expect([STATUS.VERIFIED, STATUS.BUILT, STATUS.ROADMAP]).toContain(resolveStatus(f));
    }
  });
});

describe('verified is gated on txid evidence — never assertable by inspection', () => {
  it('docs/verified-evidence.json parses and exposes an evidence map', () => {
    const raw = JSON.parse(readFileSync(resolve(here, '../../../docs/verified-evidence.json'), 'utf8'));
    expect(typeof raw.evidence).toBe('object');
  });

  it('a hand-typed verified status with no evidence entry resolves to built', () => {
    const fake = { name: '__no_such_evidence__', status: STATUS.VERIFIED };
    expect(resolveStatus(fake, new Set())).toBe(STATUS.BUILT);
  });

  it('honours verified ONLY when the feature name has an evidence entry', () => {
    const f = { name: 'Send Crypto', status: STATUS.VERIFIED };
    expect(resolveStatus(f, new Set(['Send Crypto']))).toBe(STATUS.VERIFIED);
    expect(resolveStatus(f, new Set())).toBe(STATUS.BUILT);
  });

  it('no feature resolves to verified today (evidence ships empty)', () => {
    const names = verifiedFeatureNames();
    const verified = allFeatures.filter((f) => resolveStatus(f, names) === STATUS.VERIFIED);
    expect(verified.map((f) => f.name)).toEqual([]);
  });
});

describe('understatement is corrected — built code is not shown as roadmap', () => {
  it('Risk Scoring is at least built (src/risk/ is present)', () => {
    expect(resolveStatus(byName('Risk Limits / Risk Scoring'))).not.toBe(STATUS.ROADMAP);
  });
  it('Portfolio Dashboard is built (WalletPortfolioPage + portfolioBalances)', () => {
    expect(resolveStatus(byName('Portfolio Dashboard'))).toBe(STATUS.BUILT);
  });
  it('Audit Log is not surfaced in the catalogue (HONEST-DISABLED per deniability decision)', () => {
    // 27ad249 removed Audit Log from every surface: an audit log is "a walletMeta
    // write by another name" and a forensic tell that defeats deniability (I3). The
    // primitive (wallet-core/auditLog.js) stays in code but is intentionally unlisted
    // here — present, not advertised. See docs/audit-log-login-activity-deniability-decision.md.
    expect(byName('Audit Log')).toBeUndefined();
  });
});

describe('no claim upgrade — the old "available" overstatement is gone', () => {
  it('no feature uses the retired two-state "available" string', () => {
    const stale = allFeatures.filter((f) => f.status === 'available');
    expect(stale.map((f) => f.name)).toEqual([]);
  });
});
