//
// Canonical list of routes that require the Safety Plus entitlement. This is
// the single source of truth FeatureGate.jsx checks against — SafetyPlus.jsx
// (the feature hub) mirrors these paths for its nav links; update this list
// first when a Safety Plus feature moves or a new one ships.
//
// This set mirrors the public plans page at https://veyrnox.com/plans — the
// SAFETY PLUS column of that comparison is the source of truth for what is
// gated. Grouped below by the plans-page nav section for readability.
//
// NOTE: three Safety-Plus items on the plans page — "Calldata decode &
// approval guard", "Address-poisoning warnings" and "Transaction simulation" —
// are embedded in the Send flow, not standalone routes, so they cannot be
// gated here. Route-gating them requires changes inside the (security-sensitive)
// Send flow and is tracked as follow-up.

export const SAFETY_PLUS_ROUTES = [
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

export function isSafetyPlusRoute(path) {
  return SAFETY_PLUS_ROUTES.includes(path);
}
