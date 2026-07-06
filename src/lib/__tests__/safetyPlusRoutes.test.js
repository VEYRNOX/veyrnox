import { describe, it, expect } from 'vitest';
import { SAFETY_PLUS_ROUTES, isSafetyPlusRoute } from '../safetyPlusRoutes';

describe('safetyPlusRoutes', () => {
  it('lists exactly the 16 Safety Plus feature routes', () => {
    expect(SAFETY_PLUS_ROUTES).toEqual([
      '/hardware-wallet',
      '/risk',
      '/security',
      '/token-approvals',
      '/address-checker',
      '/fraud',
      '/security-dashboard',
      '/cloud-backup',
      '/spam-filter',
      '/audit-log',
      '/risk-score',
      '/advanced-analytics',
      '/onchain',
      '/price-charts',
      '/recurring',
      '/crypto-signing',
    ]);
  });

  it('isSafetyPlusRoute is true for a gated route', () => {
    expect(isSafetyPlusRoute('/hardware-wallet')).toBe(true);
  });

  it('isSafetyPlusRoute is false for a free route', () => {
    expect(isSafetyPlusRoute('/dashboard')).toBe(false);
  });

  it('isSafetyPlusRoute is false for the plans/safety-plus hub pages themselves', () => {
    expect(isSafetyPlusRoute('/plans')).toBe(false);
    expect(isSafetyPlusRoute('/safety-plus')).toBe(false);
  });
});
