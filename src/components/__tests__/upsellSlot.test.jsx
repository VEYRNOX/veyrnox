// One Safety Plus upsell per session: PaywallNudge and BackupNagSheet are both
// due on a free user's first unlock, and used to stack. Real upsellSlot, mocked
// everything else. Whichever becomes visible first must hold the slot.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));
vi.mock('@/api/trackEvent', () => ({
  trackEvent: vi.fn(() => Promise.resolve()),
  EVENT: { PAYWALL_SHOWN: 'paywall_shown', PAYWALL_DISMISSED: 'paywall_dismissed', PAYWALL_CONVERTED: 'paywall_converted' },
}));
vi.mock('@/lib/TierProvider', () => ({ useTier: vi.fn(() => ({ currentTier: 'free' })) }));
vi.mock('@/lib/safetyPlusTrial', () => ({
  TRIAL_LOOKUP_BUDGET_MS: 1200,
  loadSafetyPlusTrialWithin: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('@/lib/referral', () => ({ hasRedeemed: () => false }));
vi.mock('@/lib/backupNag', () => ({
  shouldShowBackupNag: vi.fn(() => true),
  dismissForSession: vi.fn(),
  markBackupNagShown: vi.fn(),
  subscribe: vi.fn(() => () => {}),
}));

import PaywallNudge from '@/components/PaywallNudge';
import BackupNagSheet from '@/components/BackupNagSheet';
import { resetUpsellSlotForTests } from '@/lib/upsellSlot';

const SETTLE_AND_LOOKUP_MS = 4000;
// The card's own store lookup resolves in microtasks; let React commit it before
// the nudge's 2.5s settle timer, as it does on a real device. One big act() would
// batch both and starve the render.
const COMMIT_MS = 100;
const NUDGE_TITLE = /Upgrade to Safety Plus/;
const SHEET_TITLE = /Protect your wallet/;

function mountBoth() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <BackupNagSheet publicAddresses={[]} />
      <PaywallNudge />
    </MemoryRouter>,
  );
}

describe('one Safety Plus upsell per session', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    localStorage.setItem('veyrnox-session-day-count', '1');
    resetUpsellSlotForTests();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows the backup card and holds the paywall nudge back', async () => {
    mountBoth();
    await act(async () => { await vi.advanceTimersByTimeAsync(COMMIT_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(SETTLE_AND_LOOKUP_MS); });
    expect(screen.queryByText(SHEET_TITLE)).not.toBeNull();
    expect(screen.queryByText(NUDGE_TITLE)).toBeNull();
  });

  it('the stood-down nudge is not dismissed, so it is still eligible next session', async () => {
    mountBoth();
    await act(async () => { await vi.advanceTimersByTimeAsync(SETTLE_AND_LOOKUP_MS); });
    expect(localStorage.getItem('veyrnox-paywall-nudge-dismissed')).toBeNull();
  });

  it('when the nudge got there first, the backup card stays hidden', async () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/dashboard']}><PaywallNudge /></MemoryRouter>,
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(SETTLE_AND_LOOKUP_MS); });
    expect(screen.queryByText(NUDGE_TITLE)).not.toBeNull();
    unmount();
    render(
      <MemoryRouter initialEntries={['/dashboard']}><BackupNagSheet publicAddresses={[]} /></MemoryRouter>,
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(SETTLE_AND_LOOKUP_MS); });
    expect(screen.queryByText(SHEET_TITLE)).toBeNull();
  });
});
