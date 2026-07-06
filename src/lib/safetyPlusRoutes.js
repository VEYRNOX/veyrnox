//
// Canonical list of routes that require the Safety Plus entitlement. This is
// the single source of truth FeatureGate.jsx checks against — SafetyPlus.jsx
// (the feature hub) mirrors these paths for its nav links; update this list
// first when a Safety Plus feature moves or a new one ships.

export const SAFETY_PLUS_ROUTES = [
  '/risk-score',
  '/advanced-analytics',
  '/onchain',
  '/price-charts',
  '/recurring',
];

export function isSafetyPlusRoute(path) {
  return SAFETY_PLUS_ROUTES.includes(path);
}
