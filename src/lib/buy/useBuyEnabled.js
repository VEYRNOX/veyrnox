import { useSyncExternalStore } from 'react';
import {
  isDeniabilityOrDemoActive,
  DENIABILITY_SESSION_CHANGED_EVENT,
} from '@/wallet-core/deniabilitySession.js';

const SHIP_GATE = import.meta.env.VITE_BUY_ENABLED === 'true';

function subscribe(cb) {
  window.addEventListener(DENIABILITY_SESSION_CHANGED_EVENT, cb);
  return () => window.removeEventListener(DENIABILITY_SESSION_CHANGED_EVENT, cb);
}

function getSnapshot() {
  return !isDeniabilityOrDemoActive();
}

export function useBuyEnabled() {
  const notDeniable = useSyncExternalStore(subscribe, getSnapshot, () => true);
  return SHIP_GATE && notDeniable;
}

export function isBuyEnabled() {
  return SHIP_GATE && !isDeniabilityOrDemoActive();
}
