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
import { DEFAULT_ENABLED_ASSETS, ALL_ASSET_SYMBOLS } from '@/lib/walletMeta';

// ── DEMO SEND SOURCE ────────────────────────────────────────────────────────
// Demo is a backend-less walkthrough with NO unlocked on-device vault, so the
// live useWallet() wallet set + derived accounts are EMPTY. After #127 bound the
// Send screen to useWallet() (to fix the live build, where the old base44 demo
// source was empty), the demo build regressed the OTHER way: both the From-Wallet
// and Asset pickers had nothing to list, so the Asset bottom-sheet opened with
// zero options and an asset could never be picked.
//
// demoSendSource() supplies a single synthetic multi-asset wallet plus
// deterministic PUBLIC testnet addresses so the demo Send form populates and is
// exercisable end-to-end (pick asset → Continue → pre-sign risk banner). It holds
// NO keys and is dead weight in a live session — the caller only uses it when
// DEMO is on AND the live vault is empty, so the real send path is untouched
// (deniability I3 preserved: a real session never reads this).
export const DEMO_SEND_WALLET_ID = 'demo-send-wallet';

// Deterministic, format-plausible demo addresses (public only; never signed with).
// The EVM one echoes the seeded demo portfolio's 0x3a18… card address.
const DEMO_EVM_ADDRESS = '0x3a183a183a183a183a183a183a183a183a183a18';
const DEMO_BTC_ADDRESS = 'tb1qdemodemodemodemodemodemodemodemo0xphr7';
const DEMO_SOL_ADDRESS = 'So1Veyrnoxdemo1111111111111111111111111111';

// Per-asset demo balances. The headline five mirror the seeded demo portfolio so
// the displayed number matches the dashboard cards (demoClient). The EVM L2s have
// no dashboard card but are now default-enabled, so they carry their own demo
// seed here — otherwise the demo Asset picker would show them at a bare 0. Keys
// MUST cover every symbol in DEFAULT_ENABLED_ASSETS. Display/limit-check only;
// fake data, never sent.
const DEMO_SEND_BALANCES = {
  ETH: 2.4831, BTC: 0.0521, SOL: 18.42, USDC: 1250, USDT: 540,
  MATIC: 420.5, ARB: 1.85, OP: 2.4, AVAX: 9.6, BNB: 0.75,
};

/**
 * The demo Send source: one multi-asset wallet + derived public addresses + the
 * per-asset display balances. Shaped like the live useWallet() subset the Send
 * screen consumes ({ wallets, accounts, btcAccount, solAccount }), plus a
 * `balances` map for the demo balance display / max check.
 */
export function demoSendSource() {
  return {
    wallets: [{ id: DEMO_SEND_WALLET_ID, name: 'Wallet 1', backedUp: true, enabledAssets: [...DEFAULT_ENABLED_ASSETS] }],
    accounts: [{ address: DEMO_EVM_ADDRESS, path: "m/44'/60'/0'/0/0", index: 0 }],
    btcAccount: { address: DEMO_BTC_ADDRESS, path: "m/84'/1'/0'/0/0", networkKey: 'testnet' },
    solAccount: { address: DEMO_SOL_ADDRESS, path: "m/44'/501'/0'/0'" },
    balances: { ...DEMO_SEND_BALANCES },
  };
}

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
 * Asset symbols to OFFER in the Send asset picker. Normally a wallet's own
 * enabledAssets (the same list the dashboard shows). When the dev-real testnet
 * send ungate is active, surface EVERY supported asset so any `receive_only`
 * asset can be exercised through the real send path for verification WITHOUT first
 * enabling it per-wallet (older wallets predate the all-assets default). This is a
 * VIEW-ONLY override — it never mutates the wallet's stored enabledAssets — and,
 * gated on the build-time DEV lock at the call site, is dead-code-eliminated from
 * any production build.
 * @param {Array}   wallets
 * @param {string}  walletId
 * @param {boolean} [ungated]  the dev-only testnet send ungate is active
 * @returns {string[]}
 */
export function sendAssetSymbols(wallets, walletId, ungated = false) {
  return ungated ? [...ALL_ASSET_SYMBOLS] : walletAssetSymbols(wallets, walletId);
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
