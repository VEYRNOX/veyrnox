// audit-L6: regression tests for the proposal expiry timer wiring.
//
// _scheduleProposalExpiry was defined but never called — a proposal that the
// user dismissed without pressing Reject sat in _pendingProposals forever
// unless a NEW proposal arrived to trigger the lazy cleanupExpiredProposals
// sweep. The fix arms a per-proposal timer inside _storeProposal and clears
// it on approveSession / rejectSession / destroyWalletConnect.
//
// These tests exercise the wiring without a real WalletKit client: we drive
// _storeProposal via the __injectPendingProposal test seam and observe the
// visible side effect (proposal id removed after the timer fires).
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  __injectPendingProposal,
  getPendingProposalIds,
  destroyWalletConnect,
  DEFAULT_PROPOSAL_TTL_MS,
} from '../walletconnect/session.js';

function makeProposal(id, expiryEpochSeconds) {
  return {
    id,
    params: expiryEpochSeconds == null ? {} : { expiryTimestamp: expiryEpochSeconds },
  };
}

afterEach(async () => {
  vi.useRealTimers();
  await destroyWalletConnect();
});

describe('_storeProposal arms _scheduleProposalExpiry (audit-L6)', () => {
  it('evicts a proposal after DEFAULT_PROPOSAL_TTL_MS when no expiry is provided', () => {
    vi.useFakeTimers();
    __injectPendingProposal(makeProposal(1));
    expect(getPendingProposalIds()).toContain(1);

    vi.advanceTimersByTime(DEFAULT_PROPOSAL_TTL_MS - 1);
    expect(getPendingProposalIds()).toContain(1);

    vi.advanceTimersByTime(1);
    expect(getPendingProposalIds()).not.toContain(1);
  });

  it('respects the proposals own expiryTimestamp (Unix seconds)', () => {
    vi.useFakeTimers();
    const now = Date.now();
    const expiryEpochSeconds = (now + 30_000) / 1000; // 30 s from now
    __injectPendingProposal(makeProposal(2, expiryEpochSeconds));
    expect(getPendingProposalIds()).toContain(2);

    vi.advanceTimersByTime(29_999);
    expect(getPendingProposalIds()).toContain(2);

    vi.advanceTimersByTime(1);
    expect(getPendingProposalIds()).not.toContain(2);
  });

  it('destroyWalletConnect clears armed timers so they do not fire after teardown', async () => {
    vi.useFakeTimers();
    __injectPendingProposal(makeProposal(3));
    await destroyWalletConnect();
    // After destroy the map is empty; advancing time must not throw or leak.
    vi.advanceTimersByTime(DEFAULT_PROPOSAL_TTL_MS + 1);
    expect(getPendingProposalIds()).toEqual([]);
  });

  it('a second inject for the same id replaces the prior timer (no double eviction leak)', () => {
    vi.useFakeTimers();
    __injectPendingProposal(makeProposal(4));
    vi.advanceTimersByTime(DEFAULT_PROPOSAL_TTL_MS - 100);
    // Re-inject: this should clear the previous timer and start a fresh one.
    __injectPendingProposal(makeProposal(4));
    vi.advanceTimersByTime(200); // would fire the OLD timer if not cleared
    expect(getPendingProposalIds()).toContain(4);

    vi.advanceTimersByTime(DEFAULT_PROPOSAL_TTL_MS);
    expect(getPendingProposalIds()).not.toContain(4);
  });
});
