// @ts-nocheck
// Guards Google Play offer SELECTION.
//
// Context, because this is easy to "simplify" into a live pricing bug:
// all five Veyrnox offers (four referral tiers + the cancel-save retention
// offer) sit on the SAME base plan. RevenueCat does not pick one for us — and
// every offer carries the `rc-ignore-offer` tag precisely so the SDK will NOT
// auto-apply one to a full-price subscriber. So a discount exists only if the
// app names it by tag.
//
// The failure this prevents: purchasing the package without naming an option
// after showing a discounted price. The store then decides which offer applies
// (or none), and the customer is charged something other than what they saw —
// silently, discoverable only on their statement.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const purchasePackageMock = vi.fn();
const purchaseSubscriptionOptionMock = vi.fn();

vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: {
    purchasePackage: (...a) => purchasePackageMock(...a),
    purchaseSubscriptionOption: (...a) => purchaseSubscriptionOptionMock(...a),
    setLogLevel: vi.fn(),
    configure: vi.fn(),
  },
  LOG_LEVEL: { ERROR: 'ERROR' },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}));

const { findOfferOption, purchasePackage, OFFER_UNAVAILABLE } =
  await import('../purchases');

function pkgWithOptions(...optionTags) {
  return {
    identifier: '$rc_monthly',
    product: {
      priceString: '$5.39',
      subscriptionOptions: optionTags.map((tags, i) => ({
        id: `monthly:opt${i}`,
        tags,
      })),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  purchasePackageMock.mockResolvedValue({ customerInfo: { ok: true } });
  purchaseSubscriptionOptionMock.mockResolvedValue({ customerInfo: { ok: true } });
});

describe('findOfferOption', () => {
  it('finds the option carrying the requested tag', () => {
    const pkg = pkgWithOptions(['referral-bronze'], ['referral-gold'], ['retention']);
    expect(findOfferOption(pkg, 'referral-gold').id).toBe('monthly:opt1');
  });

  it('returns null when no option carries the tag', () => {
    const pkg = pkgWithOptions(['referral-bronze'], ['retention']);
    expect(findOfferOption(pkg, 'referral-platinum')).toBeNull();
  });

  it('returns null for a package with no subscriptionOptions (iOS / sideload)', () => {
    expect(findOfferOption({ product: {} }, 'referral-gold')).toBeNull();
    expect(findOfferOption(null, 'referral-gold')).toBeNull();
  });

  it('returns null when no tag is requested — full price is not an offer', () => {
    expect(findOfferOption(pkgWithOptions(['retention']), null)).toBeNull();
  });

  it('ignores the rc-ignore-offer marker when matching', () => {
    // Real offers carry BOTH their identity tag and rc-ignore-offer.
    const pkg = pkgWithOptions(['referral-silver', 'rc-ignore-offer']);
    expect(findOfferOption(pkg, 'referral-silver')).toBeTruthy();
  });
});

describe('purchasePackage — offer selection', () => {
  it('purchases the named subscription option, not the bare package', async () => {
    const pkg = pkgWithOptions(['referral-bronze'], ['referral-gold', 'rc-ignore-offer']);
    await purchasePackage(pkg, { offerTag: 'referral-gold' });

    expect(purchaseSubscriptionOptionMock).toHaveBeenCalledWith({
      subscriptionOption: expect.objectContaining({ id: 'monthly:opt1' }),
    });
    expect(purchasePackageMock).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED when the promised offer is missing — never charges full price', async () => {
    const pkg = pkgWithOptions(['referral-bronze']);
    await expect(
      purchasePackage(pkg, { offerTag: 'referral-platinum' })
    ).rejects.toMatchObject({ code: OFFER_UNAVAILABLE });

    // the critical assertion: no purchase of any kind was attempted
    expect(purchasePackageMock).not.toHaveBeenCalled();
    expect(purchaseSubscriptionOptionMock).not.toHaveBeenCalled();
  });

  it('fails closed when the product exposes no options at all', async () => {
    await expect(
      purchasePackage({ product: {} }, { offerTag: 'retention' })
    ).rejects.toMatchObject({ code: OFFER_UNAVAILABLE });
    expect(purchasePackageMock).not.toHaveBeenCalled();
  });

  it('buys the plain package when no offer is requested', async () => {
    const pkg = pkgWithOptions(['retention']);
    await purchasePackage(pkg);

    expect(purchasePackageMock).toHaveBeenCalledWith({ aPackage: pkg });
    expect(purchaseSubscriptionOptionMock).not.toHaveBeenCalled();
  });

  it('a full-price sale is unaffected by offers existing on the base plan', async () => {
    // Regression guard: the offers sit on the same base plan as the default
    // $5.99 package. Buying at full price must not accidentally select one.
    const pkg = pkgWithOptions(['retention', 'rc-ignore-offer'], ['referral-gold']);
    await purchasePackage(pkg, { offerTag: null });

    expect(purchasePackageMock).toHaveBeenCalledWith({ aPackage: pkg });
    expect(purchaseSubscriptionOptionMock).not.toHaveBeenCalled();
  });
});
