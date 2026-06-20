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
    expect(code.length).toBe(8); // VYX-XXXX
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
  it('returns bronze for 4', async () => {
    const { getTier } = await import('../referral.js');
    expect(getTier(4)).toBe('bronze');
  });
  it('returns silver for 5', async () => {
    const { getTier } = await import('../referral.js');
    expect(getTier(5)).toBe('silver');
  });
  it('returns silver for 9', async () => {
    const { getTier } = await import('../referral.js');
    expect(getTier(9)).toBe('silver');
  });
  it('returns gold for 10', async () => {
    const { getTier } = await import('../referral.js');
    expect(getTier(10)).toBe('gold');
  });
  it('returns gold for counts above 10', async () => {
    const { getTier } = await import('../referral.js');
    expect(getTier(15)).toBe('gold');
  });
});

describe('applyRedemption', () => {
  it('writes bronze tier and no unlockedFeatures at count 1', async () => {
    const { applyRedemption, getLocalState } = await import('../referral.js');
    applyRedemption(1);
    const state = getLocalState();
    expect(state.tier).toBe('bronze');
    expect(state.unlockedFeatures).toEqual([]);
    expect(state.referralCredit).toBe(false);
  });

  it('unlocks portfolio-snapshots at count 5', async () => {
    const { applyRedemption, getLocalState } = await import('../referral.js');
    applyRedemption(5);
    const state = getLocalState();
    expect(state.tier).toBe('silver');
    expect(state.unlockedFeatures).toContain('portfolio-snapshots');
  });

  it('sets referralCredit and externalEligible at count 10', async () => {
    const { applyRedemption, getLocalState } = await import('../referral.js');
    applyRedemption(10);
    const state = getLocalState();
    expect(state.tier).toBe('gold');
    expect(state.referralCredit).toBe(true);
    expect(state.externalEligible).toBe(true);
  });

  it('is idempotent — calling twice with the same count does not duplicate unlockedFeatures', async () => {
    const { applyRedemption, getLocalState } = await import('../referral.js');
    applyRedemption(5);
    applyRedemption(5);
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
