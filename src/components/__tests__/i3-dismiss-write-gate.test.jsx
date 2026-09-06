// I3 write-gate regression: dismiss handlers must not write to shared
// localStorage from a decoy/demo session.
//
// Both components gate their RENDER on isDeniabilityOrDemoActive(), which is
// not sufficient. `visible` is seeded once at mount, and a session flipping to
// decoy triggers no re-render — so the already-mounted dismiss handler stays
// live and writes a real-session tell into shared storage.
//
// This is the two-chokepoint rule established by lib/consent.js (PR #1410) and
// the K-2 referral finding (PR #1262): gate the render AND the write. The
// sibling components already do exactly that — PaywallNudge.jsx handleDismiss,
// SecurityPosture.jsx writeDismissState, subscription/OutcomeSteps.jsx
// markOutcomeSeen — these two were the outliers.
//
// Raised by the 2026-09-06 Gemini weekly sweep (docs/audit-gemini-sweep-2026-09-06.md).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));
vi.mock('@/api/trackEvent', () => ({
  trackEvent: vi.fn(() => Promise.resolve()),
  EVENT: {
    PAYWALL_SHOWN: 'paywall_shown',
    PAYWALL_DISMISSED: 'paywall_dismissed',
    PAYWALL_CONVERTED: 'paywall_converted',
  },
}));
vi.mock('@/lib/referral', () => ({
  getLocalState: vi.fn(() => ({ code: 'VYX-TEST01' })),
  getEphemeralCode: vi.fn(() => 'VYX-EPHEM1'),
}));
vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import BackupPaywallNudge from '@/components/BackupPaywallNudge';
import ReferralPrompt from '@/components/ReferralPrompt';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

const BACKUP_KEY = 'veyrnox-backup-nudge-dismissed';
const REFERRAL_KEY = 'veyrnox-referral-prompt-dismissed';

const cases = [
  {
    name: 'BackupPaywallNudge',
    key: BACKUP_KEY,
    mount: () =>
      render(
        <MemoryRouter>
          <BackupPaywallNudge currentTier="free" />
        </MemoryRouter>,
      ),
  },
  {
    name: 'ReferralPrompt',
    key: REFERRAL_KEY,
    mount: () =>
      render(
        <MemoryRouter>
          <ReferralPrompt />
        </MemoryRouter>,
      ),
  },
];

describe.each(cases)('$name dismiss write gate (I3)', ({ key, mount }) => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(false);
  });
  afterEach(cleanup);

  it('still persists the dismissal in a real session', () => {
    mount();
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(localStorage.getItem(key)).toBe('1');
  });

  it('does not write to shared localStorage when the session flips to decoy while mounted', () => {
    mount();
    // Mounted in a real session, then coerced. The flip causes no re-render,
    // so the handler clicked below is the one from the real-session render.
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(localStorage.getItem(key)).toBeNull();
  });
});
