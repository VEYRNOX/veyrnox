import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router';

const isNativePlatform = vi.fn();
const getPlatform = vi.fn(() => 'ios');
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNativePlatform(),
    getPlatform: () => getPlatform(),
  },
}));

const getOfferings = vi.fn();
const getTierOffering = vi.fn();
const purchasePackage = vi.fn();
const restorePurchases = vi.fn();
const manageSubscription = vi.fn();
const setReferralAttribute = vi.fn();
const offerPriceInfo = vi.fn();
vi.mock('@/lib/purchases', () => ({
  getOfferings: (...a) => getOfferings(...a),
  getTierOffering: (...a) => getTierOffering(...a),
  purchasePackage: (...a) => purchasePackage(...a),
  restorePurchases: (...a) => restorePurchases(...a),
  manageSubscription: (...a) => manageSubscription(...a),
  setReferralAttribute: (...a) => setReferralAttribute(...a),
  // Resolves an offer's REAL price from the store payload. Defaults to null
  // (unresolvable) so the page falls back to the base price and — critically —
  // suppresses the strikethrough. Tests that exercise a real discount override
  // it per-case. Covered directly in lib/__tests__/purchases*.offers.test.js.
  offerPriceInfo: (...a) => offerPriceInfo(...a),
  OFFER_UNAVAILABLE: 'OFFER_UNAVAILABLE',
  SAFETY_PLUS_MONTHLY_PACKAGE: '$rc_monthly',
  SAFETY_PLUS_ANNUAL_PACKAGE: '$rc_annual',
  RETENTION_OFFERING_ID: 'retention',
}));

const hasRedeemedMock = vi.fn();
const getRedeemedCodeMock = vi.fn();
const hasAttributedMock = vi.fn();
const markAttributedMock = vi.fn();
const getTierMock = vi.fn();
const getTierInfoMock = vi.fn();
const getOfferingIdForTierMock = vi.fn();
const calculateDiscountCentsMock = vi.fn();
vi.mock('@/lib/referral', async (importOriginal) => ({
  ...(await importOriginal()),
  hasRedeemed: (...a) => hasRedeemedMock(...a),
  getRedeemedCode: (...a) => getRedeemedCodeMock(...a),
  hasAttributed: (...a) => hasAttributedMock(...a),
  markAttributed: (...a) => markAttributedMock(...a),
  getTier: (...a) => getTierMock(...a),
  getTierInfo: (...a) => getTierInfoMock(...a),
  getOfferingIdForTier: (...a) => getOfferingIdForTierMock(...a),
  calculateDiscountCents: (...a) => calculateDiscountCentsMock(...a),
  PLAN_FULL_PRICE_CENTS: { monthly: 599, annual: 4999 },
  // Branch review 2026-08-15 (C-1): spread importOriginal() so exports this
  // suite does not stub — storeDiscountCents — resolve to the REAL function
  // rather than undefined. Calling an undefined export throws into
  // handleUpgrade's own catch, so attribution silently never happens and the
  // suite reports "recordAttribution called 0 times" rather than a missing
  // mock. Re-implementing it here would be a second copy free to drift from
  // the one under test.
}));

const recordAttribution = vi.fn();
const fetchPaidCount = vi.fn();
vi.mock('@/api/referralApi', () => ({
  recordAttribution: (...a) => recordAttribution(...a),
  fetchPaidCount: (...a) => fetchPaidCount(...a),
}));

const refreshTier = vi.fn();
const useTierMock = vi.fn();
vi.mock('@/lib/TierProvider', () => ({ useTier: () => useTierMock() }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const Subscription = (await import('../Subscription')).default;

function renderPage() {
  return render(
    <MemoryRouter>
      <Subscription />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Land straight on pricing. The outcome-first preamble renders BEFORE the plan
  // UI for a first-time non-subscriber; this suite covers pricing, purchase and
  // the manage view, not onboarding. The preamble has its own tests
  // (components/subscription/__tests__/OutcomeSteps.test.jsx), and the fact that
  // it precedes pricing at all is asserted in this file's own preamble block.
  localStorage.setItem('veyrnox-paywall-outcome-seen', '1');
  hasRedeemedMock.mockReturnValue(false);
  getRedeemedCodeMock.mockReturnValue(null);
  hasAttributedMock.mockReturnValue(false);
  getTierMock.mockReturnValue('none');
  getTierInfoMock.mockReturnValue({ key: 'none', commission: 0, next: null });
  getOfferingIdForTierMock.mockReturnValue(null);
  offerPriceInfo.mockReturnValue(null);
  calculateDiscountCentsMock.mockImplementation((full, comm) => Math.round(full * comm / 100));
  useTierMock.mockReturnValue({ currentTier: 'free', tiers: [], refreshTier });
});

describe('Subscription page — web (no store)', () => {
  it('shows the mobile-only notice and a disabled upgrade button', async () => {
    isNativePlatform.mockReturnValue(false);
    renderPage();
    expect(screen.getByText(/testing-only/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /mobile only/i })).toBeDisabled();
  });
});

describe('Subscription page — native, monthly-only offering', () => {
  beforeEach(() => {
    isNativePlatform.mockReturnValue(true);
    getOfferings.mockResolvedValue({
      availablePackages: [
        { identifier: '$rc_monthly', product: { priceString: '$5.99' } },
      ],
    });
  });

  it('shows the real store price once offerings load', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('$5.99')).toBeTruthy());
  });

  it('renders the billing-period toggle even when only monthly is available', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('$5.99')).toBeTruthy());
    expect(screen.queryByRole('radiogroup', { name: /billing period/i })).toBeTruthy();
  });

  it('purchasing calls purchasePackage then refreshes the tier', async () => {
    purchasePackage.mockResolvedValue({});
    refreshTier.mockResolvedValue('safety_plus');
    renderPage();
    await waitFor(() => expect(screen.getByText('$5.99')).toBeTruthy());
    fireEvent.click(screen.getByRole('radio', { name: /monthly/i }));
    fireEvent.click(screen.getByRole('button', { name: /upgrade/i }));
    await waitFor(() => expect(purchasePackage).toHaveBeenCalledWith({
      identifier: '$rc_monthly',
      product: { priceString: '$5.99' },
    }, { offerTag: null }));
    await waitFor(() => expect(refreshTier).toHaveBeenCalled());
  });

  it('restoring calls restorePurchases then refreshes the tier', async () => {
    restorePurchases.mockResolvedValue({});
    refreshTier.mockResolvedValue('free');
    renderPage();
    await waitFor(() => expect(screen.getByText('$5.99')).toBeTruthy());
    fireEvent.click(screen.getByText(/restore purchases/i));
    await waitFor(() => expect(restorePurchases).toHaveBeenCalled());
    await waitFor(() => expect(refreshTier).toHaveBeenCalled());
  });
});

// Mirror of the monthly-only block. #1207 removed both halves of the
// availability guard; #1216 restored only the annual half
// (`Boolean(effectiveAnnual)`), leaving this direction uncovered: with annual
// present but monthly absent, the toggle rendered, selecting Monthly resolved
// selectedPackage to undefined, and handleUpgrade's `if (!selectedPackage)
// return` made Upgrade a silent no-op — the same I4 dead-button failure on the
// other branch of the toggle.
describe('Subscription page — native, annual-only offering', () => {
  beforeEach(() => {
    isNativePlatform.mockReturnValue(true);
    getOfferings.mockResolvedValue({
      availablePackages: [
        { identifier: '$rc_annual', product: { priceString: '$49.99' } },
      ],
    });
  });

  it('renders the billing-period toggle even when only annual is available', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText('$49.99').length).toBeGreaterThan(0));
    expect(screen.queryByRole('radiogroup', { name: /billing period/i })).toBeTruthy();
  });

  it('purchasing uses the annual package — never a dead Upgrade button', async () => {
    purchasePackage.mockResolvedValue({});
    refreshTier.mockResolvedValue('safety_plus');
    renderPage();
    await waitFor(() => expect(screen.getAllByText('$49.99').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: /upgrade/i }));
    await waitFor(() => expect(purchasePackage).toHaveBeenCalledWith({
      identifier: '$rc_annual',
      product: { priceString: '$49.99' },
    }, { offerTag: null }));
    await waitFor(() => expect(refreshTier).toHaveBeenCalled());
  });
});

describe('Subscription page — native, monthly + annual offering', () => {
  beforeEach(() => {
    isNativePlatform.mockReturnValue(true);
    getOfferings.mockResolvedValue({
      availablePackages: [
        { identifier: '$rc_monthly', product: { priceString: '$5.99' } },
        { identifier: '$rc_annual', product: { priceString: '$49.99' } },
      ],
    });
  });

  it('defaults to the annual package and shows the annual price', async () => {
    renderPage();
    // The card headline price shows the annual selection by default.
    await waitFor(() => expect(screen.getAllByText('$49.99').length).toBeGreaterThan(0));
    // The CTA reflects the selected billing period.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /upgrade.*\$49\.99/i })).toBeTruthy()
    );
  });

  it('renders both toggle options with the store-supplied prices', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('radiogroup', { name: /billing period/i })).toBeTruthy());
    expect(screen.getByRole('radio', { name: /monthly/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /annual/i })).toBeTruthy();
    expect(screen.getByText('$5.99')).toBeTruthy();
    // $49.99 appears in the annual toggle button and the card headline — both are fine.
    expect(screen.getAllByText('$49.99').length).toBeGreaterThan(0);
  });

  it('purchasing while annual is selected calls purchasePackage with the annual package', async () => {
    purchasePackage.mockResolvedValue({});
    refreshTier.mockResolvedValue('safety_plus');
    renderPage();
    await waitFor(() => expect(screen.getByRole('radiogroup', { name: /billing period/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /upgrade/i }));
    await waitFor(() => expect(purchasePackage).toHaveBeenCalledWith({
      identifier: '$rc_annual',
      product: { priceString: '$49.99' },
    }, { offerTag: null }));
    await waitFor(() => expect(refreshTier).toHaveBeenCalled());
  });

  it('switching to monthly and purchasing calls purchasePackage with the monthly package', async () => {
    purchasePackage.mockResolvedValue({});
    refreshTier.mockResolvedValue('safety_plus');
    renderPage();
    await waitFor(() => expect(screen.getByRole('radio', { name: /monthly/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('radio', { name: /monthly/i }));
    fireEvent.click(screen.getByRole('button', { name: /upgrade/i }));
    await waitFor(() => expect(purchasePackage).toHaveBeenCalledWith({
      identifier: '$rc_monthly',
      product: { priceString: '$5.99' },
    }, { offerTag: null }));
  });
});

// F-radiogroup (2026-07-20 branch review): the billing-period radios had no
// arrow-key navigation and no roving tabindex — an APG pattern deviation.
// These tests exercise real keydown events against the rendered radiogroup,
// not a source scan.
describe('Subscription page — billing radiogroup arrow-key navigation', () => {
  beforeEach(() => {
    isNativePlatform.mockReturnValue(true);
    getOfferings.mockResolvedValue({
      availablePackages: [
        { identifier: '$rc_monthly', product: { priceString: '$5.99' } },
        { identifier: '$rc_annual', product: { priceString: '$49.99' } },
      ],
    });
  });

  it('only the selected radio is in the tab order (roving tabindex)', async () => {
    renderPage();
    const monthly = await screen.findByRole('radio', { name: /monthly/i });
    const annual = screen.getByRole('radio', { name: /annual/i });
    // Annual is selected by default.
    expect(annual.getAttribute('tabindex')).toBe('0');
    expect(monthly.getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowLeft from Annual moves focus to and selects Monthly', async () => {
    renderPage();
    const monthly = await screen.findByRole('radio', { name: /monthly/i });
    const annual = screen.getByRole('radio', { name: /annual/i });
    annual.focus();
    expect(document.activeElement).toBe(annual);

    fireEvent.keyDown(annual, { key: 'ArrowLeft' });

    await waitFor(() => expect(document.activeElement).toBe(monthly));
    expect(monthly.getAttribute('aria-checked')).toBe('true');
    expect(annual.getAttribute('aria-checked')).toBe('false');
    // Roving tabindex follows selection.
    expect(monthly.getAttribute('tabindex')).toBe('0');
    expect(annual.getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowRight from Monthly moves focus to and selects Annual (wraps both ways with only two options)', async () => {
    renderPage();
    const monthly = await screen.findByRole('radio', { name: /monthly/i });
    const annual = screen.getByRole('radio', { name: /annual/i });
    fireEvent.click(monthly); // select Monthly first via mouse
    monthly.focus();

    fireEvent.keyDown(monthly, { key: 'ArrowRight' });

    await waitFor(() => expect(document.activeElement).toBe(annual));
    expect(annual.getAttribute('aria-checked')).toBe('true');
  });

  it('ArrowDown/ArrowUp behave the same as ArrowRight/ArrowLeft', async () => {
    renderPage();
    const monthly = await screen.findByRole('radio', { name: /monthly/i });
    const annual = screen.getByRole('radio', { name: /annual/i });
    annual.focus();

    fireEvent.keyDown(annual, { key: 'ArrowUp' });
    await waitFor(() => expect(document.activeElement).toBe(monthly));

    fireEvent.keyDown(monthly, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement).toBe(annual));
  });

  it('the selected price reflects the arrow-key selection, not just the click path', async () => {
    renderPage();
    const monthly = await screen.findByRole('radio', { name: /monthly/i });
    const annual = screen.getByRole('radio', { name: /annual/i });
    annual.focus();
    fireEvent.keyDown(annual, { key: 'ArrowLeft' });
    await waitFor(() => expect(monthly.getAttribute('aria-checked')).toBe('true'));

    expect(screen.getByRole('button', { name: /upgrade.*\$5\.99/i })).toBeTruthy();
  });
});

describe('Subscription page — Manage subscription (paid tier, native)', () => {
  beforeEach(() => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue('ios');
    useTierMock.mockReturnValue({ currentTier: 'safety_plus', tiers: [], refreshTier });
    getOfferings.mockResolvedValue({ availablePackages: [] });
  });

  it('renders the Manage subscription button on a paid native session', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /manage subscription/i })).toBeTruthy()
    );
  });

  // Manage subscription now opens the cancel-intent dialog first; the store
  // deep-link fires from "Continue to cancel" inside it. The route out must stay
  // one click away — an offer that is hard to escape is a dark pattern, and both
  // stores treat it as one.
  it('clicking Manage subscription opens the dialog, not the store directly', async () => {
    manageSubscription.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /manage subscription/i }));
    expect(await screen.findByText(/continue to cancel/i)).toBeTruthy();
    expect(manageSubscription).not.toHaveBeenCalled();
  });

  it('Continue to cancel deep-links to the store — cancellation is never trapped', async () => {
    manageSubscription.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /manage subscription/i }));
    fireEvent.click(await screen.findByText(/continue to cancel/i));
    await waitFor(() => expect(manageSubscription).toHaveBeenCalledTimes(1));
  });

  it('helper copy names the App Store on iOS', async () => {
    getPlatform.mockReturnValue('ios');
    renderPage();
    await waitFor(() => expect(screen.getByText(/App Store settings/i)).toBeTruthy());
  });

  it('helper copy names the Play Store on Android', async () => {
    getPlatform.mockReturnValue('android');
    renderPage();
    await waitFor(() => expect(screen.getByText(/Play Store settings/i)).toBeTruthy());
  });

  it('renders a separate AI Security Protection card when that is the current plan', async () => {
    useTierMock.mockReturnValue({ currentTier: 'ai_security_protection', tiers: [], refreshTier });
    renderPage();
    expect(await screen.findByTestId('ai-security-protection-card')).toBeTruthy();
    expect(screen.getByText(/You're on AI Security Protection/i)).toBeTruthy();
    expect(screen.getByText(/already includes every Safety Plus feature/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /manage subscription/i })).toBeTruthy();
  });
});

describe('Subscription page — Manage subscription hidden when it should be', () => {
  it('is hidden on native when tier is free (upgrade path shows instead)', async () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue('ios');
    useTierMock.mockReturnValue({ currentTier: 'free', tiers: [], refreshTier });
    getOfferings.mockResolvedValue({ availablePackages: [] });
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /upgrade/i })).toBeTruthy());
    expect(screen.queryByRole('button', { name: /manage subscription/i })).toBeNull();
  });

  it('is hidden on web even when tier is safety_plus (no subscription surface on web)', async () => {
    isNativePlatform.mockReturnValue(false);
    useTierMock.mockReturnValue({ currentTier: 'safety_plus', tiers: [], refreshTier });
    renderPage();
    // Wait long enough for any offering effect (there is none on web) to run.
    await waitFor(() => expect(screen.getByText(/Plans/i)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /manage subscription/i })).toBeNull();
  });

  it('shows the honest separate-plan note for AI Security Protection when free', async () => {
    isNativePlatform.mockReturnValue(false);
    useTierMock.mockReturnValue({ currentTier: 'free', tiers: [], refreshTier });
    renderPage();
    expect(await screen.findByTestId('ai-security-protection-card')).toBeTruthy();
    expect(screen.getByText(/Contact sales/i)).toBeTruthy();
    expect(screen.getByText(/includes everything in Free and Safety Plus/i)).toBeTruthy();
  });
});

describe('Subscription page — tier-based referral discount', () => {
  // Numeric `price` alongside `priceString`: RevenueCat returns both, and the
  // banner's "% off" is now derived from the numbers. Fixtures that omit `price`
  // silently make every derived claim null, so a percentage assertion would pass
  // for the wrong reason.
  const defaultPackages = [
    { identifier: '$rc_monthly', product: { priceString: '$5.99', price: 5.99 } },
    { identifier: '$rc_annual', product: { priceString: '$49.99', price: 49.99 } },
  ];
  // A referral package wraps the SAME store product as the full-price one, so
  // its priceString is the BASE price on both stores — $5.99 / $49.99, not the
  // discounted figure. The discount lives in the offer (Apple: product
  // .discounts[]; Play: the option's introPhase) and is read by offerPriceInfo.
  // Fixtures that put $44.99 here would test a payload no store ever sends.
  const goldReferralPackages = [
    { identifier: '$rc_monthly', product: { priceString: '$5.99', price: 5.99 } },
    { identifier: '$rc_annual', product: { priceString: '$49.99', price: 49.99 } },
  ];

  function setupGoldReferral() {
    hasRedeemedMock.mockReturnValue(true);
    getRedeemedCodeMock.mockReturnValue('VYX-ABC123');
    fetchPaidCount.mockResolvedValue(5000);
    getTierMock.mockReturnValue('gold');
    getTierInfoMock.mockReturnValue({ key: 'gold', commission: 10, next: { key: 'platinum', min: 10000 } });
    getOfferingIdForTierMock.mockReturnValue('referral-gold');
    getTierOffering.mockResolvedValue({ availablePackages: goldReferralPackages });
    // The 10% Gold offer as the store reports it, per package.
    offerPriceInfo.mockImplementation((pkg, offeringId) => {
      if (offeringId !== 'referral-gold' || !pkg) return null;
      if (pkg.identifier === '$rc_annual') return { priceString: '$44.99', price: 44.99 };
      if (pkg.identifier === '$rc_monthly') return { priceString: '$5.39', price: 5.39 };
      return null;
    });
  }

  beforeEach(() => {
    isNativePlatform.mockReturnValue(true);
    getOfferings.mockResolvedValue({ availablePackages: defaultPackages });
  });

  it('shows the discount banner with the discount derived from the store prices', async () => {
    setupGoldReferral();
    renderPage();
    await waitFor(() => expect(screen.getByText(/referral discount applied.*10% off/i)).toBeTruthy());
  });

  // The banner used to render referrerTierInfo.commission — the REFERRER's
  // earnings rate off the static TIERS table, set before any offering resolved.
  // These three guard that it now describes the price the buyer is charged.

  it('claims NO percentage when the offer price cannot be read', async () => {
    // A referral offering resolves (hasDiscount is true) but no offer price is
    // readable, so the buyer pays the base price. The old banner still promised
    // the tier percentage over the top of it.
    setupGoldReferral();
    offerPriceInfo.mockReturnValue(null);
    renderPage();

    await waitFor(() => expect(screen.getByText(/referral discount applied/i)).toBeTruthy());
    expect(screen.queryByText(/% off/i)).toBeNull();
  });

  it('claims NO percentage when FX rounding erased the discount', async () => {
    // CLAUDE.md names this case: Bronze is full price in Albania/Armenia. The
    // offer resolves and is honoured, but it lands on the base price.
    setupGoldReferral();
    offerPriceInfo.mockImplementation((pkg, offeringId) => {
      if (offeringId !== 'referral-gold' || !pkg) return null;
      if (pkg.identifier === '$rc_annual') return { priceString: '$49.99', price: 49.99 };
      if (pkg.identifier === '$rc_monthly') return { priceString: '$5.99', price: 5.99 };
      return null;
    });
    renderPage();

    await waitFor(() => expect(screen.getByText(/referral discount applied/i)).toBeTruthy());
    expect(screen.queryByText(/% off/i)).toBeNull();
  });

  it('quotes the real delta, not the tier nominal rate, when the store cannot express it', async () => {
    // Bronze is nominally 2.5%, which Apple cannot express — it charges $5.79
    // against a $5.99 base, really 3.34% off. The banner must say 3%, and must
    // not say 2.5%.
    hasRedeemedMock.mockReturnValue(true);
    getRedeemedCodeMock.mockReturnValue('VYX-BRONZE');
    fetchPaidCount.mockResolvedValue(10);
    getTierMock.mockReturnValue('bronze');
    getTierInfoMock.mockReturnValue({ key: 'bronze', commission: 2.5, next: { key: 'silver', min: 100 } });
    getOfferingIdForTierMock.mockReturnValue('referral-bronze');
    getTierOffering.mockResolvedValue({ availablePackages: goldReferralPackages });
    offerPriceInfo.mockImplementation((pkg, offeringId) => {
      if (offeringId !== 'referral-bronze' || !pkg) return null;
      if (pkg.identifier === '$rc_annual') return { priceString: '$48.49', price: 48.49 };
      if (pkg.identifier === '$rc_monthly') return { priceString: '$5.79', price: 5.79 };
      return null;
    });
    renderPage();

    await waitFor(() => expect(screen.getByText(/referral discount applied.*3% off/i)).toBeTruthy());
    expect(screen.queryByText(/2\.5% off/i)).toBeNull();
  });

  it('does not show the discount banner when no code has been redeemed', async () => {
    hasRedeemedMock.mockReturnValue(false);
    renderPage();
    await waitFor(() => expect(screen.getAllByText('$49.99').length).toBeGreaterThan(0));
    expect(screen.queryByText(/referral discount applied/i)).toBeNull();
  });

  it('does not show the discount banner when user is already on safety_plus', async () => {
    setupGoldReferral();
    useTierMock.mockReturnValue({ currentTier: 'safety_plus', tiers: [], refreshTier });
    renderPage();
    await waitFor(() => expect(screen.getByText(/Plans/i)).toBeTruthy());
    expect(screen.queryByText(/referral discount applied/i)).toBeNull();
  });

  it('shows tier-discounted prices instead of default prices', async () => {
    setupGoldReferral();
    renderPage();
    await waitFor(() => expect(screen.getAllByText('$44.99').length).toBeGreaterThan(0));
  });

  it('shows strikethrough regular price next to the discounted price', async () => {
    setupGoldReferral();
    renderPage();
    await waitFor(() => expect(screen.getAllByText('$44.99').length).toBeGreaterThan(0));
    const regularPriceEls = screen.getAllByText('$49.99');
    const hasStrikethrough = regularPriceEls.some(
      (el) => el.classList.contains('line-through') || el.closest('.line-through')
    );
    expect(hasStrikethrough).toBe(true);
  });

  it('shows NO strikethrough when the offer price cannot be read', async () => {
    // Regression guard. A referral offering resolves (so hasDiscount is true)
    // but its offer price is unreadable, so the page falls back to the base
    // price. Striking through the identical base price would advertise a
    // saving of 0% as if it were a discount — the "$49.99 $49.99" bug.
    setupGoldReferral();
    offerPriceInfo.mockReturnValue(null);
    renderPage();

    await waitFor(() => expect(screen.getAllByText('$49.99').length).toBeGreaterThan(0));
    const struck = screen
      .getAllByText('$49.99')
      .some((el) => el.classList.contains('line-through') || el.closest('.line-through'));
    expect(struck).toBe(false);
  });

  it('purchasing with tier discount records attribution with discount_cents', async () => {
    setupGoldReferral();
    hasAttributedMock.mockReturnValue(false);
    purchasePackage.mockResolvedValue({});
    refreshTier.mockResolvedValue('safety_plus');
    recordAttribution.mockResolvedValue({});
    setReferralAttribute.mockResolvedValue(undefined);
    renderPage();
    await waitFor(() => expect(screen.getAllByText('$44.99').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: /upgrade/i }));
    await waitFor(() => expect(recordAttribution).toHaveBeenCalledWith('VYX-ABC123', 'annual', 4999, 500));
    expect(setReferralAttribute).toHaveBeenCalledWith('VYX-ABC123', 'gold');
    expect(markAttributedMock).toHaveBeenCalled();
  });

  it('does not record attribution when already attributed', async () => {
    setupGoldReferral();
    hasAttributedMock.mockReturnValue(true);
    purchasePackage.mockResolvedValue({});
    refreshTier.mockResolvedValue('safety_plus');
    renderPage();
    await waitFor(() => expect(screen.getAllByText('$44.99').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: /upgrade/i }));
    await waitFor(() => expect(purchasePackage).toHaveBeenCalled());
    expect(recordAttribution).not.toHaveBeenCalled();
  });

  it('falls back to default prices when referrer tier lookup fails', async () => {
    hasRedeemedMock.mockReturnValue(true);
    getRedeemedCodeMock.mockReturnValue('VYX-ABC123');
    fetchPaidCount.mockResolvedValue(null);
    renderPage();
    await waitFor(() => expect(screen.getAllByText('$49.99').length).toBeGreaterThan(0));
    expect(screen.queryByText(/referral discount applied/i)).toBeNull();
  });

  it('falls back to default prices when tier offering is unavailable', async () => {
    hasRedeemedMock.mockReturnValue(true);
    getRedeemedCodeMock.mockReturnValue('VYX-ABC123');
    fetchPaidCount.mockResolvedValue(5000);
    getTierMock.mockReturnValue('gold');
    getTierInfoMock.mockReturnValue({ key: 'gold', commission: 10, next: null });
    getOfferingIdForTierMock.mockReturnValue('referral-gold');
    getTierOffering.mockResolvedValue(null);
    renderPage();
    await waitFor(() => expect(screen.getAllByText('$49.99').length).toBeGreaterThan(0));
    expect(screen.queryByText(/referral discount applied/i)).toBeNull();
  });
});

// The global beforeEach marks the outcome preamble as already seen so the rest
// of this suite can test pricing directly. That convenience would quietly hide a
// regression in the preamble gating itself, so it is asserted here explicitly.
//
// ── UN-SKIP CONDITION MET (2026-07-28, PR #1422) ─────────────────────────
// PR #1418 skipped two of these and left an explicit instruction: "flip
// OUTCOME_PREAMBLE_ENABLED to true, then remove the .skip from both. The
// pairing is self-enforcing — the first test below fails the moment the flag
// flips, which is what forces a reader back to this block."
//
// PR #1422 removed the flag entirely (the preamble is live again), so that
// condition is met and all three are active. The tripwire fired exactly as
// designed: the first case went red on the flag flip and was rewritten to
// assert the preamble DOES render — not relaxed, which is what #1418 warned
// against. That is the whole block working as intended across two PRs.
//
// Why the two conditional cases are worth having back rather than deleted:
// with the flag off they passed vacuously — "seen" state and subscriber tier
// were both irrelevant when nothing could render — so they READ as coverage
// while exercising nothing. Now that the render is live they genuinely
// exercise `outcomeStep`'s useState initialiser (Subscription.jsx:123), which
// reads OUTCOME_SEEN_KEY and returns null for currentTier === 'safety_plus'.
//
// Keyed off the `outcome-step` testid rather than the step's COPY (#1418's
// change, kept): every case here used to match the sentence "they see a wallet
// that isn't yours", so a copy edit alone would have made them pass for a
// second wrong reason.
//
// Assertions are bidirectional on purpose — absence of the preamble alone would
// also pass if the page failed to render at all. '$0' is the Free tier's
// hardcoded price, literal in Subscription.jsx and rendered only after the
// preamble's early return; the '$5.99' used elsewhere in this file needs
// isNativePlatform + getOfferings mocks from another describe's beforeEach.
describe('Subscription page — outcome-first preamble gating', () => {
  beforeEach(() => {
    localStorage.removeItem('veyrnox-paywall-outcome-seen');
    useTierMock.mockReturnValue({ currentTier: 'none', refreshTier, loading: false });
  });

  // The case PR #1403 inverted: it was rewritten to assert the preamble does NOT
  // render, turning a regression guard into a description of the disable it had
  // just shipped. Restored to its real assertion now the feature is live again.
  // Third instance of that pattern in #1403 — the two WalletEntry kek-gate
  // consent cases were the others (#1409). "Align tests with the new flow" is a
  // review smell.
  it('shows the outcome preamble BEFORE pricing on a first visit', async () => {
    renderPage();
    expect(await screen.findByTestId('outcome-step')).toBeTruthy();
    // ...and the price is not on screen yet — the preamble returns early
    // Free-tier price renders through Intl.NumberFormat now — matches "$0"
    // and "$0.00" (en-US host default) while staying robust across locales.
    expect(screen.queryByText(/^\$0/)).toBeNull();
  });

  it('goes straight to pricing once the preamble has been seen', async () => {
    localStorage.setItem('veyrnox-paywall-outcome-seen', '1');
    renderPage();
    await waitFor(() => expect(screen.getByText(/^\$0/)).toBeTruthy());
    expect(screen.queryByTestId('outcome-step')).toBeNull();
  });

  it('never shows the preamble to an existing subscriber', async () => {
    useTierMock.mockReturnValue({ currentTier: 'safety_plus', refreshTier, loading: false });
    renderPage();
    await waitFor(() => expect(screen.queryByTestId('outcome-step')).toBeNull());
  });
});
