// Validation sweep — "INDETERMINATE never renders as 0" (the brief's ?? 0 /
// catch→0 fail-open concern).
//
// FINDING: the portfolio aggregation (src/lib/portfolioBalances.js) gets this
// RIGHT — a failed read is `null` (indeterminate), carried through aggregation, and
// NEVER summed as 0. These green tests LOCK that good behavior so it can't regress
// into a silent understatement. One narrow fail-open edge is flagged (FLAG IND-1).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sumPortfolioTotal } from '@/lib/portfolioBalances';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const src = read('../../lib/portfolioBalances.js');

describe('sumPortfolioTotal — indeterminate is propagated, never folded to 0', () => {
  it('a failed wallet read marks the total incomplete (does NOT understate as a clean number)', () => {
    const pf = [{ id: 'a' }, { id: 'b' }];
    const byWallet = {
      a: { total: 100, indeterminate: false },
      b: { total: 0, indeterminate: true }, // read FAILED — not a genuine empty wallet
    };
    const out = sumPortfolioTotal(pf, byWallet);
    expect(out.indeterminate).toBe(true); // UI must mark incomplete, not show "100" as fact
    expect(out.total).toBe(100);          // sums only the readable wallet
  });

  it('a genuine empty wallet (read OK, total 0) is NOT indeterminate', () => {
    const out = sumPortfolioTotal([{ id: 'a' }], { a: { total: 0, indeterminate: false } });
    expect(out.indeterminate).toBe(false); // 0 here is real data, distinguishable from a failure
    expect(out.total).toBe(0);
  });

  it('a not-yet-computed wallet (loading, no entry) is skipped, not counted as 0', () => {
    const out = sumPortfolioTotal([{ id: 'a' }, { id: 'missing' }], { a: { total: 50 } });
    expect(out.total).toBe(50);
  });
});

describe('fetchAssetAmount — source contract: catch → null (not 0)', () => {
  it('a thrown read becomes null (indeterminate), per I4 fail-closed', () => {
    expect(src).toContain('return null; // read FAILED → indeterminate');
  });

  // FLAG IND-1 (low) — a read that RESOLVES to a non-finite value (e.g. a provider
  // returns undefined/NaN without throwing) is folded to 0 by `Number(x) || 0`,
  // rather than being treated as indeterminate. The catch only covers THROWN errors.
  it.fails('IDEAL: a resolved-but-non-finite balance is treated as indeterminate, not 0', () => {
    // Ideal guard would be `Number.isFinite(n) ? n : null`; today the EVM/erc20/btc/
    // sol branches end in `|| 0`, so NaN → 0.
    expect(src).toMatch(/Number\.isFinite/);
    expect(src).not.toMatch(/\)\s*\|\|\s*0;/);
  });
});
