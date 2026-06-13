// Validation sweep — DENIABILITY: wallet-count / cardinality tells (D-rules, I3).
//
// CLAUDE.md design principle: "deniability by default (never show wallet count/
// list)". The brief: "Scan the entire rendered DOM for ANY wallet-count string,
// 'N wallets', ... FLAG any hit."
//
// This file follows the codebase's established deniability-test idiom (see
// src/lib/__tests__/portfolioDeniability.test.js and
// src/__tests__/audit-log-honest-disabled.test.js): assert over SOURCE, because
// these pages use React context/hooks and there is no render harness (no RTL in
// devDependencies).
//
// CONVENTION
//   * it.fails(...)  — the body asserts the IDEAL (deniability-clean) state. It
//                      currently THROWS, so Vitest marks the test passed and CI
//                      stays GREEN, but the defect is documented in-gate and the
//                      suite turns RED the moment the tell is removed (prompting
//                      deletion of the .fails marker). This is the "failing test
//                      documents the bug" the brief asks for, without wedging a
//                      required check permanently red.
//   * it(...)        — green guard / characterization of confirmed-correct state.
//
// Reachability was verified: Dashboard.jsx renders WalletPortfolioPage in the
// local (real) build; StealthWallets/OnChainAnalytics/RiskScoring are all routed
// in App.jsx. None of these are demo-only.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// A user-visible wallet-count tell = JSX that interpolates `<something>.length`
// of a wallets array next to the literal word "wallet(s)" or a "Wallets" stat.
const portfolio = read('../../pages/WalletPortfolioPage.jsx');
const stealth = read('../../pages/StealthWallets.jsx');
const onchain = read('../../pages/OnChainAnalytics.jsx');
const risk = read('../../pages/RiskScoring.jsx');

describe('FLAG D1 — the real-build dashboard renders a wallet-count string', () => {
  // WalletPortfolioPage.jsx:519
  //   {pfWallets.length} wallet{pfWallets.length === 1 ? "" : "s"} in this portfolio
  it('CONFIRMED present today (characterization — turns red if the line changes)', () => {
    expect(portfolio).toContain('wallet{pfWallets.length === 1 ? "" : "s"} in this portfolio');
  });

  it.fails('IDEAL: the dashboard renders NO "{n} wallet(s) in this portfolio" count', () => {
    expect(portfolio).not.toMatch(/\{pfWallets\.length\}\s*wallet/);
  });
});

describe('FLAG D2 — StealthWallets surfaces a visible wallet count', () => {
  // StealthWallets.jsx:289 :  Your visible wallets ({evmWallets.length}):
  it('CONFIRMED present today (characterization)', () => {
    expect(stealth).toContain('Your visible wallets ({evmWallets.length})');
  });

  it.fails('IDEAL: no visible "Your visible wallets (N)" count is rendered', () => {
    expect(stealth).not.toMatch(/visible wallets \(\{[^}]*\.length\}\)/);
  });
});

describe('FLAG D3 — analytics surfaces expose wallets.length as a labelled stat', () => {
  // OnChainAnalytics.jsx:78 : { label: "Wallets", value: wallets.length, ... }
  it('OnChainAnalytics CONFIRMED present today (characterization)', () => {
    expect(onchain).toContain('value: wallets.length');
    expect(onchain).toMatch(/label:\s*"Wallets"/);
  });

  // RiskScoring.jsx:55 : { label: "Diversification", value: wallets.length, unit: " wallets" }
  it('RiskScoring CONFIRMED present today (characterization)', () => {
    expect(risk).toContain('value: wallets.length');
    expect(risk).toContain('unit: " wallets"');
  });

  it.fails('IDEAL: analytics stat tiles do NOT publish wallets.length as a count', () => {
    expect(onchain).not.toContain('value: wallets.length');
    expect(risk).not.toContain('value: wallets.length');
  });
});

// Existing guard (src/lib/__tests__/portfolioDeniability.test.js) already proves no
// BALANCE/TOTAL line branches on isDecoy/isHidden. This adds the COUNT-string axis
// the brief calls out, which that guard does not cover.
describe('D-rules context — these counts are the active-context cardinality, not a hidden-set oracle', () => {
  it('canManage (mutation gate) is the ONLY consumer of isDecoy/isHidden on the dashboard', () => {
    // Confirms the count is not *additionally* branched on the decoy flag (which
    // would be a direct D2 tell). The count is still flagged (D1) because the
    // stated principle is "never show wallet count/list".
    expect(portfolio).toContain('const canManage = isUnlocked && !isDecoy && !isHidden');
  });
});
