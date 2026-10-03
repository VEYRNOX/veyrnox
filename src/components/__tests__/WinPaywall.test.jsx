// WinPaywall — the recurring upsell fired by a success moment ("a WIN").
//
// What is pinned here, and why each one:
//   1. tier routing — upsellFor() sells free Safety Plus and Safety Plus AI
//      Security Protection, but the MODAL shows for free only (owner decision
//      2026-09-21: a Safety Plus subscriber gets the AI offer once, as
//      PaywallNudge). The top tier is sold NOTHING.
//   2. it fires EVERY time, with no sticky dismissal key. That is the owner
//      decision this component exists for, so it is the thing a future
//      "let's not nag" edit must trip over.
//   3. I3 — a decoy/demo session dispatches nothing.

import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const useModalA11yMock = vi.fn(() => ({ current: null }));
vi.mock('@/lib/useModalA11y', () => ({
  useModalA11y: (...args) => useModalA11yMock(...args),
}));

vi.mock('@/api/trackEvent', () => ({
  trackEvent: vi.fn(() => Promise.resolve()),
  EVENT: { PAYWALL_SHOWN: 'paywall_shown', PAYWALL_DISMISSED: 'paywall_dismissed', PAYWALL_CONVERTED: 'paywall_converted' },
}));

const deniable = vi.fn(() => false);
vi.mock('@/wallet-core/deniabilitySession', () => ({ isDeniabilityOrDemoActive: () => deniable() }));

let tier = 'free';
vi.mock('@/lib/TierProvider', () => ({ useTier: () => ({ currentTier: tier }) }));

// The store lookup behind the "14 days free" wording. Defaults to "no confirmed
// trial" in beforeEach so every case below keeps today's copy unless it opts in.
const loadTrialMock = vi.fn(() => Promise.resolve(null));
vi.mock('@/lib/safetyPlusTrial', () => ({
  TRIAL_LOOKUP_BUDGET_MS: 1200,
  loadSafetyPlusTrialWithin: (...a) => loadTrialMock(...a),
}));
const hasRedeemedMock = vi.fn(() => false);
vi.mock('@/lib/referral', () => ({ hasRedeemed: () => hasRedeemedMock() }));

import WinPaywall, { upsellFor } from '@/components/WinPaywall';
import { recordWin, WIN } from '@/lib/winPaywall';
import { TIER } from '@/lib/tier';
import { trackEvent } from '@/api/trackEvent';

function mount() {
  return render(<MemoryRouter><WinPaywall /></MemoryRouter>);
}

// Async: the modal waits (bounded) for the store's trial answer before it
// appears, and `await act(async …)` flushes that settle.
const fire = async (w = WIN.SEND_COMPLETED) => { await act(async () => { recordWin(w); }); };

describe('upsellFor', () => {
  it('sells Safety Plus to free', () => {
    expect(upsellFor(TIER.FREE).to).toBe('/plans');
  });
  it('sells AI Security Protection to a Safety Plus subscriber', () => {
    expect(upsellFor(TIER.SAFETY_PLUS).to).toBe('/ai-security-protection');
  });
  // I4: the Free upsell must not sell controls every tier already has. KEK
  // and RASP are ungated, spend limits work on Free, and "a stolen device
  // can't reach your keys" is an absolute claim with the audit outstanding.
  it('Free upsell names only paid capabilities, and makes no absolute claim', () => {
    const { body } = upsellFor(TIER.FREE);
    expect(body).not.toMatch(/hardware|tamper|spend(ing)? limit|can.?t reach/i);
    expect(body).toMatch(/duress/i);
  });
  it('sells NOTHING to the top tier', () => {
    expect(upsellFor(TIER.AI_SECURITY_PROTECTION)).toBeNull();
  });
});

describe('WinPaywall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deniable.mockReturnValue(false);
    tier = 'free';
    loadTrialMock.mockResolvedValue(null);
    hasRedeemedMock.mockReturnValue(false);
  });

  it('shows on a win', async () => {
    mount();
    expect(screen.queryByTestId('win-paywall')).toBeNull();
    await fire();
    expect(screen.getByTestId('win-paywall')).toBeTruthy();
    expect(screen.getByText('Upgrade to Safety Plus')).toBeTruthy();
  });

  it('never interrupts a Safety Plus subscriber on a win — the AI offer is nudge-only', async () => {
    tier = TIER.SAFETY_PLUS;
    mount();
    await fire(WIN.BACKUP_CONFIRMED);
    expect(screen.queryByTestId('win-paywall')).toBeNull();
    expect(loadTrialMock).not.toHaveBeenCalled();
  });

  it('renders nothing for the top tier — no third product to sell', async () => {
    tier = TIER.AI_SECURITY_PROTECTION;
    mount();
    await fire();
    expect(screen.queryByTestId('win-paywall')).toBeNull();
    expect(loadTrialMock).not.toHaveBeenCalled();
  });

  it('shows again on the NEXT win after being dismissed (no sticky key)', async () => {
    mount();
    await fire(WIN.WALLET_IMPORTED);
    act(() => { screen.getByLabelText('Dismiss').click(); });
    expect(screen.queryByTestId('win-paywall')).toBeNull();
    await fire(WIN.SEND_COMPLETED);
    expect(screen.getByTestId('win-paywall')).toBeTruthy();
  });

  it('I3 — a decoy/demo session never shows it, and never asks the store', async () => {
    mount();
    deniable.mockReturnValue(true);
    await fire();
    expect(screen.queryByTestId('win-paywall')).toBeNull();
    expect(loadTrialMock).not.toHaveBeenCalled();
  });
});

// "14 days free" is a claim about what the store will charge: the modal may say it
// only when loadSafetyPlusTrialWithin confirms an eligible, store-reported trial.
// The derivation (zero-price phase, iOS eligibility, no referral, time limit) is
// covered in lib/__tests__; this block pins the wiring.
describe('WinPaywall free-trial wording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deniable.mockReturnValue(false);
    tier = 'free';
    loadTrialMock.mockResolvedValue(null);
    hasRedeemedMock.mockReturnValue(false);
  });

  const shownCount = () => vi.mocked(trackEvent).mock.calls.filter(([e]) => e === 'paywall_shown').length;

  it('a confirmed trial: says 14 days free with the price after it, and offers to see it', async () => {
    loadTrialMock.mockResolvedValue({ days: 14, priceString: '$49.99' });
    mount();
    await fire();
    expect(screen.getByRole('heading', { name: 'Try Safety Plus — 14 days free' })).toBeTruthy();
    expect(screen.getByText(/14 days free, then \$49\.99\/year/)).toBeTruthy();
    expect(screen.getByText(/before the trial ends/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'See free trial' })).toBeTruthy();
    expect(screen.queryByText('See plans')).toBeNull();
    expect(screen.getByTestId('win-paywall').getAttribute('aria-label')).toBe('Try Safety Plus — 14 days free');
  });

  it('keeps the paid-capabilities sentence alongside the trial', async () => {
    loadTrialMock.mockResolvedValue({ days: 14, priceString: '$49.99' });
    mount();
    await fire();
    expect(screen.getByText(/duress PIN/i)).toBeTruthy();
  });

  it('no confirmed trial: today\'s copy and button, no free claim', async () => {
    mount();
    await fire();
    expect(screen.getByRole('button', { name: 'See plans' })).toBeTruthy();
    expect(screen.getByTestId('win-paywall').textContent).not.toMatch(/free/i);
  });

  it('the trial CTA still reports the same offer id, so the funnel series is unchanged', async () => {
    loadTrialMock.mockResolvedValue({ days: 14, priceString: '$49.99' });
    mount();
    await fire(WIN.SEND_COMPLETED);
    act(() => { screen.getByRole('button', { name: 'See free trial' }).click(); });
    expect(trackEvent).toHaveBeenCalledWith('paywall_converted', { trigger: WIN.SEND_COMPLETED, offer: TIER.SAFETY_PLUS });
  });

  it('holds the modal until the lookup settles, and counts it as shown only then', async () => {
    let settle;
    loadTrialMock.mockReturnValue(new Promise((resolve) => { settle = resolve; }));
    mount();
    await fire();
    expect(screen.queryByTestId('win-paywall')).toBeNull();
    expect(shownCount()).toBe(0);
    expect(useModalA11yMock).toHaveBeenLastCalledWith(expect.objectContaining({ active: false }));
    await act(async () => { settle({ days: 14, priceString: '$49.99' }); });
    expect(screen.getByTestId('win-paywall')).toBeTruthy();
    expect(shownCount()).toBe(1);
    expect(useModalA11yMock).toHaveBeenLastCalledWith(expect.objectContaining({ active: true }));
  });

  it('counts a win as shown exactly once, however often the component re-renders', async () => {
    const view = mount();
    await fire();
    view.rerender(<MemoryRouter><WinPaywall /></MemoryRouter>);
    view.rerender(<MemoryRouter><WinPaywall /></MemoryRouter>);
    expect(shownCount()).toBe(1);
  });

  it('a new win asks the store afresh and never reuses the last answer', async () => {
    loadTrialMock.mockResolvedValueOnce({ days: 14, priceString: '$49.99' }).mockResolvedValueOnce(null);
    mount();
    await fire(WIN.WALLET_IMPORTED);
    expect(screen.getByRole('button', { name: 'See free trial' })).toBeTruthy();
    act(() => { screen.getByLabelText('Dismiss').click(); });
    await fire(WIN.SEND_COMPLETED);
    expect(loadTrialMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'See plans' })).toBeTruthy();
    expect(screen.queryByText(/free/i)).toBeNull();
  });

  it('while a second win\'s lookup is pending, the last win\'s trial is never shown', async () => {
    // The final state alone cannot tell a fresh answer from a reused one: the
    // stale trial is only visible during the wait, which is exactly the flash of
    // wrong copy the per-win reset prevents.
    loadTrialMock.mockResolvedValueOnce({ days: 14, priceString: '$49.99' });
    mount();
    await fire(WIN.WALLET_IMPORTED);
    expect(screen.getByRole('button', { name: 'See free trial' })).toBeTruthy();
    act(() => { screen.getByLabelText('Dismiss').click(); });
    loadTrialMock.mockReturnValueOnce(new Promise(() => {}));
    await fire(WIN.SEND_COMPLETED);
    expect(screen.queryByTestId('win-paywall')).toBeNull();
    expect(screen.queryByText(/14 days free/i)).toBeNull();
  });

  it('I3 — a session that flips to decoy between the win and the lookup asks the store nothing', async () => {
    // recordWin() and then the win handler each check once and see a real session
    // (so the event is dispatched and accepted); every later check sees a decoy.
    // The lookup guard is what stops the call.
    deniable.mockReset();
    deniable.mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValue(true);
    mount();
    await fire();
    expect(loadTrialMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('win-paywall')).toBeNull();
  });

  it('asks with a bounded wait and the live referral flag', async () => {
    hasRedeemedMock.mockReturnValue(true);
    mount();
    await fire();
    expect(loadTrialMock).toHaveBeenCalledTimes(1);
    const [budgetMs, args] = loadTrialMock.mock.calls[0];
    expect(budgetMs).toBeGreaterThan(0);
    expect(budgetMs).toBeLessThanOrEqual(2000);
    expect(args.hasReferral).toBe(true);
  });
});
