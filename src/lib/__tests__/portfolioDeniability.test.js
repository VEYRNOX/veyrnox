// src/lib/__tests__/portfolioDeniability.test.js
//
// Source-scanning guards for the portfolio view (reconciliation brief, Findings
// 3 & persistence guardrail). No rendering harness is used (the codebase has no
// @testing-library); mirroring routeAudit.test.js / usdDisclosure.test.js, these
// assert structural properties of the page + aggregation source directly.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf8');

// Strip comments so prose that mentions isDecoy/localStorage (the deniability
// rationale lives in comments) does not trip the scans — only real code counts.
const stripComments = (src) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '') // JSX block comments
    .replace(/\/\*[\s\S]*?\*\//g, '')     // /* */ comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1');  // // line comments (not URLs)

const pageSrc = read('../../pages/WalletPortfolioPage.jsx');
const pageCode = stripComments(pageSrc);
const aggSrc = read('../portfolioBalances.js');

describe('Finding 3 — decoy and real sessions render identically', () => {
  it('the incompleteness marker is driven by the aggregation data, not a session flag', () => {
    // The fail-closed marker must exist and be derived from the portfolio data.
    expect(pageCode).toMatch(/sumPortfolioTotal/);
    expect(pageCode).toMatch(/pfIncomplete/);
  });

  it('no display/total line branches on the raw decoy/hidden flags', () => {
    // isDecoy/isHidden may gate MUTATIONS (canManage) but must never appear on a
    // line that computes or renders a balance/total — that would let the decoy
    // and real views diverge and signal which session is active.
    const decoyFlag = /\b(isDecoy|isHidden)\b/;
    const displayToken = /\b(pfTotal|pfIncomplete|formatFiat|grandTotal|indeterminate|\.total)\b/;
    const offenders = pageCode
      .split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => decoyFlag.test(line) && displayToken.test(line));
    expect(
      offenders.map((o) => `L${o.n}: ${o.line.trim()}`),
      'a balance/total line branches on isDecoy/isHidden — decoy and real views must be byte-identical',
    ).toEqual([]);
  });

  it('isDecoy/isHidden are consumed only by the mutation gate (canManage)', () => {
    // An expression-USE of the flags (a `!`, `?`, `&&` or `||` alongside the
    // flag) must be the canManage definition and nothing else. The bare
    // destructure declaration (`...isDecoy, isHidden,`) carries no operator and
    // is correctly excluded.
    const uses = pageCode
      .split('\n')
      .filter((l) => /\b(isDecoy|isHidden)\b/.test(l) && /[!?]|&&|\|\|/.test(l));
    expect(uses.length, 'sentinel: the canManage mutation gate should exist').toBeGreaterThan(0);
    const nonGate = uses.filter((l) => !/canManage/.test(l));
    expect(nonGate, 'isDecoy/isHidden used in an expression outside the canManage mutation gate').toEqual([]);
  });
});

describe('persistence guardrail — the portfolio path writes nothing to disk', () => {
  const WRITE_TOKENS = /\b(localStorage|sessionStorage|setItem|indexedDB|\.persist\(|snapshot\()/;
  it('portfolioBalances.js performs no disk writes', () => {
    expect(WRITE_TOKENS.test(stripComments(aggSrc))).toBe(false);
  });
  it('WalletPortfolioPage.jsx performs no disk writes', () => {
    expect(WRITE_TOKENS.test(pageCode)).toBe(false);
  });
});
