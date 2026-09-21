// A11Y-06 / A11Y-07 — Referral Tracker future-tier TierCard.
//
// A11Y-07: PLAN_FULL_PRICE_CENTS has no top-level `.annual` (it's keyed by plan
// id), so every TierCard rendered a literal "$NaN/yr per sub". Fixed to resolve
// the safety_plus annual price via getPlanFullPriceCents and to render no price
// claim at all if that price is ever unavailable (I4: never a fabricated number).
//
// A11Y-06: the future-tier branch applied `opacity-60` to the WHOLE card,
// multiplying the already-dim text-muted-foreground text down to ~3.17:1
// (fails WCAG 1.4.3's 4.5:1). Fixed to dim only the border/background and
// leave text at full opacity.
//
// A brand-new (no cached referral state) wallet puts every tier card in the
// isFuture=true branch (tierInfo.key === 'none' short-circuits true), which is
// exactly the fixture the QA finding used ("fresh (non-referring) wallet").

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => false,
  isDeniabilitySessionActive: () => false,
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

async function renderPage() {
  const { default: ReferralTracker } = await import('../ReferralTracker.jsx');
  return render(<ReferralTracker />);
}

describe('ReferralTracker — TierCard (future tiers, fresh wallet)', () => {
  it('never renders a fabricated "$NaN" price on any tier card', async () => {
    await renderPage();
    expect(screen.queryByText(/\$NaN/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/NaN/);
  });

  it('renders a real, non-zero annual payout figure for a future tier (Gold)', async () => {
    await renderPage();
    // Gold commission is 10%, safety_plus annual is $49.99 -> $5.00/yr per sub.
    expect(screen.getByText('$5.00/yr per sub')).toBeTruthy();
  });

  it('does not apply a blanket opacity-60 to the future-tier card (kills text contrast)', async () => {
    await renderPage();
    const label = screen.getByText('Gold');
    // Card container: label -> name <div> -> flex-items-center <div> -> card <div>.
    const card = label.closest('div.rounded-lg');
    expect(card).not.toBeNull();
    expect(card?.className).not.toMatch(/\bopacity-60\b/);
  });
});
