// src/lib/useLocale.js — React bindings for the leaf locale module.
//
// Kept SEPARATE from lib/locale.js so the underlying module stays acyclic
// (no React import): non-React callers (wallet-core paths, analytics) can
// keep importing lib/locale.js without pulling React in.
//
// Subscribes to LOCALE_CHANGED_EVENT so any component using this hook
// re-renders when the currency picker (or Settings toggle, later) writes a
// new preference. I3: write-gating lives in lib/locale.js — this hook has
// no write path of its own.

import { useEffect, useState, useCallback } from 'react';
import {
  LOCALE_CHANGED_EVENT,
  resolveLocale,
  resolveTimeZone,
  resolveFiatCurrency,
  setFiatCurrency as _setFiatCurrency,
} from './locale';

function snapshot() {
  return {
    locale: resolveLocale(),
    timeZone: resolveTimeZone(),
    fiatCurrency: resolveFiatCurrency(),
  };
}

/**
 * Returns { locale, timeZone, fiatCurrency, setFiatCurrency } and re-renders
 * whenever any locale preference changes. Reads only — writes go through the
 * I3-gated setters in lib/locale.js.
 */
export function useLocalePreferences() {
  const [state, setState] = useState(snapshot);

  useEffect(() => {
    const handler = () => setState(snapshot());
    window.addEventListener(LOCALE_CHANGED_EVENT, handler);
    // Also refresh on cross-tab storage change (another window changed it).
    const storageHandler = (e) => {
      if (!e || !e.key || e.key.startsWith('veyrnox-')) setState(snapshot());
    };
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener(LOCALE_CHANGED_EVENT, handler);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  const setFiatCurrency = useCallback((code) => {
    _setFiatCurrency(code);
    // I3-gated inside lib/locale.js: in a decoy/demo session this call is a
    // no-op and no LOCALE_CHANGED_EVENT fires, so state stays as-is. Correct.
  }, []);

  return { ...state, setFiatCurrency };
}
