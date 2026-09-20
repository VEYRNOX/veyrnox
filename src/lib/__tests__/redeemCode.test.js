import { describe, it, expect, vi, beforeEach } from 'vitest';

const presentCodeRedemptionSheet = vi.fn();
const browserOpen = vi.fn();
const isNativePlatform = vi.fn();
const getPlatform = vi.fn();

// Mock only methods that genuinely exist on these plugins. The previous
// version of this file mocked App.openUrl — a method @capacitor/app does not
// have — so all three cases passed while the feature was dead on device.
vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: { presentCodeRedemptionSheet: (...a) => presentCodeRedemptionSheet(...a) },
}));
vi.mock('@capacitor/browser', () => ({ Browser: { open: (...a) => browserOpen(...a) } }));
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNativePlatform(),
    getPlatform: () => getPlatform(),
  },
}));

const { redeemCode } = await import('../redeemCode');

beforeEach(() => {
  vi.clearAllMocks();
  isNativePlatform.mockReturnValue(true);
  getPlatform.mockReturnValue('ios');
  presentCodeRedemptionSheet.mockResolvedValue(undefined);
  browserOpen.mockResolvedValue(undefined);
});

describe('redeemCode', () => {
  it('throws PURCHASES_NATIVE_ONLY on web', async () => {
    isNativePlatform.mockReturnValue(false);
    await expect(redeemCode()).rejects.toThrow('PURCHASES_NATIVE_ONLY');
    expect(presentCodeRedemptionSheet).not.toHaveBeenCalled();
    expect(browserOpen).not.toHaveBeenCalled();
  });

  it('presents the native StoreKit offer-code sheet on iOS', async () => {
    await redeemCode();
    expect(presentCodeRedemptionSheet).toHaveBeenCalledTimes(1);
    // No deep link on iOS — the sheet is in-app.
    expect(browserOpen).not.toHaveBeenCalled();
  });

  it('opens the Play Store Redeem page on Android', async () => {
    getPlatform.mockReturnValue('android');
    await redeemCode();
    expect(browserOpen).toHaveBeenCalledWith({ url: 'https://play.google.com/redeem' });
    // RevenueCat's Android presentCodeRedemptionSheet is a logged no-op stub,
    // so it must not be relied on there.
    expect(presentCodeRedemptionSheet).not.toHaveBeenCalled();
  });

  it('propagates a rejection so the caller can surface it', async () => {
    presentCodeRedemptionSheet.mockRejectedValue(new Error('nope'));
    await expect(redeemCode()).rejects.toThrow('nope');
  });
});
