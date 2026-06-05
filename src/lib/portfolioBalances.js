// lib/portfolioBalances.js — unified multi-wallet portfolio aggregation.
//
// Computes, across ALL wallets in the vault and the assets each has ENABLED, the
// per-asset amount + USD value and a grand total. It reuses the EXISTING per-
// chain providers (evm/btc/sol) and the existing USD_RATES — no new network
// surface, no new price source. Every balance read is best-effort: a chain that
// is unreachable (offline simulator, flaky testnet RPC) yields 0, never an error
// that breaks the view. Testnet balances are commonly 0, which is shown honestly.
//
// PRIVACY/SECURITY: this only reads PUBLIC addresses already derived in
// WalletProvider. No private keys, no signing, no writes.

import { Contract, formatUnits } from 'ethers';
import { useQuery } from '@tanstack/react-query';
import { ASSETS, getAsset } from '@/wallet-core/assets.js';
import { USD_RATES } from '@/lib/cryptos.js';
import { getProvider, getBalanceEth } from '@/wallet-core/evm/provider.js';
import { getToken, ERC20_ABI } from '@/wallet-core/evm/tokens.js';
import { getBalanceSats } from '@/wallet-core/btc/provider.js';
import { getBalanceSol } from '@/wallet-core/sol/provider.js';

/** USD price for a symbol (mock rates, display only). Stablecoins ≈ 1. */
export function usdRate(symbol) {
  return USD_RATES[symbol] ?? (symbol === 'USDC' || symbol === 'USDT' ? 1 : 0);
}

/**
 * Best-effort balance for ONE asset at a wallet's addresses. Returns a Number
 * amount (in the asset's own units). Never throws — resolves 0 on any failure.
 * @param {object} asset - an ASSETS entry { symbol, family, chain }
 * @param {{evm?:string, btc?:string, sol?:string}} addr - the wallet's addresses
 */
export async function fetchAssetAmount(asset, addr) {
  try {
    if (!asset || !addr) return 0;
    if (asset.family === 'evm') {
      if (!addr.evm) return 0;
      return Number(await getBalanceEth(asset.chain, addr.evm)) || 0;
    }
    if (asset.family === 'erc20') {
      if (!addr.evm) return 0;
      const token = getToken(asset.chain, asset.symbol);
      const c = new Contract(token.address, ERC20_ABI, getProvider(asset.chain));
      const raw = await c.balanceOf(addr.evm);
      return Number(formatUnits(raw, token.decimals)) || 0;
    }
    if (asset.family === 'btc') {
      if (!addr.btc) return 0;
      return Number(await getBalanceSats(asset.chain, addr.btc)) / 1e8 || 0;
    }
    if (asset.family === 'solana') {
      if (!addr.sol) return 0;
      return Number(await getBalanceSol(asset.chain, addr.sol)) || 0;
    }
    return 0;
  } catch {
    return 0; // offline / flaky RPC / unfunded → honest zero, never a broken view
  }
}

/**
 * Aggregate the whole portfolio. Returns:
 *   {
 *     byWallet: { [id]: { assets: [{symbol, amount, usd}], total } },
 *     grandTotal,         // USD across all wallets + assets
 *     assetTotals: { [symbol]: { amount, usd } }, // summed across wallets
 *   }
 * @param {Array<{id,enabledAssets}>} wallets
 * @param {{[id]:{evm,btc,sol}}} walletAddresses
 */
export async function computePortfolio(wallets, walletAddresses) {
  const byWallet = {};
  const assetTotals = {};
  let grandTotal = 0;

  // Flatten every (wallet, enabled asset) pair, fetch all in parallel.
  const jobs = [];
  for (const w of wallets) {
    byWallet[w.id] = { assets: [], total: 0 };
    for (const symbol of w.enabledAssets || []) {
      const asset = getAsset(symbol);
      if (!asset) continue;
      jobs.push(
        fetchAssetAmount(asset, walletAddresses[w.id] || {}).then((amount) => ({
          walletId: w.id, symbol, amount,
        })),
      );
    }
  }
  const results = await Promise.all(jobs);
  for (const { walletId, symbol, amount } of results) {
    const usd = amount * usdRate(symbol);
    byWallet[walletId].assets.push({ symbol, amount, usd });
    byWallet[walletId].total += usd;
    grandTotal += usd;
    if (!assetTotals[symbol]) assetTotals[symbol] = { amount: 0, usd: 0 };
    assetTotals[symbol].amount += amount;
    assetTotals[symbol].usd += usd;
  }
  // Keep each wallet's asset rows in canonical ASSETS order for a stable UI.
  const order = ASSETS.map((a) => a.symbol);
  for (const id of Object.keys(byWallet)) {
    byWallet[id].assets.sort((a, b) => order.indexOf(a.symbol) - order.indexOf(b.symbol));
  }
  return { byWallet, grandTotal, assetTotals };
}

// Stable cache key: which wallets, which addresses, which enabled assets. When
// any of those change the portfolio refetches; otherwise it serves cached.
function portfolioKey(wallets, walletAddresses) {
  return wallets.map((w) => {
    const a = walletAddresses[w.id] || {};
    return `${w.id}:${a.evm || ''}:${a.btc || ''}:${a.sol || ''}:${(w.enabledAssets || []).join(',')}`;
  }).join('|');
}

/**
 * React hook: live portfolio totals for the given wallets. Resilient + cached
 * (60s). Returns react-query's { data, isLoading, refetch } where data is the
 * computePortfolio() shape (or a zeroed shell while loading).
 */
export function usePortfolio(wallets, walletAddresses) {
  const enabled = Array.isArray(wallets) && wallets.length > 0;
  return useQuery({
    queryKey: ['portfolio', portfolioKey(wallets || [], walletAddresses || {})],
    queryFn: () => computePortfolio(wallets, walletAddresses || {}),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });
}
