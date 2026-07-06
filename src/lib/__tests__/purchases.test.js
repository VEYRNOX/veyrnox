// src/lib/__tests__/purchases.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const isNativePlatform = vi.fn();
const getPlatform = vi.fn();
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNativePlatform(),
    getPlatform: () => getPlatform(),
  },
}));

const configure = vi.fn();
const getOfferingsMock = vi.fn();
const purchasePackageMock = vi.fn();
const restorePurchasesMock = vi.fn();
const getCustomerInfoMock = vi.fn();
const addCustomerInfoUpdateListenerMock = vi.fn();
const removeCustomerInfoUpdateListenerMock = vi.fn();
vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: {
    configure,
    getOfferings: getOfferingsMock,
    purchasePackage: purchasePackageMock,
    restorePurchases: restorePurchasesMock,
    getCustomerInfo: getCustomerInfoMock,
    addCustomerInfoUpdateListener: addCustomerInfoUpdateListenerMock,
    removeCustomerInfoUpdateListener: removeCustomerInfoUpdateListenerMock,
  },
}));

const {
  SAFETY_PLUS_ENTITLEMENT,
  configurePurchases,
  getOfferings,
  purchasePackage,
  restorePurchases,
  getCustomerInfo,
  addCustomerInfoUpdateListener,
} = await import('../purchases');

beforeEach(() => {
  vi.clearAllMocks();
  isNativePlatform.mockReturnValue(false);
  getPlatform.mockReturnValue('web');
});

describe('purchases.js — web (no App Store / Play Store)', () => {
  it('getOfferings resolves null without calling the plugin', async () => {
    expect(await getOfferings()).toBeNull();
    expect(getOfferingsMock).not.toHaveBeenCalled();
  });

  it('getCustomerInfo resolves null without calling the plugin', async () => {
    expect(await getCustomerInfo()).toBeNull();
    expect(getCustomerInfoMock).not.toHaveBeenCalled();
  });

  it('purchasePackage throws PURCHASES_NATIVE_ONLY', async () => {
    await expect(purchasePackage({})).rejects.toThrow('PURCHASES_NATIVE_ONLY');
  });

  it('restorePurchases throws PURCHASES_NATIVE_ONLY', async () => {
    await expect(restorePurchases()).rejects.toThrow('PURCHASES_NATIVE_ONLY');
  });

  it('addCustomerInfoUpdateListener resolves a no-op unsubscribe', async () => {
    const unsubscribe = await addCustomerInfoUpdateListener(() => {});
    expect(() => unsubscribe()).not.toThrow();
    expect(addCustomerInfoUpdateListenerMock).not.toHaveBeenCalled();
  });
});

describe('purchases.js — native', () => {
  beforeEach(() => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue('ios');
  });

  it('configurePurchases calls Purchases.configure with the iOS key on iOS', async () => {
    vi.stubEnv('VITE_REVENUECAT_APPLE_API_KEY', 'ios-key');
    await configurePurchases();
    expect(configure).toHaveBeenCalledWith({ apiKey: expect.any(String) });
  });

  it('getOfferings returns the current offering from the plugin', async () => {
    getOfferingsMock.mockResolvedValue({ current: { identifier: 'default' }, all: {} });
    expect(await getOfferings()).toEqual({ identifier: 'default' });
  });

  it('purchasePackage returns customerInfo from the plugin', async () => {
    purchasePackageMock.mockResolvedValue({ customerInfo: { entitlements: { active: {} } } });
    const info = await purchasePackage({ identifier: '$rc_monthly' });
    expect(info).toEqual({ entitlements: { active: {} } });
    expect(purchasePackageMock).toHaveBeenCalledWith({ aPackage: { identifier: '$rc_monthly' } });
  });

  it('restorePurchases returns customerInfo from the plugin', async () => {
    restorePurchasesMock.mockResolvedValue({ customerInfo: { entitlements: { active: { safety_plus: {} } } } });
    const info = await restorePurchases();
    expect(info.entitlements.active[SAFETY_PLUS_ENTITLEMENT]).toBeDefined();
  });

  it('getCustomerInfo returns customerInfo from the plugin', async () => {
    getCustomerInfoMock.mockResolvedValue({ customerInfo: { entitlements: { active: {} } } });
    expect(await getCustomerInfo()).toEqual({ entitlements: { active: {} } });
  });

  it('addCustomerInfoUpdateListener registers with the plugin and resolves a real unsubscribe', async () => {
    addCustomerInfoUpdateListenerMock.mockResolvedValue('callback-id-123');
    removeCustomerInfoUpdateListenerMock.mockResolvedValue({ wasRemoved: true });
    const unsubscribe = await addCustomerInfoUpdateListener(() => {});
    expect(addCustomerInfoUpdateListenerMock).toHaveBeenCalled();
    await unsubscribe();
    expect(removeCustomerInfoUpdateListenerMock).toHaveBeenCalledWith({ listenerToRemove: 'callback-id-123' });
  });
});
