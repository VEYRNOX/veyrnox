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
const setLogLevelMock = vi.fn();
const getOfferingsMock = vi.fn();
const purchasePackageMock = vi.fn();
const restorePurchasesMock = vi.fn();
const getCustomerInfoMock = vi.fn();
const addCustomerInfoUpdateListenerMock = vi.fn();
const removeCustomerInfoUpdateListenerMock = vi.fn();
vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: {
    configure,
    setLogLevel: setLogLevelMock,
    getOfferings: getOfferingsMock,
    purchasePackage: purchasePackageMock,
    restorePurchases: restorePurchasesMock,
    getCustomerInfo: getCustomerInfoMock,
    addCustomerInfoUpdateListener: addCustomerInfoUpdateListenerMock,
    removeCustomerInfoUpdateListener: removeCustomerInfoUpdateListenerMock,
  },
  LOG_LEVEL: { VERBOSE: 'VERBOSE', DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' },
}));

const openUrlMock = vi.fn();
vi.mock('@capacitor/app', () => ({
  App: {
    openUrl: (...a) => openUrlMock(...a),
  },
}));

const {
  SAFETY_PLUS_ENTITLEMENT,
  SAFETY_PLUS_MONTHLY_PACKAGE,
  SAFETY_PLUS_ANNUAL_PACKAGE,
  configurePurchases,
  getOfferings,
  purchasePackage,
  restorePurchases,
  getCustomerInfo,
  addCustomerInfoUpdateListener,
  manageSubscription,
} = await import('../purchases');

beforeEach(() => {
  vi.clearAllMocks();
  isNativePlatform.mockReturnValue(false);
  getPlatform.mockReturnValue('web');
});

describe('purchases.js — package identifier constants', () => {
  // These strings are cross-checked against the RevenueCat dashboard by
  // scripts/preflight-iap-config.mjs. A change here without a matching
  // dashboard change would silently break the purchase flow — pin the
  // exact values so the drift is caught in CI.
  it('exports the RevenueCat monthly package identifier', () => {
    expect(SAFETY_PLUS_MONTHLY_PACKAGE).toBe('$rc_monthly');
  });

  it('exports the RevenueCat annual package identifier', () => {
    expect(SAFETY_PLUS_ANNUAL_PACKAGE).toBe('$rc_annual');
  });

  it('exports the safety_plus entitlement identifier', () => {
    expect(SAFETY_PLUS_ENTITLEMENT).toBe('safety_plus');
  });
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

  it('manageSubscription throws PURCHASES_NATIVE_ONLY on web', async () => {
    await expect(manageSubscription()).rejects.toThrow('PURCHASES_NATIVE_ONLY');
    expect(openUrlMock).not.toHaveBeenCalled();
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

  it('manageSubscription opens the App Store subscriptions URL on iOS', async () => {
    openUrlMock.mockResolvedValue(undefined);
    await manageSubscription();
    expect(openUrlMock).toHaveBeenCalledWith({ url: 'itms-apps://apps.apple.com/account/subscriptions' });
  });

  it('manageSubscription opens the Play Store subscriptions URL on Android', async () => {
    getPlatform.mockReturnValue('android');
    openUrlMock.mockResolvedValue(undefined);
    await manageSubscription();
    expect(openUrlMock).toHaveBeenCalledWith({ url: 'https://play.google.com/store/account/subscriptions' });
  });
});

describe('purchases.js — setLogLevel hardening (LOG-1)', () => {
  beforeEach(() => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue('ios');
    vi.stubEnv('VITE_REVENUECAT_APPLE_API_KEY', 'ios-key');
  });

  it('sets LOG_LEVEL.ERROR after configure on release builds (import.meta.env.PROD)', async () => {
    vi.stubEnv('PROD', true);
    // Configure is a one-shot; the module caches `configured` across tests, so
    // we import a fresh copy via vi.resetModules() to observe a clean call.
    vi.resetModules();
    const fresh = await import('../purchases');
    setLogLevelMock.mockResolvedValue(undefined);
    await fresh.configurePurchases();
    expect(configure).toHaveBeenCalled();
    expect(setLogLevelMock).toHaveBeenCalledWith({ level: 'ERROR' });
  });

  it('does NOT set log level on dev builds', async () => {
    vi.stubEnv('PROD', false);
    vi.resetModules();
    const fresh = await import('../purchases');
    await fresh.configurePurchases();
    expect(configure).toHaveBeenCalled();
    expect(setLogLevelMock).not.toHaveBeenCalled();
  });

  it('setLogLevel rejection is swallowed — configure still completes', async () => {
    vi.stubEnv('PROD', true);
    vi.resetModules();
    const fresh = await import('../purchases');
    setLogLevelMock.mockRejectedValue(new Error('plugin failure'));
    await expect(fresh.configurePurchases()).resolves.toBeUndefined();
  });
});
