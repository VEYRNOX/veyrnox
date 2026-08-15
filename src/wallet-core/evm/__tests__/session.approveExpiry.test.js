// Codex P2 2026-08-15: approveSession() only ran the 5-min insertedAt sweep
// and never checked the proposal's own expiryTimestamp. A backgrounded app or
// delayed timer could let a proposal that WalletConnect already considers
// expired reach client.approveSession. Pin: an expired expiryTimestamp on an
// otherwise-fresh entry now short-circuits with the "expired" error and never
// touches the SDK.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.stubEnv('VITE_WALLETCONNECT_PROJECT_ID', 'test-project-id');

import {
  approveSession,
  __setTestClient,
  __setProposalClock,
  __injectPendingProposal,
} from '../walletconnect/session.js';

describe('approveSession — proposal expiryTimestamp gate (Codex P2 2026-08-15)', () => {
  let approveSpy;
  let now;

  beforeEach(() => {
    now = 1_700_000_000_000; // ms
    __setProposalClock(() => now);
    approveSpy = vi.fn(async () => {});
    __setTestClient({
      approveSession: approveSpy,
      rejectSession: vi.fn(async () => {}),
    });
  });

  it('throws expired and never calls client.approveSession when expiryTimestamp has passed', async () => {
    __injectPendingProposal({
      id: 601,
      params: {
        expiryTimestamp: Math.floor(now / 1000) - 10, // 10s in the past
        proposer: { metadata: { url: 'https://app.uniswap.org' } },
        requiredNamespaces: {},
        optionalNamespaces: {},
      },
    });

    await expect(
      approveSession(601, '0xabc0000000000000000000000000000000000abc', [11155111]),
    ).rejects.toThrow(/expired/i);

    expect(approveSpy).not.toHaveBeenCalled();
  });

  it('proceeds when expiryTimestamp is still in the future', async () => {
    __injectPendingProposal({
      id: 602,
      params: {
        expiryTimestamp: Math.floor(now / 1000) + 300, // 5 min in the future
        proposer: { metadata: { url: 'https://app.uniswap.org' } },
        requiredNamespaces: {},
        optionalNamespaces: {},
      },
    });

    await approveSession(602, '0xabc0000000000000000000000000000000000abc', [11155111]);
    expect(approveSpy).toHaveBeenCalledTimes(1);
  });
});
