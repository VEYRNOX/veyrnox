import { beforeEach, describe, expect, it, vi } from 'vitest';

const isNativePlatform = vi.fn(() => true);
const getPlatform = vi.fn(() => 'android');
const openUrlMock = vi.fn();
const getOfferingsMock = vi.fn();
const purchasePackageMock = vi.fn();
const restorePurchasesMock = vi.fn();
const getCustomerInfoMock = vi.fn();
const setAttributesMock = vi.fn();
const setLogLevelMock = vi.fn();
const samsungGetStatusMock = vi.fn(async () => ({ available: true, configured: false, store: 'GALAXY' }));
const samsungConfigureMock = vi.fn(async () => undefined);
const samsungAddListenerMock = vi.fn(async () => 'samsung-listener-1');
const samsungRemoveListenerMock = vi.fn(async () => ({ wasRemoved: true }));
let deniabilityActive = false;

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNativePlatform(),
    getPlatform: () => getPlatform(),
  },
  registerPlugin: () => ({
    getStatus: (...a) => samsungGetStatusMock(...a),
    configure: (...a) => samsungConfigureMock(...a),
    addCustomerInfoUpdateListener: (...a) => samsungAddListenerMock(...a),
    removeCustomerInfoUpdateListener: (...a) => samsungRemoveListenerMock(...a),
  }),
}));

vi.mock('@capacitor/app', () => ({
  App: {
    openUrl: (...a) => openUrlMock(...a),
  },
}));

vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: {
    setLogLevel: (...a) => setLogLevelMock(...a),
    getOfferings: (...a) => getOfferingsMock(...a),
    purchasePackage: (...a) => purchasePackageMock(...a),
    restorePurchases: (...a) => restorePurchasesMock(...a),
    getCustomerInfo: (...a) => getCustomerInfoMock(...a),
    setAttributes: (...a) => setAttributesMock(...a),
  },
  LOG_LEVEL: { ERROR: 'ERROR' },
}));

vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: () => deniabilityActive,
}));

const samsung = await import('../purchases/samsungPurchases.js');

beforeEach(() => {
  vi.clearAllMocks();
  deniabilityActive = false;
  isNativePlatform.mockReturnValue(true);
  getPlatform.mockReturnValue('android');
  vi.unstubAllEnvs();
});

describe('samsungPurchases', () => {
  it('configures RevenueCat for Galaxy billing with the Samsung API key', async () => {
    vi.stubEnv('VITE_REVENUECAT_SAMSUNG_API_KEY', 'samsung-key');
    vi.stubEnv('PROD', false);
    await samsung.configurePurchases();
    expect(samsungConfigureMock).toHaveBeenCalledWith({
      apiKey: 'samsung-key',
      billingMode: 'TEST',
    });
    expect(setLogLevelMock).not.toHaveBeenCalled();
  });

  it('returns null offerings in a deniability session without touching RevenueCat', async () => {
    deniabilityActive = true;
    await expect(samsung.getOfferings()).resolves.toBeNull();
    expect(getOfferingsMock).not.toHaveBeenCalled();
  });

  it('buys the plain package when no Samsung offer tag is requested', async () => {
    const pkg = { identifier: '$rc_monthly' };
    purchasePackageMock.mockResolvedValue({ customerInfo: { entitlements: { active: {} } } });
    await expect(samsung.purchasePackage(pkg)).resolves.toEqual({ entitlements: { active: {} } });
    expect(purchasePackageMock).toHaveBeenCalledWith({ aPackage: pkg });
  });

  it('fails closed when a referral or retention offer tag is requested on Samsung', async () => {
    const pkg = {
      identifier: '$rc_monthly',
      product: {
        subscriptionOptions: [{ id: 'opt1', tags: ['referral-gold'] }],
      },
    };
    await expect(
      samsung.purchasePackage(pkg, { offerTag: 'referral-gold' })
    ).rejects.toMatchObject({ code: 'OFFER_UNAVAILABLE' });
    expect(purchasePackageMock).not.toHaveBeenCalled();
  });

  it('registers and unregisters Samsung customer-info listeners through the native bridge', async () => {
    const unsubscribe = await samsung.addCustomerInfoUpdateListener(() => {});
    expect(samsungAddListenerMock).toHaveBeenCalled();
    await unsubscribe();
    expect(samsungRemoveListenerMock).toHaveBeenCalledWith({ listenerToRemove: 'samsung-listener-1' });
  });

  it('opens the Galaxy Store subscription page', async () => {
    await samsung.manageSubscription();
    expect(openUrlMock).toHaveBeenCalledWith({
      url: 'https://galaxystore.samsung.com/mypage/subscriptions',
    });
  });
});
