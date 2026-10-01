// loadSafetyPlusTrial feeds the dashboard nudge. It must return a trial only for
// a verified, eligible, non-referral purchase of the package /plans preselects
// (annual), and must swallow every failure into null so the nudge keeps its
// price-free copy (I4).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getOfferings = vi.fn();
vi.mock('@/lib/purchases', () => ({
  getOfferings: (...a) => getOfferings(...a),
  SAFETY_PLUS_ANNUAL_PACKAGE: '$rc_annual',
}));
const checkIntroTrialEligibility = vi.fn();
vi.mock('@/lib/introTrialEligibility', () => ({
  checkIntroTrialEligibility: (...a) => checkIntroTrialEligibility(...a),
}));

const { loadSafetyPlusTrial } = await import('../safetyPlusTrial.js');

const playPhase = { billingPeriod: { unit: 'DAY', value: 14 }, price: { amountMicros: 0 } };
const androidAnnual = {
  identifier: '$rc_annual',
  product: {
    identifier: 'safety_plus_annual',
    priceString: '$49.99',
    subscriptionOptions: [{ tags: ['free-trial-14d'], freePhase: playPhase }],
  },
};
const iosAnnual = {
  identifier: '$rc_annual',
  product: {
    identifier: 'safety_plus_annual',
    priceString: '$49.99',
    introPrice: { price: 0, cycles: 1, periodUnit: 'DAY', periodNumberOfUnits: 14 },
  },
};
const offering = (...pkgs) => ({ availablePackages: pkgs });

beforeEach(() => {
  vi.clearAllMocks();
  checkIntroTrialEligibility.mockResolvedValue(true);
});

describe('loadSafetyPlusTrial', () => {
  it('Android: returns days and the post-trial annual price', async () => {
    getOfferings.mockResolvedValue(offering(androidAnnual));
    await expect(loadSafetyPlusTrial({ platform: 'android', hasReferral: false }))
      .resolves.toEqual({ days: 14, priceString: '$49.99' });
    expect(checkIntroTrialEligibility).not.toHaveBeenCalled();
  });

  it('iOS: needs a positive eligibility answer', async () => {
    getOfferings.mockResolvedValue(offering(iosAnnual));
    await expect(loadSafetyPlusTrial({ platform: 'ios', hasReferral: false }))
      .resolves.toEqual({ days: 14, priceString: '$49.99' });
    checkIntroTrialEligibility.mockResolvedValue(false);
    await expect(loadSafetyPlusTrial({ platform: 'ios', hasReferral: false })).resolves.toBeNull();
  });

  it('is null for a user with a redeemed referral (that offer, not the trial, is what is bought)', async () => {
    getOfferings.mockResolvedValue(offering(androidAnnual));
    await expect(loadSafetyPlusTrial({ platform: 'android', hasReferral: true })).resolves.toBeNull();
    expect(getOfferings).not.toHaveBeenCalled();
  });

  it('is null when there is no offering (web, decoy/demo, offline)', async () => {
    getOfferings.mockResolvedValue(null);
    await expect(loadSafetyPlusTrial({ platform: 'android', hasReferral: false })).resolves.toBeNull();
  });

  it('is null when the annual package is missing — never substitutes another period', async () => {
    getOfferings.mockResolvedValue(offering({ ...androidAnnual, identifier: '$rc_monthly' }));
    await expect(loadSafetyPlusTrial({ platform: 'android', hasReferral: false })).resolves.toBeNull();
  });

  it('is null when the store reports no free phase', async () => {
    const noTrial = { ...androidAnnual, product: { ...androidAnnual.product, subscriptionOptions: [] } };
    getOfferings.mockResolvedValue(offering(noTrial));
    await expect(loadSafetyPlusTrial({ platform: 'android', hasReferral: false })).resolves.toBeNull();
  });

  it('swallows failures into null', async () => {
    getOfferings.mockRejectedValue(new Error('offline'));
    await expect(loadSafetyPlusTrial({ platform: 'android', hasReferral: false })).resolves.toBeNull();
  });
});
