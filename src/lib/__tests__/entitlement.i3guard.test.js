// src/lib/__tests__/entitlement.i3guard.test.js
//
// I3 (deniability = ZERO backend calls): resolveTier() is the single egress
// chokepoint for RevenueCat customer-info. In a deniability (decoy/hidden)
// session it must return 'free' IMMEDIATELY — before any getCustomerInfo()
// network call — so no RevenueCat request can leak from a coerced decoy/hidden
// session. This pins the runtime guard, mirroring priceFeed.i3guard.test.js.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
}));

vi.mock('../purchases', () => ({
  SAFETY_PLUS_ENTITLEMENT: 'safety_plus',
  AI_SECURITY_PROTECTION_ENTITLEMENT: 'ai_security_protection',
  getCustomerInfo: vi.fn(async () => ({
    entitlements: { active: { safety_plus: { isActive: true } } },
  })),
}));

async function loadModules() {
  const [{ getCustomerInfo }, { resolveTier }, { setDeniabilitySession }] = await Promise.all([
    import('../purchases'),
    import('../entitlement.js'),
    import('@/wallet-core/deniabilitySession.js'),
  ]);
  return { getCustomerInfo, resolveTier, setDeniabilitySession };
}

describe('resolveTier — I3 deniability guard (fail closed)', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { getCustomerInfo, setDeniabilitySession } = await loadModules();
    setDeniabilitySession(false);
    getCustomerInfo.mockClear();
  });

  it("returns 'free' and makes NO customer-info egress in a deniability session", async () => {
    const { getCustomerInfo, resolveTier, setDeniabilitySession } = await loadModules();
    setDeniabilitySession(true);
    const tier = await resolveTier();
    expect(tier).toBe('free');
    expect(getCustomerInfo).not.toHaveBeenCalled();
    setDeniabilitySession(false);
  });

  it('resolves the real tier via getCustomerInfo when no deniability session is active', async () => {
    const { getCustomerInfo, resolveTier } = await loadModules();
    const tier = await resolveTier();
    expect(getCustomerInfo).toHaveBeenCalledTimes(1);
    expect(tier).toBe('safety_plus');
  });
});
