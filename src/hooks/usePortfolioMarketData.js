import { useQuery } from "@tanstack/react-query";
import { fetchPortfolioMarkets24hCG } from "@/lib/coinGecko.js";
import { isLivePricesEnabled } from "@/lib/priceFeed.js";
import { useWallet } from "@/lib/WalletProvider";
import { DEMO } from "@/api/demoClient";

// Portfolio-basket spot USD price + 24h % change, one poll.
//
// SECURITY — same I2/I3 shape as useBasketPrices:
//   • I2: request is fixed to PORTFOLIO_CG_IDS (see coinGecko.js); NEVER
//     narrowed to owned assets — outbound bytes reveal nothing about holdings.
//   • I3: decoy/hidden/DEMO sessions do NOT poll (react-query `enabled` gate).
//     When off/deniable/demo, isLive is false and priceFor/changeFor return
//     null — callers MUST render nothing (no stale/mock values).
//   • I4 fail-honest: any fetch error → isLive=false, null-valued getters.

const CACHE_MS = 10 * 60 * 1000; // matches useBasketPrices cadence

export function usePortfolioMarketData() {
  const { isDecoy, isHidden } = useWallet();
  const { data, isError, isSuccess } = useQuery({
    queryKey: ["portfolio-markets"],
    queryFn: fetchPortfolioMarkets24hCG,
    enabled: isLivePricesEnabled() && !isDecoy && !isHidden && !DEMO,
    staleTime: CACHE_MS,
    refetchInterval: CACHE_MS,
    retry: 1,
  });
  const isLive = isSuccess && !isError && !!data;
  const priceFor = (symbol) => {
    if (!isLive) return null;
    const v = data?.[symbol]?.price;
    return Number.isFinite(v) ? v : null;
  };
  const changeFor = (symbol) => {
    if (!isLive) return null;
    const v = data?.[symbol]?.change24h;
    return Number.isFinite(v) ? v : null;
  };
  return { priceFor, changeFor, isLive };
}
