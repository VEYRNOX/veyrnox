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
//   3. UK financial-promotion compliance block. If the device looks UK-based
//      from its locale region or timezone, hide Buy so the app does not render
//      a crypto on-ramp entry point to a UK consumer from this surface.

import { useSyncExternalStore } from 'react';
import {
  isDeniabilityOrDemoActive,
  DENIABILITY_SESSION_CHANGED_EVENT,
} from '../../wallet-core/deniabilitySession.js';
import {
  LOCALE_CHANGED_EVENT,
  resolveLocale,
  resolveTimeZone,
} from '@/lib/locale.js';

const UK_REGION_RE = /(?:^|[-_])(GB|UK)(?:$|[-_])/i;
const UK_TIME_ZONES = new Set([
  'Europe/London',
]);

function subscribe(cb) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(DENIABILITY_SESSION_CHANGED_EVENT, cb);
  window.addEventListener(LOCALE_CHANGED_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(DENIABILITY_SESSION_CHANGED_EVENT, cb);
    window.removeEventListener(LOCALE_CHANGED_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export function isUkBuyBlocked(opts = {}) {
  const locale = typeof opts.locale === 'string' ? opts.locale : resolveLocale();
  const timeZone = typeof opts.timeZone === 'string' ? opts.timeZone : resolveTimeZone();
  return UK_REGION_RE.test(locale) || UK_TIME_ZONES.has(timeZone);
}

function getSnapshot() {
  // The build-time flag is a load-time constant, so a plain boolean expression
  // is enough for change detection. Deniability and locale/timezone are live.
  return !isDeniabilityOrDemoActive() && !isUkBuyBlocked();
}

const SHIP_GATE = import.meta.env.VITE_BUY_ENABLED === 'true';

/** React hook: true iff the Buy entry should render. */
export function useBuyEnabled() {
  // getServerSnapshot returns FALSE, not true. There is no SSR today so this is
  // inert, but the default for a fail-closed gate must be "hide" — a snapshot
  // that claims "not in deniability" is the wrong way to be wrong (I4).
  const eligible = useSyncExternalStore(subscribe, getSnapshot, () => false);
  return SHIP_GATE && eligible;
}

/** Non-React callers (URL builder wrappers, telemetry gates, etc.). */
export function isBuyEnabled() {
  return SHIP_GATE && !isDeniabilityOrDemoActive() && !isUkBuyBlocked();
}
