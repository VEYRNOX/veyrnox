import { describe, it, expect } from 'vitest';
import { SAFETY_PLUS_ROUTES, isSafetyPlusRoute } from '../safetyPlusRoutes';

// This set mirrors the SAFETY PLUS column of the public plans page at
// https://veyrnox.com/plans (owner decision: full-match the plans page). The
// three plans-page Safety-Plus items that are embedded in the Send flow rather
// than standalone routes — Calldata decode, Address-poisoning warnings and
// Transaction simulation — are intentionally NOT in this list (no route to
// gate); they are tracked as Send-flow follow-up.
const EXPECTED_GATED = [
  // SECURITY
  '/duress-pin',
  '/stealth-wallets',
  '/panic-wipe',
  '/hardware-wallet',
  '/anomaly-detection',
  '/fraud',
  '/address-checker',
  '/token-approvals',
  '/budget',
  '/spam-filter',
  '/personal-backup',
  '/audit-log',
  // FINANCE
  '/advanced-analytics',
  '/onchain',
  '/recurring',
  // CONNECT
  '/crypto-signing',
];

describe('safetyPlusRoutes', () => {
  it('gates exactly the Safety Plus routes from the plans page', () => {
    expect(SAFETY_PLUS_ROUTES).toEqual(EXPECTED_GATED);
  });

  it('isSafetyPlusRoute is true for each gated route', () => {
    for (const route of EXPECTED_GATED) {
      expect(isSafetyPlusRoute(route), `${route} must be gated`).toBe(true);
    }
  });

  it('isSafetyPlusRoute is false for a free route', () => {
    expect(isSafetyPlusRoute('/dashboard')).toBe(false);
  });

  // Portfolio Risk Score (/risk-score) is FREE on the plans page. The old
  // leverage-based /risk page was removed (no leverage/borrow product).
  it('Portfolio Risk Score (/risk-score) is FREE', () => {
    expect(isSafetyPlusRoute('/risk-score')).toBe(false);
  });

  // These features are marked FREE on https://veyrnox.com/plans and must not be
  // gated. Regression pin: if a future change moves any of them into
  // SAFETY_PLUS_ROUTES, this test fails loudly.
  it('regression: plans-page FREE features are never gated', () => {
    const MUST_STAY_FREE = [
      '/risk-score',          // Portfolio risk score (FREE)
      '/rasp-security',       // RASP (FREE)
      '/security-dashboard',  // Security dashboard (FREE)
      '/net-worth',           // Portfolio dashboard & net-worth (FREE)
      '/pl',                  // P&L tracking (FREE)
      '/fee-analytics',       // Fee analytics (FREE)
      '/price-charts',        // Price charts, alerts & watchlist (FREE)
      '/network-manager',     // Network Manager (FREE)
      '/address-book',        // Address book (FREE)
      '/nft',                 // NFT gallery (FREE)
      '/notifications',       // Notifications & push (FREE)
      '/walletconnect',       // WalletConnect / dApp connector (FREE)
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
