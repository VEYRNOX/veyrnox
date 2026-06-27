// H9 — pending WalletConnect proposals must be TTL-evicted so a dismissed
// (never-rejected) proposal cannot pile up unbounded or trigger a stale
// approveSession race. Asserts structural behaviour, not copy.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// The module reads import.meta.env at load — give it a project id so the client
// path is exercisable, but we never hit a real relay (we inject the client).
vi.stubEnv('VITE_WALLETCONNECT_PROJECT_ID', 'test-project-id');

import {
  PROPOSAL_TTL_MS,
  __setProposalClock,
  __injectPendingProposal,
  __setTestClient,
  getPendingProposalIds,
  cleanupExpiredProposals,
} from '../walletconnect/session.js';

describe('H9 — pending proposal TTL eviction', () => {
  let now;
  let rejected;

  beforeEach(() => {
    rejected = [];
    now = 1_000_000;
    __setProposalClock(() => now);
    __setTestClient({
      rejectSession: vi.fn(async ({ id }) => { rejected.push(id); }),
    });
    // start from a clean map
    for (const id of getPendingProposalIds()) {
      // eslint-disable-next-line no-unused-vars
    }
  });

  it('evicts a proposal inserted more than TTL ms ago', async () => {
    __injectPendingProposal({ id: 42, params: {} });
    expect(getPendingProposalIds()).toContain(42);

    now += PROPOSAL_TTL_MS + 1;
    await cleanupExpiredProposals();

    expect(getPendingProposalIds()).not.toContain(42);
  });

  it('keeps a proposal still inside the TTL window', async () => {
    __injectPendingProposal({ id: 7, params: {} });

    now += PROPOSAL_TTL_MS - 1;
    await cleanupExpiredProposals();

    expect(getPendingProposalIds()).toContain(7);
  });

  it('calls rejectSession on the client for each evicted proposal', async () => {
    __injectPendingProposal({ id: 99, params: {} });

    now += PROPOSAL_TTL_MS + 1;
    await cleanupExpiredProposals();

    expect(rejected).toContain(99);
  });
});
