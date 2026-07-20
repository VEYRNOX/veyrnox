import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';

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
vi.mock('@/lib/purchases', () => ({
  getOfferings: (...a) => getOfferings(...a),
  getTierOffering: (...a) => getTierOffering(...a),
  purchasePackage: (...a) => purchasePackage(...a),
  restorePurchases: (...a) => restorePurchases(...a),
  manageSubscription: (...a) => manageSubscription(...a),
  setReferralAttribute: (...a) => setReferralAttribute(...a),
  SAFETY_PLUS_MONTHLY_PACKAGE: '$rc_monthly',
  SAFETY_PLUS_ANNUAL_PACKAGE: '$rc_annual',
}));

const hasRedeemedMock = vi.fn();
const getRedeemedCodeMock = vi.fn();
const hasAttributedMock = vi.fn();
const markAttributedMock = vi.fn();
const getTierMock = vi.fn();
const getTierInfoMock = vi.fn();
const getOfferingIdForTierMock = vi.fn();
const calculateDiscountCentsMock = vi.fn();
vi.mock('@/lib/referral', () => ({
  hasRedeemed: (...a) => hasRedeemedMock(...a),
  getRedeemedCode: (...a) => getRedeemedCodeMock(...a),
  hasAttributed: (...a) => hasAttributedMock(...a),
  markAttributed: (...a) => markAttributedMock(...a),
  getTier: (...a) => getTierMock(...a),
  getTierInfo: (...a) => getTierInfoMock(...a),
  getOfferingIdForTier: (...a) => getOfferingIdForTierMock(...a),
  calculateDiscountCents: (...a) => calculateDiscountCentsMock(...a),
  PLAN_FULL_PRICE_CENTS: { monthly: 599, annual: 4999 },
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
  hasRedeemedMock.mockReturnValue(false);
  getRedeemedCodeMock.mockReturnValue(null);
  hasAttributedMock.mockReturnValue(false);
  getTierMock.mockReturnValue('none');
  getTierInfoMock.mockReturnValue({ key: 'none', commission: 0, next: null });
  getOfferingIdForTierMock.mockReturnValue(null);
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
    }));
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
    }));
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
    }));
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
    }));
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

  it('clicking Manage subscription calls manageSubscription()', async () => {
    manageSubscription.mockResolvedValue(undefined);
    renderPage();
    const btn = await screen.findByRole('button', { name: /manage subscription/i });
    fireEvent.click(btn);
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
});

describe('Subscription page — tier-based referral discount', () => {
  const defaultPackages = [
    { identifier: '$rc_monthly', product: { priceString: '$5.99' } },
    { identifier: '$rc_annual', product: { priceString: '$49.99' } },
  ];
  const goldReferralPackages = [
    { identifier: '$rc_monthly', product: { priceString: '$5.39' } },
    { identifier: '$rc_annual', product: { priceString: '$44.99' } },
  ];

  function setupGoldReferral() {
    hasRedeemedMock.mockReturnValue(true);
    getRedeemedCodeMock.mockReturnValue('VYX-ABC123');
    fetchPaidCount.mockResolvedValue(5000);
    getTierMock.mockReturnValue('gold');
    getTierInfoMock.mockReturnValue({ key: 'gold', commission: 10, next: { key: 'platinum', min: 10000 } });
    getOfferingIdForTierMock.mockReturnValue('referral-gold');
    getTierOffering.mockResolvedValue({ availablePackages: goldReferralPackages });
  }

  beforeEach(() => {
    isNativePlatform.mockReturnValue(true);
    getOfferings.mockResolvedValue({ availablePackages: defaultPackages });
  });

  it('shows the discount banner with tier commission when referrer has a tier', async () => {
    setupGoldReferral();
    renderPage();
    await waitFor(() => expect(screen.getByText(/referral discount applied.*10% off/i)).toBeTruthy());
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
    expect(setReferralAttribute).toHaveBeenCalledWith('VYX-ABC123');
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
