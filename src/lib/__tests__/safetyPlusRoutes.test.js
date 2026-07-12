import { describe, it, expect } from 'vitest';
import { SAFETY_PLUS_ROUTES, isSafetyPlusRoute } from '../safetyPlusRoutes';

describe('safetyPlusRoutes', () => {
  it('lists exactly the 4 pure-analytics Safety Plus feature routes', () => {
    expect(SAFETY_PLUS_ROUTES).toEqual([
      '/risk-score',
      '/advanced-analytics',
      '/onchain',
      '/recurring',
    ]);
  });

  it('isSafetyPlusRoute is true for a gated (analytics) route', () => {
    expect(isSafetyPlusRoute('/risk-score')).toBe(true);
  });

  it('isSafetyPlusRoute is false for a free route', () => {
    expect(isSafetyPlusRoute('/dashboard')).toBe(false);
  });

  // The 11 routes below were de-paywalled by owner decision: security and
  // anti-fraud controls must be FREE on a safety-positioned wallet. They are
  // no longer gated.
  it('isSafetyPlusRoute is false for each of the 11 de-paywalled safety routes', () => {
    expect(isSafetyPlusRoute('/hardware-wallet')).toBe(false);
    expect(isSafetyPlusRoute('/fraud')).toBe(false);
    expect(isSafetyPlusRoute('/security')).toBe(false);
    expect(isSafetyPlusRoute('/token-approvals')).toBe(false);
    expect(isSafetyPlusRoute('/address-checker')).toBe(false);
    expect(isSafetyPlusRoute('/security-dashboard')).toBe(false);
    expect(isSafetyPlusRoute('/personal-backup')).toBe(false);
    expect(isSafetyPlusRoute('/spam-filter')).toBe(false);
    expect(isSafetyPlusRoute('/audit-log')).toBe(false);
    expect(isSafetyPlusRoute('/crypto-signing')).toBe(false);
    expect(isSafetyPlusRoute('/risk')).toBe(false);
  });

  // Regression pin: this owner decision must not be silently reverted. If a
  // future change re-adds any of these safety/anti-fraud/recovery controls to
  // SAFETY_PLUS_ROUTES, this test fails loudly.
  it('regression: safety/anti-fraud controls are FREE (never in SAFETY_PLUS_ROUTES)', () => {
    const MUST_STAY_FREE = [
      '/risk',
      '/fraud',
      '/address-checker',
      '/token-approvals',
      '/security-dashboard',
      '/hardware-wallet',
      '/personal-backup',
      '/spam-filter',
      '/audit-log',
      '/crypto-signing',
      '/security',
      '/price-charts',
    ];
    for (const route of MUST_STAY_FREE) {
      expect(SAFETY_PLUS_ROUTES, `${route} must stay FREE`).not.toContain(route);
      expect(isSafetyPlusRoute(route), `${route} must not be gated`).toBe(false);
    }
  });

  it('isSafetyPlusRoute is false for the plans/safety-plus hub pages themselves', () => {
    expect(isSafetyPlusRoute('/plans')).toBe(false);
    expect(isSafetyPlusRoute('/safety-plus')).toBe(false);
  });
});
