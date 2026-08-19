// Branch review 2026-08-15 (C-2) — #1808 shipped three fixes and no new
// coverage. Its three test edits were mock UPDATES that kept existing tests
// passing (adding `isActive: true` to fixtures), not assertions on the new
// behaviour. So each fix could be reverted and the suite would stay green.
//
// Pinned here:
//   1. getOfferings/getTierOffering return null in a decoy/demo session.
//      This is the security fix in that PR — an ungated regression is a real
//      RevenueCat request from a coerced session, and invisible in review.
//   2. A prototype-chain `safety_plus` does not unlock the paid tier.
//      `in` walked the prototype chain; hasOwnProperty does not.
//   3. An entitlement present but isActive:false resolves to `free`.
//      Verified against the SDK contract, not guessed: EntitlementInfo carries
//      `readonly isActive: boolean`
//      (@revenuecat/purchases-typescript-internal-esm/dist/customerInfo.d.ts),
//      and RC's own docs say "Entitlement may still be active even if user has
//      unsubscribed. Check the isActive property."

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const isNativePlatform = vi.fn(() => true);
const getOfferingsRaw = vi.fn(async () => ({
  current: { identifier: 'default' },
  all: { 'referral-gold': { identifier: 'referral-gold' } },
}));
let deniabilityActive = false;

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNativePlatform(),
    getPlatform: () => 'ios',
  },
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));
vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: { getOfferings: (...a) => getOfferingsRaw(...a) },
  LOG_LEVEL: { DEBUG: 'DEBUG', INFO: 'INFO' },
}));
vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  // Both exports: entitlement.js's import graph reaches isDeniabilitySessionActive
  // too, and a partial mock throws rather than falling through to the real one.
  isDeniabilityOrDemoActive: () => deniabilityActive,
  isDeniabilitySessionActive: () => deniabilityActive,
  setDeniabilitySession: () => {},
  DENIABILITY_SESSION_CHANGED_EVENT: 'veyrnox:deniability-session-changed',
}));

beforeEach(() => {
  deniabilityActive = false;
  isNativePlatform.mockReturnValue(true);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetModules();
});

describe('getOfferings / getTierOffering — I3 egress gate (C-2)', () => {
  it('fetches offerings in a primary session', async () => {
    const { getOfferings } = await import('../purchases.js');
    await expect(getOfferings()).resolves.toEqual({ identifier: 'default' });
    expect(getOfferingsRaw).toHaveBeenCalled();
  });

  it('makes NO RevenueCat call in a decoy/hidden/demo session', async () => {
    // The assertion that matters is not the null return — it is that the
    // network call never happens. A gate that returned null AFTER fetching
    // would still leak the request from a coerced session.
    deniabilityActive = true;
    const { getOfferings } = await import('../purchases.js');
    await expect(getOfferings()).resolves.toBeNull();
    expect(getOfferingsRaw).not.toHaveBeenCalled();
  });

  it('gates getTierOffering the same way', async () => {
    deniabilityActive = true;
    const { getTierOffering } = await import('../purchases.js');
    await expect(getTierOffering('referral-gold')).resolves.toBeNull();
    expect(getOfferingsRaw).not.toHaveBeenCalled();
  });

  it('still returns the offering for a known tier in a primary session', async () => {
    // Bidirectional: a gate wired to refuse everything would pass the two
    // cases above and break the paywall for real users.
    const { getTierOffering } = await import('../purchases.js');
    await expect(getTierOffering('referral-gold'))
      .resolves.toEqual({ identifier: 'referral-gold' });
  });
});

describe('resolveTier — entitlement shape (C-2)', () => {
  async function loadWithCustomerInfo(customerInfo) {
    vi.doMock('../purchases', () => ({
      SAFETY_PLUS_ENTITLEMENT: 'safety_plus',
      AI_SECURITY_PROTECTION_ENTITLEMENT: 'ai_security_protection',
      getCustomerInfo: vi.fn(async () => customerInfo),
    }));
    return (await import('../entitlement.js')).resolveTier;
  }

  it('resolves safety_plus for a real active entitlement', async () => {
    const resolveTier = await loadWithCustomerInfo({
      entitlements: { active: { safety_plus: { identifier: 'safety_plus', isActive: true } } },
    });
    expect(await resolveTier()).toBe('safety_plus');
  });

  it('does NOT unlock the paid tier from the prototype chain', async () => {
    // `in` walks the prototype chain, so a malformed or prototype-polluted
    // shape unlocked safety_plus with no receipt. hasOwnProperty does not.
    const active = Object.create({ safety_plus: { isActive: true } });
    const resolveTier = await loadWithCustomerInfo({ entitlements: { active } });
    expect(await resolveTier()).toBe('free');
  });

  it('treats an entitlement present but isActive:false as free', async () => {
    const resolveTier = await loadWithCustomerInfo({
      entitlements: { active: { safety_plus: { identifier: 'safety_plus', isActive: false } } },
    });
    expect(await resolveTier()).toBe('free');
  });

  it('treats a missing isActive as free rather than assuming it', async () => {
    const resolveTier = await loadWithCustomerInfo({
      entitlements: { active: { safety_plus: {} } },
    });
    expect(await resolveTier()).toBe('free');
  });
});
