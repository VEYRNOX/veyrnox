// Behavioural regression test — referral progress bar gets real progressbar
// semantics (2026-07-20 branch review). Previously a plain <div> pair with no
// role, no aria-valuenow/min/max, no accessible name.
//
// Every value asserted here comes from the SAME already-I3-gated display
// variable (`dPaid`) the visible prose already renders — this suite runs
// under BOTH a genuine (seeded, Gold-tier) session and a deniability session,
// and pins that the deniability case exposes nothing beyond the neutral
// zero-state numbers the existing prose already shows.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

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

const deniability = { active: false };
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => deniability.active,
  isDeniabilitySessionActive: () => false,
}));

const STORAGE_KEY = 'veyrnox-referral';

/** A real Silver-tier user (not yet Gold) — mid-range progress, easy to check math on. */
const SILVER_SEEDED = {
  code: 'VYX-SIL234',
  inviteCount: 900,
  paidCount: 500, // silver range 100..1000, next tier gold at 1000
  tier: 'silver',
  commission: 5,
  externalEligible: false,
};

/** A Platinum (max-tier) user — exercises the "Maximum tier reached" branch. */
const PLATINUM_SEEDED = {
  code: 'VYX-PLT234',
  inviteCount: 20000,
  paidCount: 15000,
  tier: 'platinum',
  commission: 15,
  externalEligible: true,
};

function seed(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  deniability.active = false;
});

afterEach(() => {
  cleanup();
});

async function renderPage() {
  const { default: ReferralTracker } = await import('../ReferralTracker.jsx');
  return render(<ReferralTracker />);
}

describe('ReferralTracker — progress bar exposes real progressbar semantics', () => {
  it('has role=progressbar with a name and mid-range aria-valuenow matching the visible numbers', async () => {
    seed(SILVER_SEEDED);
    await renderPage();

    const bar = await screen.findByRole('progressbar', { name: /referral tier progress/i });
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    // Silver range is 100..1000, paidCount=500 -> (500-100)/(1000-100)*100 = 44.4%
    expect(bar.getAttribute('aria-valuenow')).toBe('44');
    expect(bar.getAttribute('aria-valuetext')).toMatch(/500 of 1,000 paid subscribers toward gold/i);

    // The value is not invented — it matches the already-visible prose.
    expect(screen.getByText('500')).toBeTruthy();
  });

  it('reports 100/"Maximum tier reached" once at the top tier', async () => {
    seed(PLATINUM_SEEDED);
    await renderPage();

    const bar = await screen.findByRole('progressbar', { name: /referral tier progress/i });
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
    expect(bar.getAttribute('aria-valuetext')).toMatch(/maximum tier reached/i);
  });

  it('never emits an invalid (NaN) aria-valuenow for a brand-new zero-paid state', async () => {
    // paidCount = 0 is the 'none' tier, whose "next" (bronze) has min: 0 too —
    // a pre-existing 0/0 division in the WIDTH calculation this suite does not
    // touch, but aria-valuenow must still be a valid finite number.
    await renderPage(); // no seeded state -> genuine brand-new user, paidCount 0

    const bar = await screen.findByRole('progressbar', { name: /referral tier progress/i });
    const now = bar.getAttribute('aria-valuenow');
    expect(now).not.toBe('NaN');
    expect(Number.isFinite(Number(now))).toBe(true);
  });

  it('deniability session: progressbar reflects the SAME neutral zero state as the visible prose, nothing more', async () => {
    seed(SILVER_SEEDED); // real Silver-tier state cached
    deniability.active = true;
    await renderPage();

    const bar = await screen.findByRole('progressbar', { name: /referral tier progress/i });
    // Must NOT leak the real 500/Silver progress.
    expect(bar.getAttribute('aria-valuetext')).not.toMatch(/500|silver/i);
    // Must match the neutral zero state a genuine brand-new user gets.
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getAllByText(/^0 paid subscribers$/i).length).toBeGreaterThan(0);
  });
});
