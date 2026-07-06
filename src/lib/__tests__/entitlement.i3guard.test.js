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
  getCustomerInfo: vi.fn(async () => ({
    entitlements: { active: { safety_plus: {} } },
  })),
}));

import { getCustomerInfo } from '../purchases';
import { resolveTier } from '../entitlement.js';
import { setDeniabilitySession } from '@/wallet-core/deniabilitySession.js';

describe('resolveTier — I3 deniability guard (fail closed)', () => {
  beforeEach(() => {
    setDeniabilitySession(false);
    getCustomerInfo.mockClear();
  });

  it("returns 'free' and makes NO customer-info egress in a deniability session", async () => {
    setDeniabilitySession(true);
    const tier = await resolveTier();
    expect(tier).toBe('free');
    expect(getCustomerInfo).not.toHaveBeenCalled();
    setDeniabilitySession(false);
  });

  it('resolves the real tier via getCustomerInfo when no deniability session is active', async () => {
    const tier = await resolveTier();
    expect(getCustomerInfo).toHaveBeenCalledTimes(1);
    expect(tier).toBe('safety_plus');
  });
});
