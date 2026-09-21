import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));
vi.mock('@/api/trackEvent', () => ({
  trackEvent: vi.fn(() => Promise.resolve()),
  EVENT: { PAYWALL_SHOWN: 'paywall_shown', PAYWALL_DISMISSED: 'paywall_dismissed', PAYWALL_CONVERTED: 'paywall_converted' },
}));
vi.mock('@/lib/TierProvider', () => ({
  useTier: vi.fn(() => ({ currentTier: 'free' })),
}));

import PaywallNudge, { shouldShowPaywallNudge, DAY_THRESHOLD, NUDGE_BODY } from '@/components/PaywallNudge';
import { useTier } from '@/lib/TierProvider';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

const SESSION_COUNT_KEY = 'veyrnox-session-day-count';
const NUDGE_DISMISSED_KEY = 'veyrnox-paywall-nudge-dismissed';
const AI_NUDGE_DISMISSED_KEY = 'veyrnox-ai-nudge-dismissed';

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

  // Deliberate pin on the VALUE and on the behaviour it produces. The boundary
  // tests above follow the constant wherever it goes; this one does not, so
  // raising the threshold back to a return-visit value goes red and sends the
  // reader to the reason instead of regressing silently.
  //
  // The reason lives in PaywallNudge.jsx beside the constant, including the SQL
  // to re-derive it — deliberately NOT restated here. An earlier version of
  // this test quoted a rationale ("one day means came back at least once") that
  // was factually wrong: incrementSessionDayCount() runs on the FIRST unlock,
  // so count === 1 is the first unlock day, not a return visit. A test that
  // pins a value to a false reason is worse than no pin, because the reason is
  // what the next reader acts on.
  it('threshold is 1 — eligible at the first unlock day, NOT a return visit', () => {
    expect(DAY_THRESHOLD).toBe(1);
    localStorage.setItem(SESSION_COUNT_KEY, '1');
    expect(shouldShowPaywallNudge('free')).toBe(true);
  });

  it('returns false when already dismissed', () => {
    localStorage.setItem(SESSION_COUNT_KEY, '5');
    localStorage.setItem(NUDGE_DISMISSED_KEY, '1');
    expect(shouldShowPaywallNudge('free')).toBe(false);
  });

  // Owner decision 2026-09-21: the nudge is how Safety Plus hears about AI
  // Security Protection (WinPaywall is free-only), once, on its own key.
  it('shows a Safety Plus subscriber the AI Security Protection nudge', () => {
    localStorage.setItem(SESSION_COUNT_KEY, '5');
    expect(shouldShowPaywallNudge('safety_plus')).toBe(true);
  });

  it('a free-tier dismissal from before upgrading does not suppress the AI nudge', () => {
    localStorage.setItem(SESSION_COUNT_KEY, '5');
    localStorage.setItem(NUDGE_DISMISSED_KEY, '1');
    expect(shouldShowPaywallNudge('safety_plus')).toBe(true);
  });

  it('the AI nudge is once-only on Safety Plus', () => {
    localStorage.setItem(SESSION_COUNT_KEY, '5');
    localStorage.setItem(AI_NUDGE_DISMISSED_KEY, '1');
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

// I4: the nudge must not sell controls every tier already has. KEK and RASP
// are ungated, spend limits work on Free, and "a stolen device can't access
// your keys" is an absolute claim with the audit outstanding.
describe('NUDGE_BODY', () => {
  it('names only paid capabilities, and makes no absolute claim', () => {
    expect(NUDGE_BODY).not.toMatch(/hardware|tamper|spend(ing)? limit|can.?t (access|reach)/i);
    expect(NUDGE_BODY).toMatch(/duress/i);
  });
});

describe('PaywallNudge render', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(false);
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  const show = async (tier) => {
    vi.mocked(useTier).mockReturnValue({ currentTier: tier });
    localStorage.setItem(SESSION_COUNT_KEY, '5');
    render(<MemoryRouter initialEntries={['/']}><PaywallNudge /></MemoryRouter>);
    await act(async () => { vi.advanceTimersByTime(3000); });
  };

  it('Safety Plus sees the AI Security Protection offer, and dismissing writes the AI key only', async () => {
    await show('safety_plus');
    expect(screen.getByRole('heading', { name: 'Add AI Security Protection' })).toBeTruthy();
    act(() => { screen.getByText('Not now').click(); });
    expect(localStorage.getItem(AI_NUDGE_DISMISSED_KEY)).toBe('1');
    expect(localStorage.getItem(NUDGE_DISMISSED_KEY)).toBeNull();
  });

  it('free still sees the Safety Plus offer', async () => {
    await show('free');
    expect(screen.getByRole('heading', { name: 'Upgrade to Safety Plus' })).toBeTruthy();
  });
});
