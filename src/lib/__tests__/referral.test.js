import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = {};
const localStorageMock = {
  getItem: vi.fn((key) => store[key] ?? null),
  setItem: vi.fn((key, val) => { store[key] = String(val); }),
  removeItem: vi.fn((key) => { delete store[key]; }),
  clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
};

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
  vi.resetModules();
  Object.defineProperty(global, 'localStorage', { value: localStorageMock, configurable: true });
});

describe('generateCode', () => {
  it('returns a VYX-XXXX formatted code', async () => {
    const { generateCode } = await import('../referral.js');
    expect(generateCode()).toMatch(/^VYX-[A-Z0-9]{6}$/);
  });

  it('returns the same code on repeated calls', async () => {
    const { generateCode } = await import('../referral.js');
    const first = generateCode();
    const second = generateCode();
    expect(first).toBe(second);
  });

  it('generates a fresh code when localStorage is empty', async () => {
    const { generateCode } = await import('../referral.js');
    const code = generateCode();
    expect(typeof code).toBe('string');
    expect(code.length).toBe(10);
  });
});

describe('getTier', () => {
  it('returns none for 0', async () => {
    const { getTier } = await import('../referral.js');
    expect(getTier(0)).toBe('none');
  });
  it('returns bronze for 1', async () => {
    const { getTier } = await import('../referral.js');
    expect(getTier(1)).toBe('bronze');
  });
  it('returns bronze for 99', async () => {
    const { getTier } = await import('../referral.js');
    expect(getTier(99)).toBe('bronze');
  });
  it('returns silver for 100', async () => {
    const { getTier } = await import('../referral.js');
    expect(getTier(100)).toBe('silver');
  });
  it('returns silver for 999', async () => {
    const { getTier } = await import('../referral.js');
    expect(getTier(999)).toBe('silver');
  });
  it('returns gold for 1000', async () => {
    const { getTier } = await import('../referral.js');
    expect(getTier(1000)).toBe('gold');
  });
  it('returns gold for 9999', async () => {
    const { getTier } = await import('../referral.js');
    expect(getTier(9999)).toBe('gold');
  });
  it('returns platinum for 10000', async () => {
    const { getTier } = await import('../referral.js');
    expect(getTier(10000)).toBe('platinum');
  });
  it('returns platinum for 50000', async () => {
    const { getTier } = await import('../referral.js');
    expect(getTier(50000)).toBe('platinum');
  });
});

describe('getTierInfo', () => {
  it('returns commission 0 for count 0', async () => {
    const { getTierInfo } = await import('../referral.js');
    expect(getTierInfo(0).commission).toBe(0);
  });
  it('returns 2.5% commission for bronze', async () => {
    const { getTierInfo } = await import('../referral.js');
    expect(getTierInfo(50).commission).toBe(2.5);
    expect(getTierInfo(50).key).toBe('bronze');
  });
  it('returns 5% commission for silver', async () => {
    const { getTierInfo } = await import('../referral.js');
    expect(getTierInfo(500).commission).toBe(5);
    expect(getTierInfo(500).key).toBe('silver');
  });
  it('returns 10% commission for gold', async () => {
    const { getTierInfo } = await import('../referral.js');
    expect(getTierInfo(5000).commission).toBe(10);
    expect(getTierInfo(5000).key).toBe('gold');
  });
  it('returns 15% commission for platinum', async () => {
    const { getTierInfo } = await import('../referral.js');
    expect(getTierInfo(50000).commission).toBe(15);
    expect(getTierInfo(50000).key).toBe('platinum');
  });
  it('returns next tier for bronze', async () => {
    const { getTierInfo } = await import('../referral.js');
    const info = getTierInfo(50);
    expect(info.next.key).toBe('silver');
  });
  it('returns null next for platinum', async () => {
    const { getTierInfo } = await import('../referral.js');
    const info = getTierInfo(50000);
    expect(info.next).toBeNull();
  });
});

describe('applyRedemption', () => {
  it('writes bronze tier and 2.5% commission at count 1', async () => {
    const { applyRedemption, getLocalState } = await import('../referral.js');
    applyRedemption(1);
    const state = getLocalState();
    expect(state.tier).toBe('bronze');
    expect(state.commission).toBe(2.5);
  });

  it('unlocks portfolio-snapshots at silver (100)', async () => {
    const { applyRedemption, getLocalState } = await import('../referral.js');
    applyRedemption(100);
    const state = getLocalState();
    expect(state.tier).toBe('silver');
    expect(state.commission).toBe(5);
    expect(state.unlockedFeatures).toContain('portfolio-snapshots');
  });

  it('sets 10% commission and externalEligible at gold (1000)', async () => {
    const { applyRedemption, getLocalState } = await import('../referral.js');
    applyRedemption(1000);
    const state = getLocalState();
    expect(state.tier).toBe('gold');
    expect(state.commission).toBe(10);
    expect(state.externalEligible).toBe(true);
  });

  it('sets 15% commission at platinum (10000)', async () => {
    const { applyRedemption, getLocalState } = await import('../referral.js');
    applyRedemption(10000);
    const state = getLocalState();
    expect(state.tier).toBe('platinum');
    expect(state.commission).toBe(15);
    expect(state.externalEligible).toBe(true);
  });

  it('is idempotent — calling twice with the same count does not duplicate unlockedFeatures', async () => {
    const { applyRedemption, getLocalState } = await import('../referral.js');
    applyRedemption(500);
    applyRedemption(500);
    const state = getLocalState();
    expect(state.unlockedFeatures.filter(f => f === 'portfolio-snapshots').length).toBe(1);
  });
});

describe('own-code and already-redeemed guards', () => {
  it('hasRedeemed returns false when no code has been redeemed', async () => {
    const { hasRedeemed } = await import('../referral.js');
    expect(hasRedeemed()).toBe(false);
  });

  it('hasRedeemed returns true after markRedeemed', async () => {
    const { hasRedeemed, markRedeemed } = await import('../referral.js');
    markRedeemed('VYX-AB12');
    expect(hasRedeemed()).toBe(true);
  });

  it('setPendingReferral / getPendingReferral round-trips the code', async () => {
    const { setPendingReferral, getPendingReferral } = await import('../referral.js');
    setPendingReferral('VYX-XY99');
    expect(getPendingReferral()).toBe('VYX-XY99');
  });

  it('clearPendingReferral removes the stored code', async () => {
    const { setPendingReferral, clearPendingReferral, getPendingReferral } = await import('../referral.js');
    setPendingReferral('VYX-AB12');
    clearPendingReferral();
    expect(getPendingReferral()).toBeNull();
  });
});

describe('attribution tracking', () => {
  it('getRedeemedCode returns null when no code redeemed', async () => {
    const { getRedeemedCode } = await import('../referral.js');
    expect(getRedeemedCode()).toBeNull();
  });

  it('getRedeemedCode returns the redeemed code after markRedeemed', async () => {
    const { markRedeemed, getRedeemedCode } = await import('../referral.js');
    markRedeemed('VYX-AB12');
    expect(getRedeemedCode()).toBe('VYX-AB12');
  });

  it('hasAttributed returns false initially', async () => {
    const { hasAttributed } = await import('../referral.js');
    expect(hasAttributed()).toBe(false);
  });

  it('hasAttributed returns true after markAttributed', async () => {
    const { markAttributed, hasAttributed } = await import('../referral.js');
    markAttributed();
    expect(hasAttributed()).toBe(true);
  });

  it('markAttributed is idempotent', async () => {
    const { markAttributed, hasAttributed } = await import('../referral.js');
    markAttributed();
    markAttributed();
    expect(hasAttributed()).toBe(true);
  });
});

describe('PLAN_FULL_PRICE_CENTS', () => {
  it('has monthly at 599', async () => {
    const { PLAN_FULL_PRICE_CENTS } = await import('../referral.js');
    expect(PLAN_FULL_PRICE_CENTS.monthly).toBe(599);
  });
  it('has annual at 4999', async () => {
    const { PLAN_FULL_PRICE_CENTS } = await import('../referral.js');
    expect(PLAN_FULL_PRICE_CENTS.annual).toBe(4999);
  });
  it('PLAN_REVENUE_CENTS is the same reference', async () => {
    const { PLAN_REVENUE_CENTS, PLAN_FULL_PRICE_CENTS } = await import('../referral.js');
    expect(PLAN_REVENUE_CENTS).toBe(PLAN_FULL_PRICE_CENTS);
  });
});

describe('calculateDiscountCents', () => {
  it('calculates 2.5% discount on annual', async () => {
    const { calculateDiscountCents } = await import('../referral.js');
    expect(calculateDiscountCents(4999, 2.5)).toBe(125);
  });
  it('calculates 15% discount on annual', async () => {
    const { calculateDiscountCents } = await import('../referral.js');
    expect(calculateDiscountCents(4999, 15)).toBe(750);
  });
  it('calculates 10% discount on monthly', async () => {
    const { calculateDiscountCents } = await import('../referral.js');
    expect(calculateDiscountCents(599, 10)).toBe(60);
  });
  it('returns 0 for 0% commission', async () => {
    const { calculateDiscountCents } = await import('../referral.js');
    expect(calculateDiscountCents(4999, 0)).toBe(0);
  });
});

describe('TIER_OFFERING_ID / getOfferingIdForTier', () => {
  it('maps bronze to referral-bronze', async () => {
    const { getOfferingIdForTier } = await import('../referral.js');
    expect(getOfferingIdForTier('bronze')).toBe('referral-bronze');
  });
  it('maps platinum to referral-platinum', async () => {
    const { getOfferingIdForTier } = await import('../referral.js');
    expect(getOfferingIdForTier('platinum')).toBe('referral-platinum');
  });
  it('returns null for unknown tier', async () => {
    const { getOfferingIdForTier } = await import('../referral.js');
    expect(getOfferingIdForTier('none')).toBeNull();
  });
});

describe('calculateEarnings (discount-based)', () => {
  it('returns zero for empty attributions', async () => {
    const { calculateEarnings } = await import('../referral.js');
    const result = calculateEarnings([]);
    expect(result).toEqual({ totalRevenueCents: 0, totalDiscountCents: 0, count: 0 });
  });

  it('sums discount_cents from attributions', async () => {
    const { calculateEarnings } = await import('../referral.js');
    const result = calculateEarnings([
      { revenue_cents: 4999, discount_cents: 750 },
      { revenue_cents: 599, discount_cents: 90 },
    ]);
    expect(result.totalDiscountCents).toBe(840);
    expect(result.totalRevenueCents).toBe(5598);
    expect(result.count).toBe(2);
  });

  it('handles attributions without discount_cents (legacy)', async () => {
    const { calculateEarnings } = await import('../referral.js');
    const result = calculateEarnings([{ revenue_cents: 4999 }]);
    expect(result.totalDiscountCents).toBe(0);
    expect(result.totalRevenueCents).toBe(4999);
    expect(result.count).toBe(1);
  });
});

describe('initCode', () => {
  it('uses server code when generateServerCode succeeds', async () => {
    const { initCode, getLocalState } = await import('../referral.js');
    const serverFn = vi.fn().mockResolvedValue('VYX-SRVR01');
    const code = await initCode(serverFn);
    expect(code).toBe('VYX-SRVR01');
    expect(getLocalState().code).toBe('VYX-SRVR01');
    expect(getLocalState().serverGenerated).toBe(true);
    expect(serverFn).toHaveBeenCalledOnce();
  });

  it('falls back to local code when server returns null', async () => {
    const { initCode } = await import('../referral.js');
    const serverFn = vi.fn().mockResolvedValue(null);
    const code = await initCode(serverFn);
    expect(code).toMatch(/^VYX-[A-Z0-9]{6}$/);
    expect(serverFn).toHaveBeenCalledOnce();
  });

  it('falls back to local code when no server function provided', async () => {
    const { initCode } = await import('../referral.js');
    const code = await initCode(null);
    expect(code).toMatch(/^VYX-[A-Z0-9]{6}$/);
  });

  it('returns cached code if one already exists', async () => {
    const { generateCode, initCode } = await import('../referral.js');
    const first = generateCode();
    const serverFn = vi.fn().mockResolvedValue('VYX-NEW001');
    const code = await initCode(serverFn);
    expect(code).toBe(first);
    expect(serverFn).not.toHaveBeenCalled();
  });
});
