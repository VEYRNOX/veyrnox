import { describe, expect, it } from 'vitest';

import { demoBase44 } from '@/api/demoClient';
import { evaluateTokenContractRisk } from '@/lib/suspiciousAssets';

// Pins the demo seed data against the failure that PR #2462 hit in the unit
// tests: `deployed_at` written as an absolute date, checked by
// isRecentDeployment() against Date.now() with a 30-day window. Such a fixture
// works the day it is written and silently stops producing the `new_contract`
// issue thirty days later — no test goes red, the demo just quietly drops one of
// the warnings it exists to demonstrate. tok8 and tok3 had already lapsed by
// 2026-09-09 before the fixtures were made relative.
describe('demo WalletToken deployed_at fixtures', () => {
  it('every seeded deployed_at still yields the new_contract issue', async () => {
    const tokens = await demoBase44.entities.WalletToken.list();
    const dated = tokens.filter((token) => token.deployed_at);

    // Guards the guard: if the seeds ever lose deployed_at entirely, the
    // per-token loop below would vacuously pass.
    expect(dated.length).toBeGreaterThanOrEqual(6);

    for (const token of dated) {
      const kinds = evaluateTokenContractRisk(token).issues.map((issue) => issue.kind);
      expect(kinds, `${token.id} (deployed_at ${token.deployed_at}) aged out of the review window`)
        .toContain('new_contract');
    }
  });
});
