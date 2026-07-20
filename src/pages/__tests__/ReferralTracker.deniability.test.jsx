// P1 — ReferralTracker must not read, display, or write REAL referral state in a
// deniability (decoy/hidden) or demo session.
//
// The page seeds every stat from the SHARED `veyrnox-referral` localStorage key
// BEFORE any deniability gate, and `getLocalState().code || generateCode()` also
// WRITES that key. So opening this page under coercion both (a) displayed the real
// influencer's code / paid-subscriber count / tier / commission, and (b) let a
// decoy session mutate real persisted state.
//
// The honest presentation for a deniability session is a neutral EMPTY state that
// is indistinguishable from a genuine brand-new user: an ephemeral code, zero
// counts, no tier, no earnings, no external-reward link — and, critically, no
// message implying that hidden real figures exist behind the empty screen.
//
// These tests pin machine behaviour (values, storage bytes, wording predicates),
// not marketing copy.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

const deniability = { active: false, throws: false };
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => {
    if (deniability.throws) throw new Error('storage unavailable');
    return deniability.active;
  },
  isDeniabilitySessionActive: () => false,
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
  redeemedCode: 'VYX-ZZZ999',
  unlockedFeatures: ['portfolio-snapshots'],
};

function seedRealState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(SEEDED));
}

let api;

beforeEach(async () => {
  localStorage.clear();
  vi.clearAllMocks();
  deniability.active = false;
  deniability.throws = false;
  api = await import('@/api/referralApi');
});

afterEach(() => {
  cleanup();
});

async function renderPage() {
  const { default: ReferralTracker } = await import('../ReferralTracker.jsx');
  return render(<ReferralTracker />);
}

function displayedCode() {
  return screen.getByText(/^VYX-[A-Z0-9]{6}$/).textContent;
}

describe('ReferralTracker — I3 deniability gate (P1)', () => {
  it('does NOT display the real cached code, counts, tier or commission', async () => {
    seedRealState();
    deniability.active = true;

    await renderPage();
    await waitFor(() => expect(screen.getByText(/^VYX-[A-Z0-9]{6}$/)).toBeTruthy());

    // Real code never rendered.
    expect(screen.queryByText('VYX-ABC234')).toBeNull();
    // Real counts never rendered. NOTE: exact-string queries — the static "How
    // tiers work" copy uses 11,500 / 1,480 as a worked EXAMPLE, so a substring
    // regex would match that paragraph and pass/fail for the wrong reason.
    expect(screen.queryByText('1,480')).toBeNull();
    expect(screen.queryByText(/^11,500 total referrals/)).toBeNull();
    // Commission sentence only renders when commission > 0.
    expect(screen.queryByText(/Your followers get/i)).toBeNull();
    // externalEligible link only renders for gold/platinum.
    expect(screen.queryByText(/claim your reward/i)).toBeNull();
    // Neutral zero state, exactly like a brand-new user.
    expect(screen.getAllByText(/^0 paid subscribers$/i).length).toBeGreaterThan(0);
  });

  it('does NOT write the shared veyrnox-referral key (no state, no code write)', async () => {
    deniability.active = true;

    await renderPage();
    await waitFor(() => expect(screen.getByText(/^VYX-[A-Z0-9]{6}$/)).toBeTruthy());

    // A genuine new user would have had generateCode() persist a code here.
    // A deniability session must leave localStorage byte-identical (absent key).
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('does NOT mutate pre-existing real state (byte-identical localStorage)', async () => {
    seedRealState();
    const before = localStorage.getItem(STORAGE_KEY);
    deniability.active = true;

    await renderPage();
    await waitFor(() => expect(api.fetchPaidCount).toHaveBeenCalled());

    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it('shows a plausible ephemeral code that is stable across remounts', async () => {
    seedRealState();
    deniability.active = true;

    await renderPage();
    const first = displayedCode();
    expect(first).not.toBe('VYX-ABC234');
    cleanup();

    await renderPage();
    expect(displayedCode()).toBe(first);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(SEEDED));
  });

  it('renders the "got a code?" card even when real state says already-redeemed', async () => {
    seedRealState(); // redeemedCode present
    deniability.active = true;

    await renderPage();
    await waitFor(() => expect(screen.getByText(/got a referral code/i)).toBeTruthy());
  });

  it('fails CLOSED — a throwing deniability check is treated as active', async () => {
    seedRealState();
    deniability.throws = true;

    await renderPage();
    await waitFor(() => expect(screen.getByText(/^VYX-[A-Z0-9]{6}$/)).toBeTruthy());

    expect(screen.queryByText('VYX-ABC234')).toBeNull();
    expect(screen.queryByText('1,480')).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(SEEDED));
  });

  it('suppresses already-displayed real figures when the session flips mid-mount', async () => {
    // A decoy session can open while this page stays mounted; the state
    // initialisers only cover the mount case, so the DISPLAY must be gated live.
    seedRealState();
    const { rerender } = await renderPage();
    await waitFor(() => expect(screen.getByText('VYX-ABC234')).toBeTruthy());
    expect(screen.getByText('1,480')).toBeTruthy();

    deniability.active = true;
    const { default: ReferralTracker } = await import('../ReferralTracker.jsx');
    rerender(<ReferralTracker />);

    expect(screen.queryByText('VYX-ABC234')).toBeNull();
    expect(screen.queryByText('1,480')).toBeNull();
    expect(screen.queryByText(/claim your reward/i)).toBeNull();
  });

  it('no on-screen text implies hidden real figures exist', async () => {
    seedRealState();
    deniability.active = true;

    await renderPage();
    await waitFor(() => expect(api.fetchPaidCount).toHaveBeenCalled());

    const body = document.body.textContent;
    expect(body).not.toMatch(/last known|cached|previously|stored figures|your real/i);
    expect(body).not.toMatch(/decoy|demo|hidden|deniab/i);
  });

  it('sync-status wording is identical to a real session that cannot reach the service', async () => {
    // Real session, service unreachable (every read null).
    seedRealState();
    deniability.active = false;
    await renderPage();
    const realText = (await screen.findByText(/couldn[’']t reach the referral service/i)).textContent;
    cleanup();

    // Decoy session — same generic sentence, no distinguishing suffix.
    localStorage.clear();
    seedRealState();
    deniability.active = true;
    await renderPage();
    const decoyText = (await screen.findByText(/couldn[’']t reach the referral service/i)).textContent;

    expect(decoyText).toBe(realText);
  });
});
