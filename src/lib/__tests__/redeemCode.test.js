import { describe, it, expect, vi, beforeEach } from 'vitest';

const openUrlMock = vi.fn();
const isNativePlatform = vi.fn();
const getPlatform = vi.fn();

vi.mock('@capacitor/app', () => ({ App: { openUrl: (...a) => openUrlMock(...a) } }));
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
  openUrlMock.mockResolvedValue(undefined);
});

describe('redeemCode', () => {
  it('throws PURCHASES_NATIVE_ONLY on web', async () => {
    isNativePlatform.mockReturnValue(false);
    await expect(redeemCode()).rejects.toThrow('PURCHASES_NATIVE_ONLY');
    expect(openUrlMock).not.toHaveBeenCalled();
  });

  it('opens the App Store Offer Codes sheet on iOS', async () => {
    await redeemCode();
    expect(openUrlMock).toHaveBeenCalledWith({
      url: 'itms-apps://apps.apple.com/redeem?ctx=offercodes',
    });
  });

  it('opens the Play Store Redeem page on Android', async () => {
    getPlatform.mockReturnValue('android');
    await redeemCode();
    expect(openUrlMock).toHaveBeenCalledWith({
      url: 'https://play.google.com/redeem',
    });
  });
});
