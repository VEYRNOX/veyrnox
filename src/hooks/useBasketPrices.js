import { useQuery } from "@tanstack/react-query";
import { TOP_SYMBOLS } from "@/lib/cryptos";

// ── Fixed-basket 24h price-change feed (HOLDINGS-DECOUPLED). ──────────────────
//
// SECURITY (I2 — no holdings leak): this fetch ALWAYS requests ALL of
// TOP_SYMBOLS, same order, regardless of which assets the user holds, how many
// wallets exist, or real/decoy/empty state. The outbound request is therefore
// byte-identical for every user and every build (demo or real), so network
// traffic reveals nothing about holdings. NEVER narrow `fsyms` to owned assets.
//
// Same domain/provider as the existing price-alert feed
// (usePriceAlertNotifier.js, cryptocompare `pricemulti`); this uses the sibling
// `pricemultifull` endpoint, which adds CHANGEPCT24HOUR for the same basket.
// No new domain, no new fingerprint.
//
// FAIL-HONEST (I4): on any failure we return live=false and NO change value.
// Callers MUST hide the delta when live is false — a stale figure must never be
// shown as a live 24h move.

const BASKET = TOP_SYMBOLS.join(",");
const PRICE_URL =
  "https://min-api.cryptocompare.com/data/pricemultifull" +
  `?fsyms=${BASKET}&tsyms=USD&extraParams=safecryptowallet`;

const CACHE_MS = 10 * 60 * 1000; // constant cadence, not user-triggered

async function fetchBasket() {
  const res = await fetch(PRICE_URL);
  if (!res.ok) throw new Error(`basket fetch ${res.status}`);
  const raw = await res.json();
  const RAW = raw?.RAW;
  if (!RAW) throw new Error("basket: no RAW payload");
  const out = {};
  for (const sym of TOP_SYMBOLS) {
    const cell = RAW[sym]?.USD;
    out[sym] =
      cell && Number.isFinite(cell.CHANGEPCT24HOUR)
        ? { change24h: cell.CHANGEPCT24HOUR }
        : { change24h: null };
  }
  return out;
}

/**
 * Returns { changeFor(symbol), isLive }.
 * changeFor returns a finite 24h % when live, else null.
 * When isLive is false, callers must render NO delta.
 */
export function useBasketPrices() {
  const { data, isError, isSuccess } = useQuery({
    queryKey: ["basket-prices"],
    queryFn: fetchBasket,
    staleTime: CACHE_MS,
    refetchInterval: CACHE_MS,
    retry: 1,
  });
  const isLive = isSuccess && !isError && !!data;
  const changeFor = (symbol) => {
    if (!isLive) return null;
    const v = data?.[symbol]?.change24h;
    return Number.isFinite(v) ? v : null;
  };
  return { changeFor, isLive };
}
