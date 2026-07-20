// @ts-nocheck
// lib/portfolioBalances.js — unified multi-wallet portfolio aggregation.
//
// Computes, across ALL wallets in the vault and the assets each has ENABLED, the
// per-asset amount + USD value and a grand total. It reuses the EXISTING per-
// chain providers (evm/btc/sol) and the existing USD_RATES — no new network
// surface, no new price source.
//
// I4 FAIL-CLOSED (reconciliation brief, Finding 2): a balance read has THREE
// outcomes, not two — a number (read OK, incl. a genuine 0/empty wallet) or
// `null` (read FAILED: offline, flaky RPC). A failed read is `indeterminate`,
// never folded into a silent `0` — otherwise an unreachable chain would make the
// portfolio total read LOWER than reality with no signal (absence treated as
// data). The view still never throws; `indeterminate` is a value, and the UI
// marks incompleteness instead of understating. This handling is identical in
// decoy and real sessions (Finding 3 uniformity) — there is no isDecoy branch.
//
// PRIVACY/SECURITY: this only reads PUBLIC addresses already derived in
// WalletProvider. No private keys, no signing, no writes. The I3 set-seal is
// UPSTREAM (vault decryption): computePortfolio reads ONLY the addresses handed
// to it, so a decoy session can never reach a real-set address (Finding 1).

import { Contract, formatUnits } from 'ethers';
import { useQuery } from '@tanstack/react-query';
import { ASSETS, getAsset } from '@/wallet-core/assets.js';
import { USD_RATES } from '@/lib/cryptos.js';
import { getProvider, getBalanceEth } from '@/wallet-core/evm/provider.js';
import { getToken, ERC20_ABI } from '@/wallet-core/evm/tokens.js';
import { getBalanceSats } from '@/wallet-core/btc/provider.js';
import { getBalanceSol } from '@/wallet-core/sol/provider.js';
import { useLivePrices } from '@/lib/priceFeed.js';
import { isDeniabilitySessionActive } from '@/wallet-core/deniabilitySession.js';

/** USD price for a symbol. Uses livePrices map when given and finite, else falls
 * back to USD_RATES (mock rates, display only). Stablecoins ≈ 1. The optional
 * livePrices argument is additive — omitting it reproduces previous behaviour. */
export function usdRate(symbol, livePrices) {
  const live = livePrices && livePrices[symbol];
  if (typeof live === 'number' && Number.isFinite(live)) return live;
  return USD_RATES[symbol] ?? (symbol === 'USDC' || symbol === 'USDT' ? 1 : 0);
}

/**
 * Best-effort balance for ONE asset at a wallet's addresses. Returns a Number
 * amount (in the asset's own units) when the read succeeds — including a genuine
 * `0` for an empty wallet — or `null` when the read FAILS (offline / flaky RPC).
 * `null` is the I4 fail-closed `indeterminate` signal; it is NOT the same as `0`
 * (read OK, empty). A missing/underived address is a genuine 0, not a failure.
 * Never throws.
 * @param {object} asset - an ASSETS entry { symbol, family, chain }
 * @param {{evm?:string, btc?:string, sol?:string}} addr - the wallet's addresses
 * @returns {Promise<number|null>} amount, or null when indeterminate
 */
export async function fetchAssetAmount(asset, addr) {
  // I3 zero-egress: an ERC-20 balance is read through a raw ethers Contract that
  // does NOT route through getBalanceEth's own deniability guard. Gate it here,
  // BEFORE the try/catch — so it THROWS (fail-closed) rather than being folded
  // into the catch's silent `null`. A decoy/hidden session must know there was no
  // real balance check, not read a fabricated 0. (evm/btc/sol keep their own
  // provider-level guards.)
  if (asset && asset.family === 'erc20' && isDeniabilitySessionActive()) {
    throw new Error('I3: no egress in deniability session');
  }
  // FLAG IND-1 fix: a read that RESOLVES to a non-finite value (a provider returning
  // undefined/NaN without throwing) must be treated as indeterminate — NOT folded to a
  // confident 0. `Number(undefined) || 0` was silently showing $0 for an unknown
  // balance, which for a wallet reads as "your funds are gone". `finite()` returns the
  // number when it is genuinely finite, else null, so the read joins the same
  // indeterminate path as a thrown error (callers key off `amount === null`).
  const finite = (n) => (Number.isFinite(n) ? n : null);
  try {
    if (!asset || !addr) return 0;
    if (asset.family === 'evm') {
      if (!addr.evm) return 0;
      return finite(Number(await getBalanceEth(asset.chain, addr.evm)));
    }
    if (asset.family === 'erc20') {
      if (!addr.evm) return 0;
      const token = getToken(asset.chain, asset.symbol);
      const c = new Contract(token.address, ERC20_ABI, getProvider(asset.chain));
      const raw = await c.balanceOf(addr.evm);
      return finite(Number(formatUnits(raw, token.decimals)));
    }
    if (asset.family === 'btc') {
      if (!addr.btc) return 0;
      return finite(Number(await getBalanceSats(asset.chain, addr.btc)) / 1e8);
    }
    if (asset.family === 'solana') {
      if (!addr.sol) return 0;
      return finite(Number(await getBalanceSol(asset.chain, addr.sol)));
    }
    return 0;
  } catch (err) {
    // Surface the error so it is visible in the console (not silently swallowed),
    // while still returning null so the UI can signal indeterminate rather than 0.
    console.warn('[portfolioBalances] fetchAssetAmount failed for', asset?.symbol, ':', err?.message ?? err);
    return null; // read FAILED → indeterminate (I4 fail-closed), never a silent 0
  }
}

/**
 * Aggregate the whole portfolio. A failed read (amount === null) is carried as
 * `indeterminate` at every level and is NEVER summed as 0 (I4 fail-closed):
 *   {
 *     byWallet: { [id]: { assets: [{symbol, amount, usd, indeterminate}],
 *                         total, indeterminate } },
 *     grandTotal,          // USD across all READABLE wallets + assets
 *     assetTotals: { [symbol]: { amount, usd, indeterminate } },
 *     indeterminate,       // true if ANY constituent read failed
 *   }
 * `total`/`grandTotal`/`assetTotals` sum only what was readable; a true
 * `indeterminate` means the figure is incomplete, so the UI marks it rather than
 * presenting a silently-understated total as fact.
 * @param {Array<{id:any,enabledAssets:any}>} wallets
 * @param {Object.<string,{evm:any,btc:any,sol:any}>} walletAddresses
 */
export async function computePortfolio(wallets, walletAddresses, livePrices) {
  // I3 zero-egress choke-point: in a deniability (decoy/hidden) session the whole
  // portfolio aggregation must make ZERO backend calls. Return a clean empty
  // shape per wallet (callers render 0 balances) instead of relying solely on
  // every downstream provider carrying its own guard — an explicit first line so
  // a future unguarded provider can never silently leak.
  if (isDeniabilitySessionActive()) return null;
  const byWallet = {};
  const assetTotals = {};
  let grandTotal = 0;
  let anyIndeterminate = false;

  // Flatten every (wallet, enabled asset) pair, fetch all in parallel.
  const jobs = [];
  for (const w of wallets) {
    byWallet[w.id] = { assets: [], total: 0, indeterminate: false };
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
    const indeterminate = amount === null; // read FAILED, not an empty wallet
    const usd = indeterminate ? null : amount * usdRate(symbol, livePrices);
    byWallet[walletId].assets.push({ symbol, amount, usd, indeterminate });
    if (!assetTotals[symbol]) assetTotals[symbol] = { amount: 0, usd: 0, indeterminate: false };
    if (indeterminate) {
      byWallet[walletId].indeterminate = true;
      assetTotals[symbol].indeterminate = true;
      anyIndeterminate = true;
    } else {
      byWallet[walletId].total += usd;
      grandTotal += usd;
      assetTotals[symbol].amount += amount;
      assetTotals[symbol].usd += usd;
    }
  }
  // Keep each wallet's asset rows in canonical ASSETS order for a stable UI.
  const order = ASSETS.map((a) => a.symbol);
  for (const id of Object.keys(byWallet)) {
    byWallet[id].assets.sort((a, b) => order.indexOf(a.symbol) - order.indexOf(b.symbol));
  }
  return { byWallet, grandTotal, assetTotals, indeterminate: anyIndeterminate };
}

/**
 * Sum a set of wallets' USD totals into one figure plus an incompleteness flag.
 * `total` adds only the readable wallet totals; `indeterminate` is true when ANY
 * included wallet had a failed read, so the caller can mark the total incomplete
 * instead of silently understating it (I4 fail-closed, Finding 2). Pure and
 * session-agnostic — it takes NO isDecoy/isHidden context, so decoy and real
 * sessions render identically from identical data (Finding 3 uniformity).
 * @param {Array<{id:any}>} pfWallets - wallets in the active portfolio
 * @param {Object.<string,{total:number, indeterminate?:boolean}>} byWallet
 * @returns {{total:number, indeterminate:boolean}}
 */
export function sumPortfolioTotal(pfWallets, byWallet) {
  let total = 0;
  let indeterminate = false;
  for (const w of pfWallets) {
    const entry = byWallet[w.id];
    if (!entry) continue; // not yet computed (loading) — handled by the caller
    total += entry.total || 0;
    if (entry.indeterminate) indeterminate = true;
  }
  return { total, indeterminate };
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
 * Also composes useLivePrices and threads the live map into computePortfolio
 * when prices are available (priceBasis === 'live'), else falls back to the
 * built-in USD_RATES (priceBasis === 'approx'). Additive: existing callers
 * that ignore priceBasis/pricesUpdatedAt/refetchPrices are unaffected.
 */
export function usePortfolio(wallets, walletAddresses) {
  const enabled = Array.isArray(wallets) && wallets.length > 0;
  const { prices, isError, updatedAt, refetch: refetchPrices } = useLivePrices();
  // Live basis only when opted-in AND the fetch produced prices without error.
  const liveOk = prices != null && !isError;
  const livePrices = liveOk ? prices : undefined;
  const query = useQuery({
    // Key includes a live/approx marker so flipping the basis refetches the total.
    queryKey: ['portfolio', liveOk ? 'live' : 'approx', portfolioKey(wallets || [], walletAddresses || {})],
    queryFn: () => computePortfolio(wallets, walletAddresses || {}, livePrices),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });
  return { ...query, priceBasis: liveOk ? 'live' : 'approx', pricesUpdatedAt: updatedAt, refetchPrices };
}
