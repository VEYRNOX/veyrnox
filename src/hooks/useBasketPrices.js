import { useQuery } from "@tanstack/react-query";
import { fetchMarketChanges24h } from "@/lib/cryptoCompare.js";
import { isLivePricesEnabled } from "@/lib/priceFeed.js";

// ── Fixed-basket 24h price-change feed (HOLDINGS-DECOUPLED). ──────────────────
//
// SECURITY (I2 — no holdings leak): this fetch ALWAYS requests ALL of
// MARKET_SYMBOLS, same order, regardless of which assets the user holds, how many
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

const CACHE_MS = 10 * 60 * 1000; // constant cadence, not user-triggered

/**
 * Returns { changeFor(symbol), isLive }.
 * changeFor returns a finite 24h % when live, else null.
 * When isLive is false, callers must render NO delta.
 */
export function useBasketPrices() {
  const { data, isError, isSuccess } = useQuery({
    queryKey: ["basket-prices"],
    queryFn: fetchMarketChanges24h,
    enabled: isLivePricesEnabled(),   // off by default ⇒ no 24h-change egress
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
