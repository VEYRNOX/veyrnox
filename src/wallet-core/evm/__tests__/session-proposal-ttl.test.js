// audit-H9: unit tests for the proposal TTL computation.
//
// _pendingProposals was previously unbounded — entries were only removed on
// approve/reject. A dApp that sends proposals and never waits for a response
// (or a user who dismisses the modal without pressing Reject) could fill the
// map indefinitely. Stale proposal IDs could also trigger a later approveSession
// race if the user somehow reuses them.
//
// The fix schedules a per-proposal TTL timer driven by the proposal's own
// params.expiry (Unix seconds). computeProposalTtlMs is the pure function
// that drives the timer — tested here in isolation.
import { describe, it, expect } from 'vitest';
import { computeProposalTtlMs, DEFAULT_PROPOSAL_TTL_MS } from '../walletconnect/session.js';

const NOW_MS = 1_700_000_000_000; // fixed "now" for deterministic tests

describe('computeProposalTtlMs — H9 proposal TTL eviction', () => {
  it('returns DEFAULT_PROPOSAL_TTL_MS when expiry is absent (undefined)', () => {
    expect(computeProposalTtlMs(undefined, NOW_MS)).toBe(DEFAULT_PROPOSAL_TTL_MS);
  });

  it('returns DEFAULT_PROPOSAL_TTL_MS when expiry is null', () => {
    expect(computeProposalTtlMs(null, NOW_MS)).toBe(DEFAULT_PROPOSAL_TTL_MS);
  });

  it('returns DEFAULT_PROPOSAL_TTL_MS when expiry is 0 (falsy)', () => {
    expect(computeProposalTtlMs(0, NOW_MS)).toBe(DEFAULT_PROPOSAL_TTL_MS);
  });

  it('returns the remaining ms when expiry is in the future', () => {
    const expiryMs = NOW_MS + 90_000; // 90 s from now
    const expiryEpochSeconds = expiryMs / 1000;
    expect(computeProposalTtlMs(expiryEpochSeconds, NOW_MS)).toBe(90_000);
  });

  it('clamps to 0 when expiry has already passed (never returns negative)', () => {
    const expiryEpochSeconds = (NOW_MS - 5_000) / 1000; // 5 s ago
    expect(computeProposalTtlMs(expiryEpochSeconds, NOW_MS)).toBe(0);
  });

  it('clamps to 0 exactly at expiry boundary', () => {
    const expiryEpochSeconds = NOW_MS / 1000; // exactly now
    expect(computeProposalTtlMs(expiryEpochSeconds, NOW_MS)).toBe(0);
  });

  it('DEFAULT_PROPOSAL_TTL_MS is 5 minutes', () => {
    expect(DEFAULT_PROPOSAL_TTL_MS).toBe(5 * 60 * 1000);
  });
});
