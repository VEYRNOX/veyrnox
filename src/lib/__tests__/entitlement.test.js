import { describe, it, expect, vi, beforeEach } from 'vitest';

const isNativePlatform = vi.fn();
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform() },
}));

const getCustomerInfo = vi.fn();
vi.mock('../purchases', () => ({
  SAFETY_PLUS_ENTITLEMENT: 'safety_plus',
  getCustomerInfo: () => getCustomerInfo(),
}));

const { resolveTier } = await import('../entitlement');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveTier', () => {
  it('resolves free on web without calling getCustomerInfo', async () => {
    isNativePlatform.mockReturnValue(false);
    expect(await resolveTier()).toBe('free');
    expect(getCustomerInfo).not.toHaveBeenCalled();
  });

  it('resolves safety_plus when the entitlement is active', async () => {
    isNativePlatform.mockReturnValue(true);
    getCustomerInfo.mockResolvedValue({ entitlements: { active: { safety_plus: {} } } });
    expect(await resolveTier()).toBe('safety_plus');
  });

  it('resolves free when no entitlement is active', async () => {
    isNativePlatform.mockReturnValue(true);
    getCustomerInfo.mockResolvedValue({ entitlements: { active: {} } });
    expect(await resolveTier()).toBe('free');
  });

  it('fails closed to free when getCustomerInfo throws', async () => {
    isNativePlatform.mockReturnValue(true);
    getCustomerInfo.mockRejectedValue(new Error('network error'));
    expect(await resolveTier()).toBe('free');
  });

  it('fails closed to free when customerInfo is null', async () => {
    isNativePlatform.mockReturnValue(true);
    getCustomerInfo.mockResolvedValue(null);
    expect(await resolveTier()).toBe('free');
  });
});
