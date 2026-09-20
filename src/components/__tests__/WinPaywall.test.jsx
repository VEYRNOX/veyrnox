// WinPaywall — the recurring upsell fired by a success moment ("a WIN").
//
// What is pinned here, and why each one:
//   1. tier routing — free is sold Safety Plus, Safety Plus is sold AI
//      Security Protection, and the top tier is sold NOTHING (there is no
//      third product; an upsell there would be a lie).
//   2. it fires EVERY time, with no sticky dismissal key. That is the owner
//      decision this component exists for, so it is the thing a future
//      "let's not nag" edit must trip over.
//   3. I3 — a decoy/demo session dispatches nothing.

import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api/trackEvent', () => ({
  trackEvent: vi.fn(() => Promise.resolve()),
  EVENT: { PAYWALL_SHOWN: 'paywall_shown', PAYWALL_DISMISSED: 'paywall_dismissed', PAYWALL_CONVERTED: 'paywall_converted' },
}));

const deniable = vi.fn(() => false);
vi.mock('@/wallet-core/deniabilitySession', () => ({ isDeniabilityOrDemoActive: () => deniable() }));

let tier = 'free';
vi.mock('@/lib/TierProvider', () => ({ useTier: () => ({ currentTier: tier }) }));

import WinPaywall, { upsellFor } from '@/components/WinPaywall';
import { recordWin, WIN } from '@/lib/winPaywall';
import { TIER } from '@/lib/tier';

function mount() {
  return render(<MemoryRouter><WinPaywall /></MemoryRouter>);
}

const fire = (w = WIN.SEND_COMPLETED) => act(() => { recordWin(w); });

describe('upsellFor', () => {
  it('sells Safety Plus to free', () => {
    expect(upsellFor(TIER.FREE).to).toBe('/plans');
  });
  it('sells AI Security Protection to a Safety Plus subscriber', () => {
    expect(upsellFor(TIER.SAFETY_PLUS).to).toBe('/ai-security-protection');
  });
  it('sells NOTHING to the top tier', () => {
    expect(upsellFor(TIER.AI_SECURITY_PROTECTION)).toBeNull();
  });
});

describe('WinPaywall', () => {
  beforeEach(() => { deniable.mockReturnValue(false); tier = 'free'; });

  it('shows on a win', () => {
    mount();
    expect(screen.queryByTestId('win-paywall')).toBeNull();
    fire();
    expect(screen.getByTestId('win-paywall')).toBeTruthy();
    expect(screen.getByText('Upgrade to Safety Plus')).toBeTruthy();
  });

  it('upsells AI Security Protection when already on Safety Plus', () => {
    tier = TIER.SAFETY_PLUS;
    mount();
    fire(WIN.BACKUP_CONFIRMED);
    expect(screen.getByText('Add AI Security Protection')).toBeTruthy();
  });

  it('renders nothing for the top tier — no third product to sell', () => {
    tier = TIER.AI_SECURITY_PROTECTION;
    mount();
    fire();
    expect(screen.queryByTestId('win-paywall')).toBeNull();
  });

  it('shows again on the NEXT win after being dismissed (no sticky key)', () => {
    mount();
    fire(WIN.WALLET_IMPORTED);
    act(() => { screen.getByLabelText('Dismiss').click(); });
    expect(screen.queryByTestId('win-paywall')).toBeNull();
    fire(WIN.SEND_COMPLETED);
    expect(screen.getByTestId('win-paywall')).toBeTruthy();
  });

  it('I3 — a decoy/demo session never shows it', () => {
    mount();
    deniable.mockReturnValue(true);
    fire();
    expect(screen.queryByTestId('win-paywall')).toBeNull();
  });
});
