// src/lib/cryptos.js
//
// Canonical "top 10 cryptocurrencies by market cap" used across ALL display
// features (price lists, charts, watchlists, swap selectors, portfolio mocks).
// One source of truth so every feature shows the same coins, colours, glyphs
// and reference prices.
//
// IMPORTANT — display vs. capability:
// This module is for DISPLAY/market data only. It does NOT grant any wallet
// the ability to derive a real address, receive, or send. Real on-chain
// capability is gated separately and deliberately in
// src/wallet-core/assets.js (live / receive_only / coming_soon). Several of
// the coins below (XRP, DOGE, ADA, TRX, BTC, SOL, USDT) have no signing stack
// yet and remain coming_soon there. Never use this list to enable a send.
//
// Reference USD prices are static mocks for demo/portfolio math; live features
// (e.g. PriceAlerts) still fetch real quotes from their price API.

export const TOP_CRYPTOS = Object.freeze([
  { symbol: "BTC",  name: "Bitcoin",  chain: "Bitcoin",     color: "#F7931A", glyph: "₿", usd: 68000,  change24h:  2.3,  mcap: "1.34T" },
  { symbol: "ETH",  name: "Ethereum", chain: "Ethereum",    color: "#627EEA", glyph: "Ξ", usd: 3200,   change24h: -1.1,  mcap: "386B"  },
  { symbol: "USDT", name: "Tether",   chain: "Ethereum",    color: "#26A17B", glyph: "₮", usd: 1,      change24h:  0.0,  mcap: "112B"  },
  { symbol: "BNB",  name: "BNB",      chain: "BNB Chain",   color: "#F3BA2F", glyph: "◈", usd: 590,    change24h:  0.8,  mcap: "86B"   },
  { symbol: "SOL",  name: "Solana",   chain: "Solana",      color: "#9945FF", glyph: "◎", usd: 165,    change24h:  4.7,  mcap: "78B"   },
  { symbol: "USDC", name: "USD Coin", chain: "Ethereum",    color: "#2775CA", glyph: "$", usd: 1,      change24h:  0.0,  mcap: "34B"   },
  { symbol: "XRP",  name: "XRP",      chain: "XRP Ledger",  color: "#0085C0", glyph: "✕", usd: 0.52,   change24h: -0.6,  mcap: "29B"   },
  { symbol: "DOGE", name: "Dogecoin", chain: "Dogecoin",    color: "#C2A633", glyph: "Ð", usd: 0.16,   change24h:  3.1,  mcap: "23B"   },
  { symbol: "ADA",  name: "Cardano",  chain: "Cardano",     color: "#0033AD", glyph: "₳", usd: 0.45,   change24h: -1.8,  mcap: "16B"   },
  { symbol: "TRX",  name: "TRON",     chain: "Tron",        color: "#EB0029", glyph: "T", usd: 0.13,   change24h:  0.4,  mcap: "11B"   },
]);

/** Ordered list of the 10 ticker symbols. */
export const TOP_SYMBOLS = Object.freeze(TOP_CRYPTOS.map(c => c.symbol));

const byKey = (key) =>
  Object.freeze(Object.fromEntries(TOP_CRYPTOS.map(c => [c.symbol, c[key]])));

/** { BTC: 68000, ... } reference USD prices (mock). */
export const USD_RATES = byKey("usd");
/** { BTC: "#F7931A", ... } brand colours. */
export const CURRENCY_COLORS = byKey("color");
/** { BTC: "₿", ... } single-char glyphs. */
export const CURRENCY_SYMBOLS = byKey("glyph");
/** { BTC: "Bitcoin", ... } full names. */
export const CURRENCY_NAMES = byKey("name");
/** { BTC: "Bitcoin", ... } settlement chain label. */
export const CURRENCY_CHAINS = byKey("chain");

/** { BTC: "/coins/btc.png", ... } bundled logo image paths (offline-safe). */
export const CURRENCY_LOGOS = Object.freeze(
  Object.fromEntries(TOP_CRYPTOS.map(c => [c.symbol, `/coins/${c.symbol.toLowerCase()}.png`]))
);

/** Bundled logo path for any symbol (may 404 for non-top-10 — callers fall back to a glyph). */
export function logoFor(symbol) {
  return symbol ? `/coins/${String(symbol).toLowerCase()}.png` : null;
}

export function getCrypto(symbol) {
  return TOP_CRYPTOS.find(c => c.symbol === symbol) || null;
}
