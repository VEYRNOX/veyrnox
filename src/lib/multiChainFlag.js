// lib/multiChainFlag.js
//
// Phase 1b per-chain expansion feature flag. Off by default (owner directive:
// "dual-route, flag OFF-by-default"). Same style as isLivePricesEnabled in
// priceFeed.js, but this one is a build-time env read (no user preference —
// this gates whether experimental rows exist at all, not a display toggle).

/** True when the 10 new experimental (symbol, chain) rows should render. */
export function isMultiChainRowsEnabled() {
  return import.meta.env.VITE_MULTI_CHAIN_ROWS === '1';
}
