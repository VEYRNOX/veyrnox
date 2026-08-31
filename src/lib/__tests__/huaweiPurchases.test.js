import { beforeEach, describe, expect, it, vi } from 'vitest';

const isNativePlatform = vi.fn(() => true);
const getPlatform = vi.fn(() => 'android');
const huaweiGetStatusMock = vi.fn(async () => ({ available: true, configured: true, store: 'APP_GALLERY' }));
const huaweiConfigureMock = vi.fn(async () => undefined);
const huaweiGetProductsMock = vi.fn();
const huaweiPurchaseSubscriptionMock = vi.fn();
const huaweiRestorePurchasesMock = vi.fn();
const huaweiGetCustomerInfoMock = vi.fn();
const huaweiAddListenerMock = vi.fn(async () => 'huawei-listener-1');
const huaweiRemoveListenerMock = vi.fn(async () => ({ wasRemoved: true }));
let deniabilityActive = false;

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNativePlatform(),
    getPlatform: () => getPlatform(),
  },
  registerPlugin: () => ({
    getStatus: (...a) => huaweiGetStatusMock(...a),
    configure: (...a) => huaweiConfigureMock(...a),
    getProducts: (...a) => huaweiGetProductsMock(...a),
    purchaseSubscription: (...a) => huaweiPurchaseSubscriptionMock(...a),
    restorePurchases: (...a) => huaweiRestorePurchasesMock(...a),
    getCustomerInfo: (...a) => huaweiGetCustomerInfoMock(...a),
    addCustomerInfoUpdateListener: (...a) => huaweiAddListenerMock(...a),
    removeCustomerInfoUpdateListener: (...a) => huaweiRemoveListenerMock(...a),
    manageSubscriptions: vi.fn(async () => undefined),
  }),
}));

vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: () => deniabilityActive,
}));

const huawei = await import('../purchases/huaweiPurchases.js');

beforeEach(() => {
  vi.clearAllMocks();
  deniabilityActive = false;
  isNativePlatform.mockReturnValue(true);
  getPlatform.mockReturnValue('android');
  vi.unstubAllEnvs();
});

describe('huaweiPurchases', () => {
  it('configures once when the Huawei plugin is available', async () => {
    await huawei.configurePurchases();
    expect(huaweiConfigureMock).toHaveBeenCalledTimes(1);
  });

  it('returns null offerings in a deniability session without hitting HMS', async () => {
    deniabilityActive = true;
    await expect(huawei.getOfferings()).resolves.toBeNull();
    expect(huaweiGetProductsMock).not.toHaveBeenCalled();
  });

  it('maps Safety Plus AppGallery products into offering packages', async () => {
    huaweiGetProductsMock.mockResolvedValue({
      products: [
        {
          productId: 'safety_plus_monthly',
          price: '£5.99',
          microsPrice: 5_990_000,
          currency: 'GBP',
          productName: 'Safety Plus Monthly',
          productDesc: 'Monthly plan',
        },
        {
          productId: 'safety_plus_annual',
          price: '£49.99',
          microsPrice: 49_990_000,
          currency: 'GBP',
          productName: 'Safety Plus Annual',
          productDesc: 'Annual plan',
        },
      ],
    });
    const offering = await huawei.getOfferings();
    expect(huaweiGetProductsMock).toHaveBeenCalledWith({
      productIds: ['safety_plus_monthly', 'safety_plus_annual'],
      priceType: 2,
    });
    expect(offering.availablePackages).toEqual([
      {
        identifier: '$rc_monthly',
        packageType: '$rc_monthly',
        product: {
          identifier: 'safety_plus_monthly',
          productIdentifier: 'safety_plus_monthly',
          id: 'safety_plus_monthly',
          title: 'Safety Plus Monthly',
          description: 'Monthly plan',
          priceString: '£5.99',
          price: 5.99,
          currencyCode: 'GBP',
          subscriptionOptions: null,
          discounts: null,
        },
      },
      {
        identifier: '$rc_annual',
        packageType: '$rc_annual',
        product: {
          identifier: 'safety_plus_annual',
          productIdentifier: 'safety_plus_annual',
          id: 'safety_plus_annual',
          title: 'Safety Plus Annual',
          description: 'Annual plan',
          priceString: '£49.99',
          price: 49.99,
          currencyCode: 'GBP',
          subscriptionOptions: null,
          discounts: null,
        },
      },
    ]);
  });

  it('returns the AI offering only for the configured AI offering id', async () => {
    vi.stubEnv('VITE_RC_AI_SECURITY_PROTECTION_OFFERING_ID', 'ai-pro');
    huaweiGetProductsMock.mockResolvedValue({
      products: [
        {
          productId: 'ai_security_protection_monthly',
          price: '£19.99',
          microsPrice: 19_990_000,
          currency: 'GBP',
          productName: 'AI Monthly',
          productDesc: 'Monthly AI plan',
        },
      ],
    });
    const offering = await huawei.getTierOffering('ai-pro');
    expect(offering.identifier).toBe('ai-pro');
    expect(offering.availablePackages[0].identifier).toBe('$rc_monthly');
    await expect(huawei.getTierOffering('referral-gold')).resolves.toBeNull();
  });

  it('purchases the plain Huawei package by product identifier', async () => {
    const pkg = {
      identifier: '$rc_monthly',
      product: { identifier: 'safety_plus_monthly' },
    };
    huaweiPurchaseSubscriptionMock.mockResolvedValue({
      customerInfo: {
        entitlements: { active: { safety_plus: { productIdentifier: 'safety_plus_monthly', isActive: true } } },
      },
    });
    await expect(huawei.purchasePackage(pkg)).resolves.toEqual({
      entitlements: { active: { safety_plus: { identifier: 'safety_plus', productIdentifier: 'safety_plus_monthly', isActive: true } } },
    });
    expect(huaweiPurchaseSubscriptionMock).toHaveBeenCalledWith({
      productId: 'safety_plus_monthly',
      priceType: 2,
    });
  });

  it('fails closed when a referral or retention offer tag is requested on Huawei', async () => {
    const pkg = {
      identifier: '$rc_monthly',
      product: {
        identifier: 'safety_plus_monthly',
        subscriptionOptions: [{ id: 'opt1', tags: ['referral-gold'] }],
      },
    };
    await expect(
      huawei.purchasePackage(pkg, { offerTag: 'referral-gold' })
    ).rejects.toMatchObject({ code: 'OFFER_UNAVAILABLE' });
    expect(huaweiPurchaseSubscriptionMock).not.toHaveBeenCalled();
  });

  it('normalizes listener payloads to the customerInfo shape', async () => {
    const callback = vi.fn();
    // Capacitor's RETURN_CALLBACK proxy is `(options, callback)` — the listener
    // is the SECOND argument. Passing it first only worked via a deprecated
    // shim in native-bridge.js that warns on every registration.
    huaweiAddListenerMock.mockImplementation(async (_options, listener) => {
      listener({
        customerInfo: {
          entitlements: { active: { ai_security_protection: { isActive: true, productIdentifier: 'ai_security_protection_monthly' } } },
        },
      });
      return 'huawei-listener-1';
    });
    const unsubscribe = await huawei.addCustomerInfoUpdateListener(callback);
    expect(huaweiAddListenerMock).toHaveBeenCalledWith({}, expect.any(Function));
    expect(callback).toHaveBeenCalledWith({
      entitlements: {
        active: {
          ai_security_protection: {
            identifier: 'ai_security_protection',
            isActive: true,
            productIdentifier: 'ai_security_protection_monthly',
          },
        },
      },
    });
    await unsubscribe();
    expect(huaweiRemoveListenerMock).toHaveBeenCalledWith({ listenerToRemove: 'huawei-listener-1' });
  });

  it('restorePurchases returns normalized customer info', async () => {
    huaweiRestorePurchasesMock.mockResolvedValue({
      customerInfo: {
        entitlements: { active: { safety_plus: { isActive: true, productIdentifier: 'safety_plus_annual' } } },
      },
    });
    await expect(huawei.restorePurchases()).resolves.toEqual({
      entitlements: {
        active: {
          safety_plus: {
            identifier: 'safety_plus',
            isActive: true,
            productIdentifier: 'safety_plus_annual',
          },
        },
      },
    });
  });
});
