// @ts-nocheck
import { useQuery } from '@tanstack/react-query';
import { useWallet } from '../lib/WalletProvider';
import { usePortfolio } from '../lib/portfolioBalances';
import { useLivePrices, isLivePricesEnabled } from '../lib/priceFeed';
import { fetchAssetHistory } from '../lib/txHistory';
import { getAsset } from '../wallet-core/assets';
import { isDeniabilitySessionActive } from '../wallet-core/deniabilitySession';

export function useAnalytics() {
  const { isUnlocked, wallets, walletAddresses } = useWallet();

  const { data: portfolio, isLoading: portfolioLoading, error: portfolioError } = usePortfolio(
    isUnlocked ? wallets : [],
    walletAddresses
  );

  const { prices: livePrices, isLoading: pricesLoading } = useLivePrices();
  const pricesEnabled = isLivePricesEnabled();

  const walletKey = wallets
    .map((w) => `${w.id}:${(w.enabledAssets || []).sort().join(',')}`)
    .join('|');
  const addrKey = Object.entries(walletAddresses)
    .map(([id, a]) => `${id}:${a?.evm || ''}:${a?.btc || ''}:${a?.sol || ''}`)
    .sort()
    .join('|');

  const historyQuery = useQuery({
    queryKey: ['analytics-history', walletKey, addrKey],
    queryFn: async () => {
      const allTxs = [];
      const failedAssets = [];
      for (const wallet of wallets) {
        const addrs = walletAddresses[wallet.id] || {};
        for (const asset of wallet.enabledAssets || []) {
          const assetDef = getAsset(asset);
          if (!assetDef) continue;
          const { family } = assetDef;
          let address;
          if (family === 'btc') {
            address = addrs.btc;
          } else if (family === 'solana') {
            address = addrs.sol;
          } else {
            address = addrs.evm;
          }
          if (!address) continue;
          try {
            const result = await fetchAssetHistory({ asset, address, demo: false });
            if (result.supported && result.transactions) {
              allTxs.push(...result.transactions);
            }
          } catch {
            failedAssets.push(asset);
          }
        }
      }
      return { transactions: allTxs, failedAssets };
    },
    // I3 zero-egress: disable in a deniability (decoy/hidden) session so no
    // per-asset address->indexer disclosure is attempted.
    enabled: isUnlocked && wallets.length > 0 && !isDeniabilitySessionActive(),
    staleTime: 60_000,
  });

  return {
    portfolio: isUnlocked ? (portfolio ?? null) : null,
    history: historyQuery.data?.transactions ?? [],
    historyPartial: (historyQuery.data?.failedAssets?.length ?? 0) > 0,
    prices: pricesEnabled ? livePrices : null,
    pricesEnabled,
    loading: portfolioLoading || (historyQuery.isLoading && isUnlocked),
    error: historyQuery.error ?? portfolioError ?? null,
  };
}
