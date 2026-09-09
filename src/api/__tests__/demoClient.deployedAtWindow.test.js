// Regression: the demo's scam-airdrop tokens must keep firing the
// `new_contract` risk issue.
//
// `evaluateTokenContractRisk` (src/lib/suspiciousAssets.js) emits that issue
// only when `deployed_at` falls inside a rolling CONTRACT_REVIEW_WINDOW_DAYS
// window measured against `Date.now()`. The demo seeds originally carried
// literal dates (`iso("2026-08-09")` etc.); by 2026-09-09 every one of them had
// aged past the window, so demo mode's suspicious-asset cards silently stopped
// showing "Contract appears newly deployed within the last 30 days" — no error,
// no failing test, just a quietly weaker risk story.
//
// This is app behaviour, not test scaffolding: the sibling fix in PR #2465
// covered only the hardcoded fixture inside suspiciousAssets.test.js.
//
// The pin is behavioural rather than a source grep on purpose. A grep for
// `iso("20` would match the comment in demoClient.js that records the removed
// literals (CLAUDE.md: an absence-check must not fire on its own
// documentation), and it would not catch a relative date whose offset was
// widened past 30 days.

import { describe, it, expect, vi, afterEach } from 'vitest';

import { evaluateTokenContractRisk } from '@/lib/suspiciousAssets';

// SEEDS are evaluated at module load, so a fresh import is what re-reads the
// clock. That is precisely what separates a relative offset from a literal.
async function airdropTokens() {
  vi.resetModules();
  const { demoBase44 } = await import('@/api/demoClient');
  const rows = await demoBase44.entities.WalletToken.list();
  return rows.filter((t) => t.acquired_via === 'airdrop');
}

function expectAllFlagNewContract(tokens) {
  // Guards against the list being emptied or renamed out from under the pin.
  expect(tokens.length).toBeGreaterThanOrEqual(6);
  for (const token of tokens) {
    const kinds = evaluateTokenContractRisk(token).issues.map((i) => i.kind);
    expect(kinds, `token ${token.id} (${token.symbol}) lost new_contract`).toContain('new_contract');
  }
}

describe('demo airdrop seeds stay inside the contract-review window', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('every airdropped demo token emits the new_contract issue', async () => {
    expectAllFlagNewContract(await airdropTokens());
  });

  it('still does so a year from now — the seeds are relative, not calendar dates', async () => {
    // The first case alone would pass on the day a literal date was written and
    // for the ~30 days after it, so on its own it is a time bomb rather than a
    // pin. Loading the seeds under a far-future clock is what actually
    // discriminates: a relative offset moves with `Date.now()`, a baked-in
    // literal does not and drops straight out of the review window.
    vi.useFakeTimers({ now: Date.now() + 365 * 86_400_000 });
    expectAllFlagNewContract(await airdropTokens());
  });
});
