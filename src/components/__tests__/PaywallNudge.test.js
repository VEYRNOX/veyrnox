import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));
vi.mock('@/lib/TierProvider', () => ({
  useTier: vi.fn(() => ({ currentTier: 'free' })),
}));

import { shouldShowPaywallNudge, DAY_THRESHOLD } from '@/components/PaywallNudge';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

const SESSION_COUNT_KEY = 'veyrnox-session-day-count';
const NUDGE_DISMISSED_KEY = 'veyrnox-paywall-nudge-dismissed';

describe('shouldShowPaywallNudge', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(false);
  });

  // Boundary is derived from DAY_THRESHOLD rather than a literal, so the two
  // cases cannot drift apart from the constant the way `'2'`/`'3'` did when
  // the threshold moved. They still go red if the count check is deleted
  // outright, which is the regression worth catching.
  it('returns false one day below the threshold', () => {
    localStorage.setItem(SESSION_COUNT_KEY, String(DAY_THRESHOLD - 1));
    expect(shouldShowPaywallNudge('free')).toBe(false);
  });

  it('returns true at the threshold', () => {
    localStorage.setItem(SESSION_COUNT_KEY, String(DAY_THRESHOLD));
    expect(shouldShowPaywallNudge('free')).toBe(true);
  });

  // Separate, deliberate pin on the VALUE. The boundary tests above follow the
  // constant wherever it goes; this one does not, so raising the threshold is
  // a red test that sends the reader to the reason rather than a silent
  // regression. Production public.events, 2026-09-17: of 2,139 devices that
  // ever emitted session_start, 2,114 did so on exactly one calendar day and
  // seven ever reached three. At 3 this nudge was unreachable — paywall_shown
  // had fired twice, ever, against 2,304 wallet_ready devices. Do not raise it
  // without new retention data saying the population has changed.
  it('threshold is 1 — a higher value is unreachable for ~99% of devices', () => {
    expect(DAY_THRESHOLD).toBe(1);
  });

  it('returns false when already dismissed', () => {
    localStorage.setItem(SESSION_COUNT_KEY, '5');
    localStorage.setItem(NUDGE_DISMISSED_KEY, '1');
    expect(shouldShowPaywallNudge('free')).toBe(false);
  });

  it('returns false when already subscribed', () => {
    localStorage.setItem(SESSION_COUNT_KEY, '5');
    expect(shouldShowPaywallNudge('safety_plus')).toBe(false);
  });

  it('returns false for AI Security Protection because it is also a paid tier', () => {
    localStorage.setItem(SESSION_COUNT_KEY, '5');
    expect(shouldShowPaywallNudge('ai_security_protection')).toBe(false);
  });

  it('returns false in deniability mode', () => {
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    localStorage.setItem(SESSION_COUNT_KEY, '5');
    expect(shouldShowPaywallNudge('free')).toBe(false);
  });
});
