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
    expect(generateCode()).toMatch(/^VYX-[A-Z0-9]{4}$/);
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
    expect(code.length).toBe(8);
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

describe('PLAN_REVENUE_CENTS', () => {
  it('has monthly at 599', async () => {
    const { PLAN_REVENUE_CENTS } = await import('../referral.js');
    expect(PLAN_REVENUE_CENTS.monthly).toBe(599);
  });
  it('has annual at 4999', async () => {
    const { PLAN_REVENUE_CENTS } = await import('../referral.js');
    expect(PLAN_REVENUE_CENTS.annual).toBe(4999);
  });
});

describe('calculateEarnings', () => {
  it('returns zero for empty attributions', async () => {
    const { calculateEarnings } = await import('../referral.js');
    const result = calculateEarnings([], 5);
    expect(result).toEqual({ totalRevenueCents: 0, commissionCents: 0, count: 0 });
  });

  it('calculates 2.5% commission on a single monthly', async () => {
    const { calculateEarnings } = await import('../referral.js');
    const result = calculateEarnings([{ revenue_cents: 599 }], 2.5);
    expect(result.totalRevenueCents).toBe(599);
    expect(result.commissionCents).toBe(15);
    expect(result.count).toBe(1);
  });

  it('calculates 10% commission on mixed plans', async () => {
    const { calculateEarnings } = await import('../referral.js');
    const result = calculateEarnings([
      { revenue_cents: 599 },
      { revenue_cents: 4999 },
      { revenue_cents: 599 },
    ], 10);
    expect(result.totalRevenueCents).toBe(6197);
    expect(result.commissionCents).toBe(620);
    expect(result.count).toBe(3);
  });

  it('calculates 15% platinum commission on annual', async () => {
    const { calculateEarnings } = await import('../referral.js');
    const result = calculateEarnings([{ revenue_cents: 4999 }], 15);
    expect(result.commissionCents).toBe(750);
  });
});
