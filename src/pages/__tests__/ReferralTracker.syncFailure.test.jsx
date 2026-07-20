// K-2 regression: ReferralTracker.syncCount must distinguish "no data" from "a real zero".
//
// fetchStatus / fetchPaidCount / fetchEarnings each return `null` on THREE distinct
// conditions (supabase unconfigured, isDeniabilityOrDemoActive() true, any thrown
// error). Coercing null -> 0 and calling applyRedemption(0, 0) unconditionally
// clobbers the user's cached tier/count in the shared `veyrnox-referral`
// localStorage key AND presents the wipe as a successful sync ("Last synced …").
//
// Two harms:
//  1. A network blip permanently wipes real state and reports success (I4).
//  2. Opening the page in a decoy/demo session mutates REAL persisted state (I3).
//
// The on-screen failure message MUST be identical for the network-down and the
// deniability cases — a distinct message would be a deniability tell.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/api/referralApi', () => ({
  registerCode: vi.fn(async () => {}),
  redeemCode: vi.fn(async () => ({ newCount: 0 })),
  fetchStatus: vi.fn(async () => null),
  fetchPaidCount: vi.fn(async () => null),
  fetchEarnings: vi.fn(async () => null),
}));

const STORAGE_KEY = 'veyrnox-referral';

/** State a real Gold-tier influencer would have cached locally. */
const SEEDED = {
  code: 'VYX-ABC234',
  inviteCount: 11500,
  paidCount: 1480,
  tier: 'gold',
  commission: 10,
  externalEligible: true,
  unlockedFeatures: ['portfolio-snapshots'],
};

function seedRealState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(SEEDED));
}

function readState() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
}

/** The single generic failure sentence — same for network-down and deniability. */
// Apostrophe-agnostic (the component uses a typographic &rsquo;).
const FAILURE_RE = /couldn[’']t reach the referral service/i;

let api;

beforeEach(async () => {
  localStorage.clear();
  vi.clearAllMocks();
  api = await import('@/api/referralApi');
});

afterEach(() => {
  cleanup();
});

async function renderPage() {
  const { default: ReferralTracker } = await import('../ReferralTracker.jsx');
  return render(<ReferralTracker />);
}

describe('K-2 — ReferralTracker sync must not treat null as zero', () => {
  it('both tier reads null: does not clobber persisted state, shows no "Last synced"', async () => {
    seedRealState();
    api.fetchStatus.mockResolvedValue(null);
    api.fetchPaidCount.mockResolvedValue(null);
    api.fetchEarnings.mockResolvedValue(null);

    await renderPage();
    await waitFor(() => expect(api.fetchPaidCount).toHaveBeenCalled());
    await screen.findByText(FAILURE_RE);

    // Persisted state untouched.
    expect(readState()).toMatchObject({
      inviteCount: 11500,
      paidCount: 1480,
      tier: 'gold',
      commission: 10,
      externalEligible: true,
    });
    // No false "successful sync" affordance.
    expect(screen.queryByText(/last synced/i)).toBeNull();
  });

  it('deniability/demo session (guards return null): persisted state is not mutated', async () => {
    seedRealState();
    const before = localStorage.getItem(STORAGE_KEY);
    // The I3 guard inside referralApi returns null for every read.
    api.fetchStatus.mockResolvedValue(null);
    api.fetchPaidCount.mockResolvedValue(null);
    api.fetchEarnings.mockResolvedValue(null);

    await renderPage();
    await waitFor(() => expect(api.fetchPaidCount).toHaveBeenCalled());
    await screen.findByText(FAILURE_RE);

    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it('failure wording is identical for a REJECTED read and a null read (no I3 tell)', async () => {
    // A genuinely REJECTED promise (not a null resolve). syncCount has no
    // try/catch, so without one this rejection escapes the effect and the
    // component is stuck on "Syncing…" forever.
    seedRealState();
    api.fetchStatus.mockRejectedValue(new Error('network'));
    api.fetchPaidCount.mockResolvedValue(null);
    api.fetchEarnings.mockResolvedValue(null);
    await renderPage();
    const rejectedText = (await screen.findByText(FAILURE_RE)).textContent;
    expect(screen.queryByText(/syncing/i)).toBeNull();
    // A rejection must not clobber the cached state either.
    expect(readState()).toMatchObject({ inviteCount: 11500, paidCount: 1480, tier: 'gold' });
    cleanup();

    localStorage.clear();
    seedRealState();
    api.fetchStatus.mockResolvedValue(null);
    api.fetchPaidCount.mockResolvedValue(null);
    await renderPage();
    const nullText = (await screen.findByText(FAILURE_RE)).textContent;

    expect(nullText).toBe(rejectedText);
    // And it must not name the cause.
    expect(nullText).not.toMatch(/decoy|demo|hidden|deniab|offline|network|supabase/i);
  });

  it('a rejection from ANY of the three reads lands in the same fail-closed state', async () => {
    for (const failing of ['fetchStatus', 'fetchPaidCount', 'fetchEarnings']) {
      localStorage.clear();
      seedRealState();
      api.fetchStatus.mockResolvedValue({ count: 12000 });
      api.fetchPaidCount.mockResolvedValue(1500);
      api.fetchEarnings.mockResolvedValue([]);
      api[failing].mockRejectedValue(new Error('boom'));

      await renderPage();
      await screen.findByText(FAILURE_RE);
      expect(screen.queryByText(/last synced/i)).toBeNull();
      expect(readState()).toMatchObject({ inviteCount: 11500, paidCount: 1480, tier: 'gold' });
      cleanup();
    }
  });

  it('partial null (status ok, paid null) fails closed: no mutation, failure shown', async () => {
    seedRealState();
    api.fetchStatus.mockResolvedValue({ count: 12000 });
    api.fetchPaidCount.mockResolvedValue(null);
    api.fetchEarnings.mockResolvedValue(null);

    await renderPage();
    await waitFor(() => expect(api.fetchPaidCount).toHaveBeenCalled());
    await screen.findByText(FAILURE_RE);

    expect(readState()).toMatchObject({ inviteCount: 11500, paidCount: 1480, tier: 'gold' });
    expect(screen.queryByText(/last synced/i)).toBeNull();
  });

  it('partial null (status null, paid ok) fails closed: no mutation, failure shown', async () => {
    seedRealState();
    api.fetchStatus.mockResolvedValue(null);
    api.fetchPaidCount.mockResolvedValue(1500);
    api.fetchEarnings.mockResolvedValue(null);

    await renderPage();
    await waitFor(() => expect(api.fetchPaidCount).toHaveBeenCalled());
    await screen.findByText(FAILURE_RE);

    expect(readState()).toMatchObject({ inviteCount: 11500, paidCount: 1480, tier: 'gold' });
  });

  it('genuine zero from the backend is still applied (no over-correction)', async () => {
    seedRealState();
    api.fetchStatus.mockResolvedValue({ count: 0 });
    api.fetchPaidCount.mockResolvedValue(0);
    api.fetchEarnings.mockResolvedValue([]);

    await renderPage();
    await screen.findByText(/last synced/i);

    expect(readState()).toMatchObject({
      inviteCount: 0,
      paidCount: 0,
      tier: 'none',
      commission: 0,
      externalEligible: false,
    });
    expect(screen.queryByText(FAILURE_RE)).toBeNull();
  });

  it('genuine non-zero sync applies and shows "Last synced"', async () => {
    seedRealState();
    api.fetchStatus.mockResolvedValue({ count: 12000 });
    api.fetchPaidCount.mockResolvedValue(1500);
    api.fetchEarnings.mockResolvedValue([]);

    await renderPage();
    await screen.findByText(/last synced/i);

    expect(readState()).toMatchObject({ inviteCount: 12000, paidCount: 1500, tier: 'gold' });
    expect(screen.queryByText(FAILURE_RE)).toBeNull();
  });
});
