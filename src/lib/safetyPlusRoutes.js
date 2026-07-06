//
// Canonical list of routes that require the Safety Plus entitlement. This is
// the single source of truth FeatureGate.jsx checks against — SafetyPlus.jsx
// (the feature hub) mirrors these paths for its nav links; update this list
// first when a Safety Plus feature moves or a new one ships.

export const SAFETY_PLUS_ROUTES = [
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
];

export function isSafetyPlusRoute(path) {
  return SAFETY_PLUS_ROUTES.includes(path);
}
