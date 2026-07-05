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
import { fetchPortfolioPricesUsdCG as fetchPortfolioPricesUsd } from '@/lib/coinGecko.js';
import { PORTFOLIO_SYMBOLS } from '@/lib/cryptoCompare.js';
import { useWallet } from '@/lib/WalletProvider';
import { isDeniabilitySessionActive } from '@/wallet-core/deniabilitySession.js';
import { DEMO } from '@/api/demoClient';

// localStorage opt-in pref. "1" = on / ABSENT = off (mirrors lib/biometric.js,
// wallet-core/auditLog.js). Absence = off is deliberate: a fresh device makes no
// price call. Device-global and holdings-blind — reveals nothing about holdings.
export const LIVE_PRICE_PREF_KEY = 'veyrnox-live-prices';

/** @returns {boolean} whether live prices are enabled (OFF by default; on only if explicitly enabled). */
export function isLivePricesEnabled() {
  // I2-LIVEPRICE-DEFAULT-ON fix: ABSENT = off. '1' = on. Never egress on a fresh device.
  try { return localStorage.getItem(LIVE_PRICE_PREF_KEY) === '1'; }
  catch { return false; } // storage unavailable → treat as OFF (I2: fail closed)
}

/** Persist the preference. ON is stored as '1'; OFF is stored as ABSENCE of the key. */
export function setLivePricesEnabled(on) {
  try {
    if (on) localStorage.setItem(LIVE_PRICE_PREF_KEY, '1');
    else localStorage.removeItem(LIVE_PRICE_PREF_KEY);
  } catch { /* best-effort */ }
}

// Back-compat alias — the portfolio symbol universe now lives in cryptoCompare.js.
export const SUPPORTED_SYMBOLS = PORTFOLIO_SYMBOLS;

/**
 * Fetch current USD prices for the full supported-symbol list. Returns a flat
 * { [symbol]: number } map. Throws on network / non-OK HTTP (the caller treats a
 * throw as "live unavailable" and falls back to the disclosed stale rates).
 * Delegates to cryptoCompare.fetchPortfolioPricesUsd().
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchLivePricesUsd() {
  // I3-1 (2026-07-04 internal audit): this is a directly-callable export, not just
  // the hook's queryFn. A deniability session must make ZERO egress — fail closed
  // here so no caller path can leak a price request from a decoy/hidden session.
  if (isDeniabilitySessionActive()) throw new Error('I3: no egress in deniability session');
  return /** @type {Promise<Record<string, number>>} */ (fetchPortfolioPricesUsd());
}

/**
 * React hook: live USD prices, ONLY when opted in (enabled-gated ⇒ no fetch, no
 * egress when off). Conservative caching to minimize egress even when on. Returns
 * react-query's shape plus a stable `updatedAt`.
 */
export function useLivePrices() {
  // I3 guard: live prices default ON, so the localStorage pref alone would let a
  // decoy/hidden session poll CoinGecko. Also gate on the deniability flags so a
  // deniable session makes zero price egress (I3). DEMO suppression: the
  // live-prices pref is device-global, NOT demo-scoped, so a browser that once
  // opted in would poll CoinGecko the moment a demo tour opens (isDecoy/isHidden
  // are both false in demo) — so also fold !DEMO in (ECC audit M-6 pattern).
  // Disabled returns null data — identical to "live prices off", so there is no
  // visual tell.
  const { isDecoy, isHidden } = useWallet();
  const enabled = isLivePricesEnabled() && !isDecoy && !isHidden && !DEMO;
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
