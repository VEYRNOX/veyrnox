import { useQuery } from "@tanstack/react-query";
import { TOP_SYMBOLS } from "@/lib/cryptos";

// ── Fixed-basket 24h market feed (HOLDINGS-DECOUPLED). ────────────────────────
//
// SECURITY (I2 — no holdings leak): this fetch ALWAYS requests ALL of
// TOP_SYMBOLS, same order, regardless of which assets the user holds, how many
// wallets exist, or real/decoy/empty state. The outbound request is therefore
// byte-identical for every user and every build (demo or real), so network
// traffic reveals nothing about holdings. NEVER narrow `fsyms` to owned assets.
//
// OPT-IN (I2 — no egress until enabled): callers may pass { enabled: false } to
// suppress the fetch entirely (e.g. the Watchlist when the user has not opted
// into live prices). Default `true` preserves the original always-on behavior
// for existing callers (TokenList).
//
// Same domain/provider as the existing price-alert feed; the `pricemultifull`
// endpoint adds CHANGEPCT24HOUR + HIGH24HOUR + LOW24HOUR for the same basket.
// No new domain, no new fingerprint.
//
// FAIL-HONEST (I4): on any failure isLive is false and every accessor returns
// null. Callers MUST hide the figure when not live — a stale number must never
// be shown as a live value.

const BASKET = TOP_SYMBOLS.join(",");
const PRICE_URL =
  "https://min-api.cryptocompare.com/data/pricemultifull" +
  `?fsyms=${BASKET}&tsyms=USD&extraParams=safecryptowallet`;

const CACHE_MS = 10 * 60 * 1000; // constant cadence, not user-triggered

// Pure: parse the cryptocompare pricemultifull payload into a per-symbol
// { change24h, high24h, low24h } map. Each field is kept only when finite, else
// null (fail-honest — a missing/garbage value must never render). Throws when
// the RAW payload is absent so the caller treats the whole basket as not-live.
export function parseBasket(raw) {
  const RAW = raw?.RAW;
  if (!RAW) throw new Error("basket: no RAW payload");
  const fin = (v) => (Number.isFinite(v) ? v : null);
  const out = {};
  for (const sym of TOP_SYMBOLS) {
    const cell = RAW[sym]?.USD;
    out[sym] = {
      change24h: cell ? fin(cell.CHANGEPCT24HOUR) : null,
      high24h: cell ? fin(cell.HIGH24HOUR) : null,
      low24h: cell ? fin(cell.LOW24HOUR) : null,
    };
  }
  return out;
}

async function fetchBasket() {
  const res = await fetch(PRICE_URL);
  if (!res.ok) throw new Error(`basket fetch ${res.status}`);
  return parseBasket(await res.json());
}

/**
 * Returns { changeFor, highLowFor, isLive }.
 * - changeFor(symbol): finite 24h % when live, else null.
 * - highLowFor(symbol): { high, low } (each finite or null) when live and at
 *   least one is present, else null.
 * - isLive: enabled AND the query succeeded with data.
 * When isLive is false, callers must render NO figures.
 * @param {{ enabled?: boolean }} [opts]
 */
export function useBasketPrices({ enabled = true } = {}) {
  const { data, isError, isSuccess } = useQuery({
    queryKey: ["basket-prices"],
    queryFn: fetchBasket,
    enabled,                 // OFF ⇒ query never runs ⇒ zero network call (I2)
    staleTime: CACHE_MS,
    refetchInterval: CACHE_MS,
    retry: 1,
  });
  // Gate on `enabled` so output flips to "not live" the instant a caller opts
  // out, even though react-query keeps cached data for ~gcTime (fail-honest).
  const isLive = enabled && isSuccess && !isError && !!data;
  const changeFor = (symbol) => {
    if (!isLive) return null;
    const v = data?.[symbol]?.change24h;
    return Number.isFinite(v) ? v : null;
  };
  const highLowFor = (symbol) => {
    if (!isLive) return null;
    const cell = data?.[symbol];
    if (!cell) return null;
    const high = Number.isFinite(cell.high24h) ? cell.high24h : null;
    const low = Number.isFinite(cell.low24h) ? cell.low24h : null;
    if (high == null && low == null) return null;
    return { high, low };
  };
  return { changeFor, highLowFor, isLive };
}
