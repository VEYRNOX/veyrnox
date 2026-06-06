// lib/sendWalletSource.js
//
// Adapts the WalletProvider's multi-seed wallet model to the Send screen.
//
// WHY THIS EXISTS
// The Send screen historically read its wallets from base44.entities.Wallet.list()
// — the DEMO data layer, which is EMPTY in a live build — so its "From Wallet"
// dropdown was blank even though the dashboard (WalletPortfolioPage, which reads the
// live vault via useWallet) rendered Wallet 1 fine. Same wallet, two sources. These
// helpers bind Send to the SAME source the dashboard uses.
//
// MODEL SHIFT
// In the live vault a "wallet" is a SEED with an `enabledAssets` list (one wallet
// holds every chain). The Send flow, by contrast, acts on a single (wallet, asset)
// pair and downstream expects a record shaped like the old base44 wallet
// (.id/.name/.currency/.address/.balance). buildSendWallet() produces exactly that
// shape from a chosen wallet + asset, so the large body of send / spend-limit /
// poison-screening logic in SendCrypto is untouched.
//
// ADDRESS SOURCE: resolveReceive() (the same fund-safety mapping the Receive screen
// uses) pulls the per-asset address from the ACTIVE wallet's already-derived public
// accounts — EVM shared / BTC bech32 / SOL base58. The caller MUST keep the selected
// wallet active (switchWallet) so `accounts`/`btcAccount`/`solAccount` belong to it.

import { resolveReceive } from '@/lib/receiveAddress';

/**
 * Default "From Wallet": the active wallet when it is in the list, else the first
 * wallet, else "" (no wallet — locked/explore). Mirrors WalletProvider's own
 * active-id fallback so Send pre-selects exactly the wallet the dashboard marks
 * Active. With a single wallet this is the auto-select.
 */
export function defaultWalletId(wallets, activeWalletId) {
  if (!Array.isArray(wallets) || wallets.length === 0) return '';
  if (activeWalletId && wallets.some((w) => w.id === activeWalletId)) return activeWalletId;
  return wallets[0].id;
}

/**
 * The assets to show for a wallet — exactly its enabledAssets, in stored (canonical)
 * order. This is the SAME list the dashboard renders per wallet. Empty for an
 * unknown id.
 */
export function walletAssetSymbols(wallets, walletId) {
  const w = (wallets || []).find((x) => x.id === walletId);
  return Array.isArray(w?.enabledAssets) ? w.enabledAssets : [];
}

/**
 * Default asset for a wallet: keep the current pick if it is still enabled; else
 * prefer ETH (the one live/sendable asset) when shown; else the first enabled asset;
 * else "".
 */
export function defaultAssetSymbol(enabledAssets, current) {
  const list = Array.isArray(enabledAssets) ? enabledAssets : [];
  if (current && list.includes(current)) return current;
  if (list.includes('ETH')) return 'ETH';
  return list[0] || '';
}

/**
 * Build the per-(wallet, asset) record the Send screen consumes, shaped like the old
 * base44 wallet so downstream logic is unchanged. Returns null until BOTH a wallet
 * and an asset are chosen (or the wallet id is unknown).
 *
 * @param {object} args
 * @param {Array}  args.wallets      live vault wallets [{ id, name, enabledAssets }]
 * @param {string} args.walletId     chosen wallet id
 * @param {string} args.assetSymbol  chosen asset symbol
 * @param {Array}  args.accounts     active wallet's derived EVM accounts
 * @param {object} args.btcAccount   active wallet's derived BTC account
 * @param {object} args.solAccount   active wallet's derived SOL account
 */
export function buildSendWallet({ wallets, walletId, assetSymbol, accounts, btcAccount, solAccount }) {
  if (!walletId || !assetSymbol) return null;
  const w = (wallets || []).find((x) => x.id === walletId);
  if (!w) return null;
  const r = resolveReceive(assetSymbol, { accounts, btcAccount, solAccount });
  return {
    id: w.id,
    name: w.name,
    currency: assetSymbol,
    address: r?.address ?? null,
    // The live model holds no stored balance — the chain is the source of truth and
    // is read live in the Send screen. 0 is the display fallback for not-yet-live
    // assets (whose live balance read is intentionally skipped).
    balance: 0,
  };
}
