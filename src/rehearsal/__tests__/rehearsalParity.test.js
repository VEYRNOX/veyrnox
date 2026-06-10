// src/rehearsal/__tests__/rehearsalParity.test.js
//
// Build brief §6 (component-parity) + §2/§7 (no rehearsal-only chrome). Source-
// scanning guards (no @testing-library), mirroring portfolioDeniability.test.js:
//   • RehearsalView must render the PRODUCTION dashboard, not a fork — otherwise
//     it verifies a mock, not the real decoy (LLD decision #3).
//   • No rehearsal-only chrome: no "this is your real/decoy wallet" framing, no
//     "N sets" count, no credential-type label. The whole point is that the
//     rehearsal surface is byte-identical to the live one.
//   • The Settings entry row reads as ordinary ("Rehearse deniability") with no
//     count or multi-set hint (§7).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { componentParity } from '../assert.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf8');
const stripComments = (src) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const viewSrc = read('../RehearsalView.jsx');
const viewCode = stripComments(viewSrc);
const rowSrc = read('../RehearsalSettingsRow.jsx');
const rowCode = stripComments(rowSrc);

describe('RehearsalView — renders the production dashboard (component parity, D2)', () => {
  it('passes componentParity against its own source', () => {
    expect(componentParity(viewSrc)).toMatchObject({ pass: true, rule: 'D2' });
  });

  it('imports no forked / mock dashboard renderer', () => {
    expect(viewCode).not.toMatch(/\b(RehearsalDashboard|MockDashboard|ForkedPortfolio|FakePortfolio)\b/);
  });

  it('runs the deniability checks (never a silent pass)', () => {
    expect(viewCode).toMatch(/runDeniabilityChecks/);
  });
});

describe('no rehearsal-only chrome (brief §2 hard exclusion)', () => {
  it('the view carries no "real vs decoy" framing or set-count label', () => {
    const offenders = [/this is (your |the )?(real|decoy)/i, /\breal wallet\b/i, /\bdecoy session\b/i, /\bN sets\b/i, /number of (wallets|sets)/i]
      .filter((re) => re.test(viewCode));
    expect(offenders.map(String)).toEqual([]);
  });

  it('the view discloses no credential type (D4)', () => {
    expect(viewCode).not.toMatch(/\b(via (PIN|biometric|passkey|duress)|how you unlocked|unlock method)\b/i);
  });
});

describe('Settings entry row reads as ordinary (brief §7)', () => {
  it('uses the plain "Rehearse deniability" label', () => {
    expect(rowCode).toMatch(/Rehearse deniability/);
  });

  it('exposes no wallet/set count or multi-set hint', () => {
    expect(rowCode).not.toMatch(/\d+\s*(wallet|set)s\b/i);
    expect(rowCode).not.toMatch(/number of (wallets|sets)|how many/i);
  });
});
