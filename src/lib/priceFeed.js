// lib/priceFeed.js — OPT-IN live USD prices (OFF by default).
//
// I2 (no silent egress): no network call is ever made unless the user explicitly
// turns this on. When on, the request sends a FIXED, holdings-agnostic list of
// every supported symbol (never the user's enabled/held assets), so it can never
// be a holdings oracle. Generalizes the CryptoCompare usage already in
// Calculator.jsx / PriceAlerts (disclosed). USD-only here.
//
// I4 (fail closed): a failed fetch throws; callers fall back to the disclosed
// stale USD_RATES and label the figure approximate — never stale-as-live.

import { useQuery } from '@tanstack/react-query';
import { ASSETS } from '@/wallet-core/assets.js';

// localStorage opt-in pref. "1" = on / ABSENT = off (mirrors lib/biometric.js,
// wallet-core/auditLog.js). Absence = off is deliberate: a fresh device makes no
// price call. Device-global and holdings-blind — reveals nothing about holdings.
export const LIVE_PRICE_PREF_KEY = 'veyrnox-live-prices';

/** @returns {boolean} whether the user opted into live prices. */
export function isLivePricesEnabled() {
  try { return localStorage.getItem(LIVE_PRICE_PREF_KEY) === '1'; }
  catch { return false; } // storage unavailable → treat as OFF (no egress)
}

/** Persist the opt-in. OFF is stored as ABSENCE of the key (no lingering tell). */
export function setLivePricesEnabled(on) {
  try {
    if (on) localStorage.setItem(LIVE_PRICE_PREF_KEY, '1');
    else localStorage.removeItem(LIVE_PRICE_PREF_KEY);
  } catch { /* best-effort */ }
}

// The FIXED request set: every supported asset symbol, holdings-agnostic. Derived
// from the asset registry, deduped. The request is ALWAYS this full list, so it
// never narrows to what the user holds (no oracle).
export const SUPPORTED_SYMBOLS = Object.freeze([...new Set(ASSETS.map((a) => a.symbol))]);

/**
 * Fetch current USD prices for the full supported-symbol list. Returns a flat
 * { [symbol]: number } map. Throws on network / non-OK HTTP (the caller treats a
 * throw as "live unavailable" and falls back to the disclosed stale rates).
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchLivePricesUsd() {
  const fsyms = SUPPORTED_SYMBOLS.join(',');
  const res = await fetch(
    `https://min-api.cryptocompare.com/data/pricemulti?fsyms=${fsyms}&tsyms=USD&extraParams=safecryptowallet`,
  );
  if (!res.ok) throw new Error(`price feed HTTP ${res.status}`);
  const data = await res.json(); // { ETH: { USD: 3200 }, ... }
  const out = {};
  for (const s of SUPPORTED_SYMBOLS) {
    const v = data?.[s]?.USD;
    if (typeof v === 'number' && Number.isFinite(v)) out[s] = v;
  }
  return out;
}

/**
 * React hook: live USD prices, ONLY when opted in (enabled-gated ⇒ no fetch, no
 * egress when off). Conservative caching to minimize egress even when on. Returns
 * react-query's shape plus a stable `updatedAt`.
 */
export function useLivePrices() {
  const enabled = isLivePricesEnabled();
  const q = useQuery({
    queryKey: ['live-prices-usd'],
    queryFn: fetchLivePricesUsd,
    enabled,                 // OFF ⇒ query never runs ⇒ zero network call (I2)
    staleTime: 5 * 60_000,   // 5 min; no aggressive refetchInterval (privacy)
    retry: 1,
  });
  return {
    // Gate on `enabled` so the basis flips to approximate the INSTANT the user
    // opts out — react-query keeps cached data for ~gcTime after a query goes
    // disabled, and surfacing it would leave a stale "Live" label contradicting
    // the just-expressed preference (fail honest, I4). No egress impact (the
    // query is already not running); this only governs what we report.
    prices: enabled ? (q.data ?? null) : null,
    isLoading: q.isLoading && enabled,
    isError: q.isError,
    updatedAt: enabled ? (q.dataUpdatedAt || null) : null,
    refetch: q.refetch,
  };
}
