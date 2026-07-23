// @ts-nocheck
// Guards App Store promotional-offer SELECTION — the iOS twin of
// purchases.offers.test.js.
//
// iOS and Android are not the same mechanism and cannot share a code path:
//   Android — `product.subscriptionOptions[]`, matched by TAG, bought with
//             purchaseSubscriptionOption. `discounts` is null on Android.
//   iOS     — `product.discounts[]`, matched by IDENTIFIER, signed by
//             RevenueCat via getPromotionalOffer, then bought with
//             purchaseDiscountedPackage. `subscriptionOptions` is Android-only.
//
// The identifiers also differ by construction. App Store Connect scopes offer
// identifiers to the whole SUBSCRIPTION GROUP and rejects hyphens, so the offer
// behind the `referral-bronze` offering is `referral_bronze_monthly` on the
// monthly product and `referral_bronze_annual` on the annual one. Mapping the
// wrong way round would apply an annual discount to a monthly purchase.
//
// Every failure here must fail CLOSED: a purchase that doesn't happen is
// strictly better than one charged at a price the customer was not shown.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const purchasePackageMock = vi.fn();
const purchaseSubscriptionOptionMock = vi.fn();
const purchaseDiscountedPackageMock = vi.fn();
const getPromotionalOfferMock = vi.fn();

vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: {
    purchasePackage: (...a) => purchasePackageMock(...a),
    purchaseSubscriptionOption: (...a) => purchaseSubscriptionOptionMock(...a),
    purchaseDiscountedPackage: (...a) => purchaseDiscountedPackageMock(...a),
    getPromotionalOffer: (...a) => getPromotionalOfferMock(...a),
    setLogLevel: vi.fn(),
    configure: vi.fn(),
  },
  LOG_LEVEL: { ERROR: 'ERROR' },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
}));

const {
  appleOfferIdFor,
  findAppleDiscount,
  offerPriceInfo,
  purchasePackage,
  OFFER_UNAVAILABLE,
} = await import('../purchases');

function iosPkg(identifier, discountIds) {
  return {
    identifier,
    product: {
      identifier: identifier === '$rc_annual' ? 'safety_plus_annual' : 'safety_plus_monthly',
      priceString: identifier === '$rc_annual' ? '$49.99' : '$5.99',
      // Apple products expose `discounts`; `subscriptionOptions` is Android-only.
      subscriptionOptions: null,
      discounts: discountIds.map((identifier) => ({
        identifier,
        price: 5.09,
        priceString: '$5.09',
        cycles: 12,
      })),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  purchasePackageMock.mockResolvedValue({ customerInfo: { ok: true } });
  purchaseDiscountedPackageMock.mockResolvedValue({ customerInfo: { ok: true } });
  getPromotionalOfferMock.mockImplementation(({ discount }) =>
    Promise.resolve({ identifier: discount.identifier, signature: 'sig', keyIdentifier: 'k' })
  );
});

describe('appleOfferIdFor — offering id + package → App Store offer identifier', () => {
  it('maps each referral tier to its monthly identifier', () => {
    const m = (id) => appleOfferIdFor(id, { identifier: '$rc_monthly' });
    expect(m('referral-bronze')).toBe('referral_bronze_monthly');
    expect(m('referral-silver')).toBe('referral_silver_monthly');
    expect(m('referral-gold')).toBe('referral_gold_monthly');
    expect(m('referral-platinum')).toBe('referral_platinum_monthly');
  });

  it('maps each referral tier to its annual identifier', () => {
    const a = (id) => appleOfferIdFor(id, { identifier: '$rc_annual' });
    expect(a('referral-bronze')).toBe('referral_bronze_annual');
    expect(a('referral-silver')).toBe('referral_silver_annual');
    expect(a('referral-gold')).toBe('referral_gold_annual');
    expect(a('referral-platinum')).toBe('referral_platinum_annual');
  });

  it('maps the retention offering to its asymmetric identifiers', () => {
    // The monthly retention offer was created first and took the unsuffixed
    // id; Apple then refused to reuse it group-wide, so annual is suffixed.
    // This asymmetry is real store state — not a naming slip to "tidy up".
    expect(appleOfferIdFor('retention', { identifier: '$rc_monthly' })).toBe('retention_50');
    expect(appleOfferIdFor('retention', { identifier: '$rc_annual' })).toBe('retention_50_annual');
  });

  it('returns null for an unknown offering rather than guessing an identifier', () => {
    expect(appleOfferIdFor('referral-diamond', { identifier: '$rc_monthly' })).toBeNull();
    expect(appleOfferIdFor(null, { identifier: '$rc_monthly' })).toBeNull();
  });

  it('returns null for an unrecognised package — never defaults to a duration', () => {
    // Defaulting to monthly here would let an annual purchase pick up a
    // monthly-priced offer identifier, which Apple would reject or mis-price.
    expect(appleOfferIdFor('referral-gold', { identifier: '$rc_weekly' })).toBeNull();
    expect(appleOfferIdFor('referral-gold', {})).toBeNull();
    expect(appleOfferIdFor('referral-gold', null)).toBeNull();
  });
});

describe('findAppleDiscount', () => {
  it('finds the discount whose identifier matches exactly', () => {
    const pkg = iosPkg('$rc_monthly', ['referral_bronze_monthly', 'referral_gold_monthly']);
    expect(findAppleDiscount(pkg, 'referral_gold_monthly').identifier).toBe('referral_gold_monthly');
  });

  it('does not prefix- or substring-match a different offer', () => {
    // `retention_50` is a strict prefix of `retention_50_annual`. A loose match
    // would silently apply a 3-month monthly discount to an annual purchase.
    const pkg = iosPkg('$rc_annual', ['retention_50_annual']);
    expect(findAppleDiscount(pkg, 'retention_50')).toBeNull();
  });

  it('returns null when the product carries no discounts (Android, or none configured)', () => {
    expect(findAppleDiscount({ product: { discounts: null } }, 'retention_50')).toBeNull();
    expect(findAppleDiscount({ product: {} }, 'retention_50')).toBeNull();
    expect(findAppleDiscount(null, 'retention_50')).toBeNull();
  });

  it('returns null when no identifier is requested — full price is not an offer', () => {
    const pkg = iosPkg('$rc_monthly', ['retention_50']);
    expect(findAppleDiscount(pkg, null)).toBeNull();
  });
});

describe('offerPriceInfo on iOS', () => {
  it('reads the price from the matching discount, not the base product', () => {
    // The regression this locks: `product.priceString` is $5.99 for BOTH the
    // referral package and the full-price package — they wrap the same
    // product. Reading it produced "$5.99 struck through, $5.99" in the UI.
    const pkg = iosPkg('$rc_monthly', ['referral_platinum_monthly']);
    pkg.product.discounts[0].price = 5.09;
    pkg.product.discounts[0].priceString = '$5.09';

    expect(offerPriceInfo(pkg, 'referral-platinum')).toEqual({
      priceString: '$5.09',
      price: 5.09,
    });
    expect(pkg.product.priceString).toBe('$5.99'); // base price left alone
  });

  it('returns null when the offering has no offer on this product', () => {
    const pkg = iosPkg('$rc_monthly', ['referral_bronze_monthly']);
    expect(offerPriceInfo(pkg, 'referral-gold')).toBeNull();
  });

  it('returns null rather than falling back to the base price', () => {
    const pkg = iosPkg('$rc_monthly', ['referral_gold_monthly']);
    pkg.product.discounts[0].priceString = null;
    expect(offerPriceInfo(pkg, 'referral-gold')).toBeNull();
  });

  it('returns null for missing arguments', () => {
    expect(offerPriceInfo(null, 'retention')).toBeNull();
    expect(offerPriceInfo(iosPkg('$rc_monthly', ['retention_50']), null)).toBeNull();
  });
});

describe('purchasePackage on iOS — promotional offers', () => {
  it('signs the discount and buys the discounted package', async () => {
    const pkg = iosPkg('$rc_monthly', ['referral_gold_monthly']);
    await purchasePackage(pkg, { offerTag: 'referral-gold' });

    expect(getPromotionalOfferMock).toHaveBeenCalledWith({
      product: pkg.product,
      discount: expect.objectContaining({ identifier: 'referral_gold_monthly' }),
    });
    expect(purchaseDiscountedPackageMock).toHaveBeenCalledWith({
      aPackage: pkg,
      discount: expect.objectContaining({ signature: 'sig' }),
    });
    expect(purchasePackageMock).not.toHaveBeenCalled();
  });

  it('picks the ANNUAL identifier for an annual package', async () => {
    const pkg = iosPkg('$rc_annual', ['referral_platinum_annual']);
    await purchasePackage(pkg, { offerTag: 'referral-platinum' });

    expect(getPromotionalOfferMock).toHaveBeenCalledWith({
      product: pkg.product,
      discount: expect.objectContaining({ identifier: 'referral_platinum_annual' }),
    });
  });

  it('never uses the Android tag path on iOS', async () => {
    const pkg = iosPkg('$rc_monthly', ['retention_50']);
    await purchasePackage(pkg, { offerTag: 'retention' });
    expect(purchaseSubscriptionOptionMock).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED when the promised offer is not on the product', async () => {
    const pkg = iosPkg('$rc_monthly', ['referral_bronze_monthly']);
    await expect(
      purchasePackage(pkg, { offerTag: 'referral-platinum' })
    ).rejects.toMatchObject({ code: OFFER_UNAVAILABLE });

    expect(getPromotionalOfferMock).not.toHaveBeenCalled();
    expect(purchaseDiscountedPackageMock).not.toHaveBeenCalled();
    expect(purchasePackageMock).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED when signing returns nothing — no silent full-price fallback', async () => {
    // getPromotionalOffer resolves `undefined` if RevenueCat cannot sign the
    // offer (e.g. the In-App Purchase key is missing or revoked). Falling
    // through to purchasePackage here would charge the FULL price after the
    // paywall showed a discount.
    getPromotionalOfferMock.mockResolvedValue(undefined);
    const pkg = iosPkg('$rc_monthly', ['referral_gold_monthly']);

    await expect(
      purchasePackage(pkg, { offerTag: 'referral-gold' })
    ).rejects.toMatchObject({ code: OFFER_UNAVAILABLE });
    expect(purchaseDiscountedPackageMock).not.toHaveBeenCalled();
    expect(purchasePackageMock).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED when signing rejects', async () => {
    getPromotionalOfferMock.mockRejectedValue(new Error('network'));
    const pkg = iosPkg('$rc_monthly', ['referral_gold_monthly']);

    await expect(
      purchasePackage(pkg, { offerTag: 'referral-gold' })
    ).rejects.toMatchObject({ code: OFFER_UNAVAILABLE });
    expect(purchasePackageMock).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED for an offering with no App Store mapping', async () => {
    const pkg = iosPkg('$rc_monthly', ['referral_gold_monthly']);
    await expect(
      purchasePackage(pkg, { offerTag: 'referral-diamond' })
    ).rejects.toMatchObject({ code: OFFER_UNAVAILABLE });
    expect(purchasePackageMock).not.toHaveBeenCalled();
  });

  it('buys the plain package at full price when no offer is requested', async () => {
    const pkg = iosPkg('$rc_monthly', ['retention_50', 'referral_gold_monthly']);
    await purchasePackage(pkg);

    expect(purchasePackageMock).toHaveBeenCalledWith({ aPackage: pkg });
    expect(getPromotionalOfferMock).not.toHaveBeenCalled();
    expect(purchaseDiscountedPackageMock).not.toHaveBeenCalled();
  });
});
