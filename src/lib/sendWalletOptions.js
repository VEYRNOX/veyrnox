// src/lib/sendWalletOptions.js
//
// (Asset-selection helpers live at the bottom of this file; see
// buildSendAssetOptions / resolveSelectedSendWallet.)
//
// Single source of truth for the Send screen's "From Wallet" picker options.
//
// WHY THIS EXISTS: the picker used to read ONLY base44.entities.Wallet — a cache
// of public addresses that is written SOLELY as a side effect of opening the HD
// Wallet Manager (its persistAccounts sync). A freshly created real wallet, taken
// straight from the unlock gate to Send, leaves that cache empty, so the picker
// had nothing to render and appeared inert. The demo tour pre-seeds rich Wallet
// entities, which masked the bug. The AUTHORITATIVE source for a real wallet is
// the unlocked HD session (WalletProvider): each wallet's name + its derived
// primary EVM address. This helper merges the two so the picker is correct in
// BOTH modes, with NO dependency on the HD-manager cache having been visited.

import { ASSETS, getAsset, isEvmFamily } from '@/wallet-core/assets';

// Build one sendable option per HD wallet, resolved to its primary EVM address.
// ETH (Sepolia testnet) is the only live/sendable asset in this build, and every
// HD wallet's primary EVM account backs it — matching exactly what the HD Wallet
// Manager caches. Balance is read LIVE from chain by the Send screen (chain is
// the source of truth), so the option carries a 0 placeholder, never a stored
// value. A wallet whose EVM address hasn't derived yet is omitted so the picker
// never offers a value-less item.
export function buildHdWalletOptions(hdWallets = [], walletAddresses = {}) {
  return (hdWallets || [])
    .map((w) => ({
      id: w.id,
      name: w.name,
      currency: 'ETH',
      address: (walletAddresses || {})[w.id]?.evm,
      balance: 0,
    }))
    .filter((w) => w.address);
}

// Prefer the authoritative HD session when the vault is unlocked and has derived
// at least one address (correct wallet names, always present for a real wallet);
// otherwise fall back to the entity store, which backs the demo tour (pre-seeded)
// and any rows the HD-manager cache previously wrote. This makes a real wallet
// populate without depending on the cache having been visited, while leaving the
// demo's behaviour unchanged.
export function resolveSendWallets({ isUnlocked, hdOptions = [], entityWallets = [] }) {
  return isUnlocked && hdOptions.length ? hdOptions : entityWallets;
}

// The id to auto-select: when exactly one wallet is available, pick it so the
// user never faces an empty "Select wallet" prompt for their only wallet. Returns
// null when there isn't exactly one (0 = nothing to pick; >1 = the user must
// choose). A non-empty `current` short-circuits so an explicit choice is never
// overridden.
export function autoSelectWalletId(wallets = [], current = '') {
  if (current) return current;
  return (wallets || []).length === 1 ? wallets[0].id : null;
}

// ── ASSET SELECTION (Model B) ───────────────────────────────────────────────
// A Veyrnox wallet is ONE HD seed that derives a per-chain address; the asset
// the user picks drives the chain, from-address, balance read, gas symbol and
// signing scheme together — they are not independent. These two pure helpers
// back the Send screen's asset selector; everything downstream of `currency`
// (networkKey, getBalance vs token balanceOf, signAndBroadcast vs sendToken,
// the canSend gate) is already generic over the selected asset.

// The list rendered in the Send screen's "Asset" picker: one entry per registry
// asset, in registry order. EVM + ERC-20 assets are selectable because their
// whole send/receive stack flows from `currency`; BTC and SOL are shown but
// DISABLED ("coming soon") because this screen's dispatch (signAndBroadcast /
// sendToken) is EVM-only — their build/sign/broadcast path isn't wired here yet.
// NOTE: `disabled` is about dispatch availability on THIS screen, NOT the asset's
// send capability — that stays governed by canSend()/status in assets.js, so a
// receive_only EVM asset is still selectable (shows chain/address/balance) while
// its Continue button stays gated until it's verified-and-flipped to live.
export function buildSendAssetOptions() {
  return ASSETS.map((a) => ({
    symbol: a.symbol,
    name: a.name,
    family: a.family,
    disabled: !isEvmFamily(a),
  }));
}

// Fold the chosen asset onto the chosen HD wallet to produce the single
// `selectedWallet` the rest of the Send screen reads ({ id, name, currency,
// address, balance }). In HD (asset) mode the address is resolved from the
// wallet's derived set by the asset's family: evm + erc20 share the one EVM
// address, btc → bech32, solana → ed25519. Balance is always a 0 placeholder —
// the chain is read live. In demo (non-asset) mode the picked entity row already
// encodes its own currency/address/balance, so it's returned untouched.
export function resolveSelectedSendWallet({ isAssetMode, walletPick, assetSymbol, walletAddresses = {} }) {
  if (!walletPick) return null;
  if (!isAssetMode) return walletPick;
  const asset = getAsset(assetSymbol);
  if (!asset) return null;
  const derived = (walletAddresses || {})[walletPick.id] || {};
  const address =
    asset.family === 'btc' ? derived.btc
    : asset.family === 'solana' ? derived.sol
    : derived.evm; // evm + erc20 share the one secp256k1 address
  return { id: walletPick.id, name: walletPick.name, currency: assetSymbol, address, balance: 0 };
}
