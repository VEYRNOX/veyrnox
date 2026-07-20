// Validation sweep — "INDETERMINATE never renders as 0" (the brief's ?? 0 /
// catch→0 fail-open concern).
//
// FINDING: the portfolio aggregation (src/lib/portfolioBalances.js) gets this
// RIGHT — a failed read is `null` (indeterminate), carried through aggregation, and
// NEVER summed as 0. These green tests LOCK that good behavior so it can't regress
// into a silent understatement. One narrow fail-open edge is flagged (FLAG IND-1).

import { describe, it, expect, vi } from 'vitest';
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

  // FLAG IND-1 (FIXED) — a read that RESOLVES to a non-finite value (a provider
  // returning undefined/NaN without throwing) must be treated as indeterminate, not
  // folded to a confident 0. Previously `Number(undefined) || 0` → 0, so an unknown
  // balance rendered as $0 — which for a wallet reads as "your funds are gone".
  // Now guarded by `finite(n) = Number.isFinite(n) ? n : null`.
  it('source: the fetch branches guard non-finite reads via Number.isFinite, not `|| 0`', () => {
    expect(src).toMatch(/Number\.isFinite/);
    // The four provider reads must no longer end in `|| 0` (which folds NaN to 0).
    // (The aggregation `entry.total || 0` in sumPortfolioTotal is a separate, correct
    // guard on already-classified data and is intentionally not matched here.)
    expect(src).not.toMatch(/await getBalance\w+\([^)]*\)\)\s*\|\|\s*0/);
    expect(src).not.toMatch(/formatUnits\([^)]*\)\)\s*\|\|\s*0/);
  });

  it('behaviour: a provider that resolves to a non-finite value yields null (indeterminate)', async () => {
    // Prove the actual return contract, not just the source shape. A provider that
    // resolves undefined/NaN without throwing must produce null so callers
    // (byWallet[...].indeterminate = amount === null) mark the total incomplete.
    // Mock ONLY getBalanceEth; every other import stays real (importOriginal).
    vi.resetModules();
    vi.doMock('@/wallet-core/evm/provider.js', async (importOriginal) => ({
      ...(await importOriginal()),
      getBalanceEth: async () => undefined,   // resolves, does NOT throw
    }));
    const mod = await import('@/lib/portfolioBalances');
    const amount = await mod.fetchAssetAmount(
      { family: 'evm', chain: 'ethereum', symbol: 'ETH' },
      { evm: '0x0000000000000000000000000000000000000001' },
    );
    vi.doUnmock('@/wallet-core/evm/provider.js');
    expect(amount).toBeNull(); // indeterminate — NOT 0
  });
});
