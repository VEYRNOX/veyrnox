// lib/buy/useBuyEnabled.js
//
// Single source of truth for "should the Buy entry point render right now".
// Consumed by every Send-adjacent surface (Dashboard action row, Portfolio
// action row, CryptoDetailPage grid, Layout bottom nav, EmptyWalletState) —
// so if the ship gate or the deniability rules change, one file changes.
//
// TWO gates, both must pass:
//   1. VITE_BUY_ENABLED === 'true' — build-time ship gate. Default is 'false'
//      in .env.example; flip to 'true' only in staging or in a production
//      build cut AFTER the Transak partner agreement + prod keys are in.
//      Dead-code-eliminated by Vite when 'false' — the Buy tiles are gone
//      from the bundle, not merely hidden.
//   2. isDeniabilityOrDemoActive() === false — I3. Never render Buy in a
//      decoy/hidden session; never render it in a persisted demo. The React
//      subscription pattern is used so a mid-session flip (rare, but the
//      TierProvider precedent covers it) re-renders every consumer.

import { useSyncExternalStore } from 'react';
import {
  isDeniabilityOrDemoActive,
  DENIABILITY_SESSION_CHANGED_EVENT,
} from '../../wallet-core/deniabilitySession.js';

function subscribe(cb) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(DENIABILITY_SESSION_CHANGED_EVENT, cb);
  return () => window.removeEventListener(DENIABILITY_SESSION_CHANGED_EVENT, cb);
}

function getSnapshot() {
  // The build-time flag is a load-time constant, so a plain boolean expression
  // is enough for change detection. Deniability is the live axis.
  return !isDeniabilityOrDemoActive();
}

const SHIP_GATE = import.meta.env.VITE_BUY_ENABLED === 'true';

/** React hook: true iff the Buy entry should render. */
export function useBuyEnabled() {
  const notDeniable = useSyncExternalStore(subscribe, getSnapshot, () => true);
  return SHIP_GATE && notDeniable;
}

/** Non-React callers (URL builder wrappers, telemetry gates, etc.). */
export function isBuyEnabled() {
  return SHIP_GATE && !isDeniabilityOrDemoActive();
}
