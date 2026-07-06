// audit-label-reconciliation.test.js — ECC audit finding L-5 follow-up.
//
// The ECC independent third-party audit (2026-06-23,
// docs/audit-triage/ecc-independent-audit-2026-06-23.md, findings fixed PR #340)
// covered the eight formerly-UNAUDITED-PROVISIONAL features. L-5 flagged that the
// catalogue and the audit record had no machine-readable cross-link, so labels
// drifted: pages kept claiming "unaudited" after the audit completed.
//
// This suite is that cross-link. It pins BOTH directions of the honesty bar:
//   (a) features the ECC audit covered may no longer claim "unaudited";
//   (b) features it did NOT cover (hardware KEK — internal passes only) MUST
//       keep their UNAUDITED label ("internal" is never "independent", I4).
// If a future audit changes either set, update this file alongside the labels.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { FEATURE_CATEGORIES } from '../lib/featureCatalogue.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const read = (rel) => readFileSync(resolve(repoRoot, rel), 'utf8');

const allFeatures = FEATURE_CATEGORIES.flatMap((c) => c.features);
const byName = (name) => allFeatures.find((f) => f.name === name);

// The eight features named in the ECC audit's scope line, as they appear in the
// catalogue. (Notifications v1 and Risk Scoring were also covered; Risk Scoring's
// catalogue entry is asserted below, Notifications has no catalogue entry.)
const ECC_AUDITED_CATALOGUE_FEATURES = [
  'PIN Unlock',
  'Two-Factor at Critical Actions',
  'Duress PIN',
  'Panic Wipe',
  'Encrypted Personal Backup',
  'RASP',
  'Audit Log',
  'Fee Analytics',
  'Risk Limits / Risk Scoring',
];

describe('L-5 — catalogue entries for ECC-audited features cite the audit', () => {
  for (const name of ECC_AUDITED_CATALOGUE_FEATURES) {
    it(`"${name}" references the 2026-06-23 independent audit`, () => {
      const feature = byName(name);
      expect(feature, `catalogue entry "${name}" not found`).toBeTruthy();
      expect(feature.explanation).toMatch(/2026-06-23/);
      // Audited is not verified: the audit alone must never appear as "verified".
      // (Two-Factor is 'verified' via its own on-chain txid evidence, not the audit.)
      if (feature.status === 'verified') {
        expect(feature.verifiedBy || feature.name).toBeTruthy();
      }
    });
  }
});

describe('L-5 — user-facing pages no longer claim "unaudited" (audit complete)', () => {
  const PAGES = [
    'src/pages/LandingPage.jsx',
    'src/pages/TermsLegal.jsx',
    'src/pages/RaspSecurity.jsx',
    'src/pages/AuditLog.jsx',
    'src/pages/LoginActivity.jsx',
    'src/pages/DuressPin.jsx',
  ];
  for (const rel of PAGES) {
    it(`${rel} contains no "unaudited" claim`, () => {
      expect(read(rel)).not.toMatch(/unaudited/i);
    });
  }
});

describe('L-5 — audited components dropped the stale UNAUDITED-PROVISIONAL tag', () => {
  const COMPONENTS = [
    'src/components/WalletEntry.jsx',
    'src/components/RiskVerdictBanner.jsx',
    'src/components/security/TwoFactorGate.jsx',
    'src/components/security/TwoFactorSettings.jsx',
    'src/components/security/useActionGuard.jsx',
    'src/notify/useNotifications.jsx',
    'src/components/NotificationBell.jsx',
    'src/components/NotificationToast.jsx',
    'src/risk/index.js',
    'src/risk/score.js',
    'src/sign-gate/presign.js',
    'src/sign-gate/compose.js',
    'src/rasp/browserProbe.js',
    'src/lib/twoFactorGate.js',
    'src/lib/featureClassification.js',
  ];
  for (const rel of COMPONENTS) {
    it(`${rel} no longer says UNAUDITED-PROVISIONAL`, () => {
      // read() throws on a missing file — a moved file must fail loudly here,
      // not silently drop out of the guard.
      expect(read(rel)).not.toMatch(/UNAUDITED-PROVISIONAL/);
    });
  }
});

describe('I4 — internal-only-audited surfaces MUST keep their UNAUDITED label', () => {
  it('catalogue "Native Secure Storage" still discloses it is NOT independently audited', () => {
    const kek = byName('Native Secure Storage');
    expect(kek).toBeTruthy();
    expect(kek.summary + kek.explanation).toMatch(/NOT (an )?independent/i);
    expect(kek.summary).toMatch(/UNAUDITED/);
  });
});
