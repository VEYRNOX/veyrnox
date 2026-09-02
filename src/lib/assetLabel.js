// lib/assetLabel.js — SafePal-parity display strings for an ASSETS entry.
//
// Home renders each row as "DISPLAY (Chain)" (see WalletPortfolioPage.jsx).
// Every other user-facing surface that shows an asset ticker — send picker,
// send confirmation, receive dropdown, receive header, asset detail page —
// must match, or the app reads inconsistent (a coin labelled `POL (Polygon)`
// on Home but `MATIC` on the send confirm dialog is confusing).
//
// This module centralises the label rule so a future rename touches ONE file.
// Pure, no imports beyond assets.js (no React, no hooks).

import { getAsset } from '@/wallet-core/assets.js';

/**
 * The user-visible symbol for an asset — `displaySymbol` when set, else the
 * internal `symbol`. Accepts an entry OR a bare symbol string (looked up).
 * Returns the input as-is if lookup fails (fail-honest — never a fabricated
 * label).
 * @param {object|string|null|undefined} assetOrSymbol
 * @returns {string}
 */
export function assetDisplaySymbol(assetOrSymbol) {
  const a = typeof assetOrSymbol === 'string' ? getAsset(assetOrSymbol) : assetOrSymbol;
  if (!a) return String(assetOrSymbol || '');
  return a.displaySymbol || a.symbol || '';
}

/**
 * The chain label rendered in parens next to the display symbol. ERC-20 rows
 * override to "Ethereum" since USDC/USDT live on Ethereum mainnet in Veyrnox
 * today; every other row's `asset.name` is already chain-shaped (Ethereum,
 * Polygon, Arbitrum, Optimism, Avalanche, BNB Chain, Bitcoin, Solana).
 * @param {object|string|null|undefined} assetOrSymbol
 * @returns {string} — chain label or '' if the asset can't be resolved
 */
export function assetChainLabel(assetOrSymbol) {
  const a = typeof assetOrSymbol === 'string' ? getAsset(assetOrSymbol) : assetOrSymbol;
  if (!a) return '';
  return a.family === 'erc20' ? 'Ethereum' : a.name || '';
}

/**
 * "DISPLAY (Chain)" — the canonical SafePal-parity label used on Home. Use
 * this for headers, dropdowns, confirmation dialogs, and any surface that
 * names the asset.
 * @param {object|string|null|undefined} assetOrSymbol
 * @returns {string}
 */
export function assetDisplayLabel(assetOrSymbol) {
  const sym = assetDisplaySymbol(assetOrSymbol);
  const chain = assetChainLabel(assetOrSymbol);
  return chain ? `${sym} (${chain})` : sym;
}
