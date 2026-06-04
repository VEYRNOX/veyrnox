// src/lib/featureRegistry.js
//
// SINGLE SOURCE OF TRUTH for each route's honesty classification, per the
// wedge-alignment filter in
// docs/superpowers/specs/2026-06-04-veyrnox-positioning-scope-design.md (§2).
//
// status:
//   'live'     — passes all four gates; renders normally.
//   'disabled' — belongs to the product but can't be done cleanly yet (fails the
//                clean-data-path / server-honesty / verified gate). Stays visible
//                in nav and renders an honest notice instead of fabricated data.
//   'cut'      — does not serve the coercion-resistant-vault job. Removed from nav
//                and search; the route resolves to Not Found.
//
// Anything NOT listed here defaults to { status: 'live' } — adding the registry
// disables nothing by itself; only explicit entries change behaviour.

// User-facing reason codes (drive the notice heading in HonestDisabledPage).
export const REASONS = {
  LEAKS: 'leaks',           // needs a third-party indexer that would reveal your address
  SERVER: 'server',         // needs a backend this build doesn't ship
  UNVERIFIED: 'unverified', // not yet verified against real on-chain data
  OFF_WEDGE: 'off-wedge',   // exposes holdings/identity — a targeting vector
};

// Explicit classifications. Seeded with the cuts the spec already locked (§4).
export const FEATURE_REGISTRY = {
  '/leaderboard': {
    status: 'cut',
    reason: REASONS.OFF_WEDGE,
    note: 'A public ranking of who holds what is a targeting list aimed at our users. Removed on principle.',
  },
  '/public-profiles': {
    status: 'cut',
    reason: REASONS.OFF_WEDGE,
    note: 'Public identity and holdings exposure is the threat model we defend against, not a feature.',
  },
  '/shared-portfolio': {
    status: 'cut',
    reason: REASONS.OFF_WEDGE,
    note: 'Social portfolio sharing exposes holdings. A deliberate, encrypted signed export will replace it.',
  },
  '/referrals': {
    status: 'disabled',
    reason: REASONS.SERVER,
    note: 'Referrals return once they can work without a server that links referrer and referee.',
  },
};

const DEFAULT_ENTRY = { status: 'live' };

export function getFeatureStatus(path) {
  return FEATURE_REGISTRY[path] || DEFAULT_ENTRY;
}

export function isLive(path) {
  return getFeatureStatus(path).status === 'live';
}
export function isDisabled(path) {
  return getFeatureStatus(path).status === 'disabled';
}
export function isCut(path) {
  return getFeatureStatus(path).status === 'cut';
}

export function cutPaths() {
  return Object.keys(FEATURE_REGISTRY).filter(isCut);
}
export function disabledPaths() {
  return Object.keys(FEATURE_REGISTRY).filter(isDisabled);
}

// Pure mapping from a path to how <FeatureRoute> should render it. Extracted so
// the gate's branching is unit-tested without rendering React.
export function featureRouteOutcome(path) {
  const { status } = getFeatureStatus(path);
  if (status === 'cut') return 'notFound';
  if (status === 'disabled') return 'disabled';
  return 'render';
}
