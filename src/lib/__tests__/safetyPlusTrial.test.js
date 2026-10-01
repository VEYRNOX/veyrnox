// loadSafetyPlusTrial feeds the dashboard nudge. It must return a trial only for
// a verified, eligible, non-referral purchase of the package /plans preselects
// (annual), and must swallow every failure into null so the nudge keeps its
// price-free copy (I4).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getOfferings = vi.fn();
vi.mock('@/lib/purchases', () => ({
  getOfferings: (...a) => getOfferings(...a),
  SAFETY_PLUS_ANNUAL_PACKAGE: '$rc_annual',
}));
const checkIntroTrialEligibility = vi.fn();
vi.mock('@/lib/introTrialEligibility', () => ({
  checkIntroTrialEligibility: (...a) => checkIntroTrialEligibility(...a),
}));

const { loadSafetyPlusTrial, loadSafetyPlusTrialWithin } = await import('../safetyPlusTrial.js');

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

// A surface that is about to appear must not wait on the store forever, and must
// not claim "free" on a late answer: past the budget the answer is "no trial".
describe('loadSafetyPlusTrialWithin', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const args = { platform: 'android', hasReferral: false };

  it('returns the trial when the store answers inside the budget', async () => {
    getOfferings.mockResolvedValue(offering(androidAnnual));
    await expect(loadSafetyPlusTrialWithin(1200, args)).resolves.toEqual({ days: 14, priceString: '$49.99' });
  });

  it('returns null, not the trial, when the store answers after the budget', async () => {
    getOfferings.mockReturnValue(new Promise((resolve) => setTimeout(() => resolve(offering(androidAnnual)), 5000)));
    const result = loadSafetyPlusTrialWithin(1200, args);
    await vi.advanceTimersByTimeAsync(1200);
    await expect(result).resolves.toBeNull();
  });

  it('returns null when the store never answers', async () => {
    getOfferings.mockReturnValue(new Promise(() => {}));
    const result = loadSafetyPlusTrialWithin(1200, args);
    await vi.advanceTimersByTimeAsync(1200);
    await expect(result).resolves.toBeNull();
  });

  it('does not leave its timer running once the store has answered', async () => {
    getOfferings.mockResolvedValue(offering(androidAnnual));
    await loadSafetyPlusTrialWithin(1200, args);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('passes the referral flag through, so a referred user gets no claim', async () => {
    getOfferings.mockResolvedValue(offering(androidAnnual));
    await expect(loadSafetyPlusTrialWithin(1200, { platform: 'android', hasReferral: true })).resolves.toBeNull();
    expect(getOfferings).not.toHaveBeenCalled();
  });
});
