// src/lib/featureRegistry.js
//
// Runtime feature registry. The classification audit in featureClassification.js
// is the single source of truth; FEATURE_REGISTRY is derived from it.
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

import { registryEntriesFromClassification } from './featureClassification';

// User-facing reason codes (drive the notice heading in HonestDisabledPage).
export const REASONS = {
  LEAKS: 'leaks',           // needs a third-party indexer that would reveal your address
  SERVER: 'server',         // needs a backend this build doesn't ship
  UNVERIFIED: 'unverified', // not yet verified against real on-chain data
  OFF_WEDGE: 'off-wedge',   // exposes holdings/identity — a targeting vector
};

// Runtime exceptions are derived from the classification audit (single source
// of truth). Unlisted paths still default to { status: 'live' }.
const FEATURE_REGISTRY = registryEntriesFromClassification();

const DEFAULT_ENTRY = { status: 'live' };

export function getFeatureStatus(path) {
  return FEATURE_REGISTRY[path] ?? { ...DEFAULT_ENTRY };
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
