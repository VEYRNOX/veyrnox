// checkIntroTrialEligibility gates the "free trial" copy on iOS. It must say
// yes ONLY on a positive ELIGIBLE answer, and must make no RevenueCat call at
// all in a decoy/demo session (I3) or off iOS.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getPlatform = vi.fn();
const isNativePlatform = vi.fn();
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNativePlatform(),
    getPlatform: () => getPlatform(),
  },
}));

const checkEligibility = vi.fn();
vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: { checkTrialOrIntroductoryPriceEligibility: (...a) => checkEligibility(...a) },
  LOG_LEVEL: { ERROR: 'ERROR' },
}));

const deniability = vi.fn();
vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: () => deniability(),
}));

const { checkIntroTrialEligibility } = await import('../introTrialEligibility.js');

const pkg = { product: { identifier: 'safety_plus_monthly' } };
const ELIGIBLE = 2;
const INELIGIBLE = 1;
const UNKNOWN = 0;
const NO_INTRO_OFFER = 3;

beforeEach(() => {
  vi.clearAllMocks();
  isNativePlatform.mockReturnValue(true);
  getPlatform.mockReturnValue('ios');
  deniability.mockReturnValue(false);
});

describe('checkIntroTrialEligibility', () => {
  it('is true only for status ELIGIBLE, asking about this package only', async () => {
    checkEligibility.mockResolvedValue({ safety_plus_monthly: { status: ELIGIBLE } });
    await expect(checkIntroTrialEligibility(pkg)).resolves.toBe(true);
    expect(checkEligibility).toHaveBeenCalledWith({ productIdentifiers: ['safety_plus_monthly'] });
  });

  it.each([
    ['ineligible', INELIGIBLE],
    ['unknown', UNKNOWN],
    ['no intro offer exists', NO_INTRO_OFFER],
  ])('is false when RevenueCat says %s', async (_n, status) => {
    checkEligibility.mockResolvedValue({ safety_plus_monthly: { status } });
    await expect(checkIntroTrialEligibility(pkg)).resolves.toBe(false);
  });

  it('is false when the result has no entry for the product', async () => {
    checkEligibility.mockResolvedValue({});
    await expect(checkIntroTrialEligibility(pkg)).resolves.toBe(false);
  });

  it('fails closed when RevenueCat rejects', async () => {
    checkEligibility.mockRejectedValue(new Error('network'));
    await expect(checkIntroTrialEligibility(pkg)).resolves.toBe(false);
  });

  it('makes no RevenueCat call in a deniability/demo session (I3)', async () => {
    deniability.mockReturnValue(true);
    await expect(checkIntroTrialEligibility(pkg)).resolves.toBe(false);
    expect(checkEligibility).not.toHaveBeenCalled();
  });

  it('makes no call on Android (the plugin always answers UNKNOWN there)', async () => {
    getPlatform.mockReturnValue('android');
    await expect(checkIntroTrialEligibility(pkg)).resolves.toBe(false);
    expect(checkEligibility).not.toHaveBeenCalled();
  });

  it('makes no call on web', async () => {
    isNativePlatform.mockReturnValue(false);
    getPlatform.mockReturnValue('web');
    await expect(checkIntroTrialEligibility(pkg)).resolves.toBe(false);
    expect(checkEligibility).not.toHaveBeenCalled();
  });

  it('is false, with no call, when the package has no product identifier', async () => {
    await expect(checkIntroTrialEligibility({ product: {} })).resolves.toBe(false);
    await expect(checkIntroTrialEligibility(null)).resolves.toBe(false);
    expect(checkEligibility).not.toHaveBeenCalled();
  });
});
