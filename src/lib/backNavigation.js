import { getParentRoute } from './parentRoute';

const CURRENT_ROUTE_KEY = 'veyrnox-nav-current';
const PREVIOUS_ROUTE_KEY = 'veyrnox-nav-previous';

export function getRouteKey(locationLike) {
  if (!locationLike) return '/';
  if (typeof locationLike === 'string') return locationLike || '/';
  const pathname = locationLike.pathname || '/';
  const search = locationLike.search || '';
  const hash = locationLike.hash || '';
  return `${pathname}${search}${hash}` || '/';
}

export function rememberCurrentRoute(route) {
  if (typeof window === 'undefined') return;
  const current = getRouteKey(route);
  try {
    const previousCurrent = window.sessionStorage.getItem(CURRENT_ROUTE_KEY);
    if (previousCurrent === current) return;
    if (previousCurrent) {
      window.sessionStorage.setItem(PREVIOUS_ROUTE_KEY, previousCurrent);
    }
    window.sessionStorage.setItem(CURRENT_ROUTE_KEY, current);
  } catch {
    // Best-effort only; back navigation still has parent-route fallback.
  }
}

export function readPreviousRoute() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(PREVIOUS_ROUTE_KEY);
  } catch {
    return null;
  }
}

export function getFallbackBackTarget(locationLike) {
  const current = getRouteKey(locationLike);
  const parent = getParentRoute(locationLike?.pathname || '/');
  return parent === current ? null : parent;
}

export function getStoredBackTarget(locationLike) {
  const current = getRouteKey(locationLike);
  const stateReturnTo = locationLike?.state?.returnTo;
  if (typeof stateReturnTo === 'string' && stateReturnTo && stateReturnTo !== current) {
    return stateReturnTo;
  }
  if (typeof window !== 'undefined') {
    try {
      const storedCurrent = window.sessionStorage.getItem(CURRENT_ROUTE_KEY);
      if (storedCurrent && storedCurrent !== current) return storedCurrent;
    } catch {
      // Ignore storage failures and continue to the weaker fallbacks.
    }
  }
  const previous = readPreviousRoute();
  if (previous && previous !== current) return previous;
  return getFallbackBackTarget(locationLike);
}

export function hasBrowserBackHistory() {
  if (typeof window === 'undefined') return false;
  const idx = window.history?.state?.idx;
  if (Number.isInteger(idx)) return idx > 0;
  return window.history.length > 1;
}
