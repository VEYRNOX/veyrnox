import { describe, expect, it, vi, afterEach } from 'vitest';

import { demoBase44 } from '@/api/demoClient';
import { evaluateTokenContractRisk } from '@/lib/suspiciousAssets';

// Pins the demo seed data against the failure that PR #2462 hit in the unit
// tests: `deployed_at` written as an absolute date, checked by
// isRecentDeployment() against Date.now() with a 30-day window. Such a fixture
// works the day it is written and silently stops producing the `new_contract`
// issue thirty days later — no test goes red, the demo just quietly drops one of
// the warnings it exists to demonstrate. tok8 and tok3 had already lapsed by
// 2026-09-09 before the fixtures were made relative.

function expectAllFlagNewContract(tokens) {
  const dated = tokens.filter((token) => token.deployed_at);

  // Guards the guard: if the seeds ever lose deployed_at entirely, the
  // per-token loop below would vacuously pass.
  expect(dated.length).toBeGreaterThanOrEqual(6);

  for (const token of dated) {
    const kinds = evaluateTokenContractRisk(token).issues.map((issue) => issue.kind);
    expect(kinds, `${token.id} (deployed_at ${token.deployed_at}) aged out of the review window`)
      .toContain('new_contract');
  }
}

describe('demo WalletToken deployed_at fixtures', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('every seeded deployed_at still yields the new_contract issue', async () => {
    expectAllFlagNewContract(await demoBase44.entities.WalletToken.list());
  });

  it('still does so a year from now — the seeds are relative, not calendar dates', async () => {
    // The case above cannot tell a relative offset from a literal. A literal
    // reintroduced today sits inside the 30-day window and passes it for about
    // a month before detonating, so on its own that case is a time bomb rather
    // than a pin — verified by reverting tok9 to `iso("2026-08-18")` on
    // 2026-09-09, which it passed.
    //
    // Loading the seeds under a far-future clock is what actually
    // discriminates. SEEDS are built at module load, so a fresh import is what
    // re-reads `Date.now()`: a relative offset moves with it, a baked-in
    // literal does not and drops straight out of the review window.
    vi.useFakeTimers({ now: Date.now() + 365 * 86_400_000 });
    vi.resetModules();
    const { demoBase44: freshDemoBase44 } = await import('@/api/demoClient');
    expectAllFlagNewContract(await freshDemoBase44.entities.WalletToken.list());
  });
});
