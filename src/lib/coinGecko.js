// lib/coinGecko.js — free price egress via CoinGecko (no API key required).
//
// Replaces all CryptoCompare calls which now require a paid API key.
// CoinGecko's public endpoints allow anonymous access with rate limiting.
//
// I2 note: all symbol lists are fixed (MARKET_SYMBOLS / PORTFOLIO_SYMBOLS)
// and never derived from the user's holdings — same structural I2 guarantee
// as the original cryptoCompare.js.

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { TOP_SYMBOLS } from '@/lib/cryptos.js';
import { ASSETS } from '@/wallet-core/assets.js';

// Map Veyrnox ticker → CoinGecko coin id.
const TICKER_TO_CG = {
  BTC:  'bitcoin',
  ETH:  'ethereum',
  USDT: 'tether',
  BNB:  'binancecoin',
  SOL:  'solana',
  USDC: 'usd-coin',
  XRP:  'ripple',
  DOGE: 'dogecoin',
  ADA:  'cardano',
  TRX:  'tron',
  MATIC:'matic-network',
  ARB:  'arbitrum',
  OP:   'optimism',
  AVAX: 'avalanche-2',
};

const CG_BASE = 'https://api.coingecko.com/api/v3';

// Market basket — top coins we display prices for.
const MARKET_SUPPORTED = TOP_SYMBOLS.filter(s => TICKER_TO_CG[s]);
const MARKET_CG_IDS    = MARKET_SUPPORTED.map(s => TICKER_TO_CG[s]);

// Portfolio universe — all holdable assets (deduped tickers).
const PORTFOLIO_TICKERS  = [...new Set(ASSETS.map(a => a.symbol))].filter(s => TICKER_TO_CG[s]);
const PORTFOLIO_CG_IDS   = PORTFOLIO_TICKERS.map(s => TICKER_TO_CG[s]);

async function cgGet(url) {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({ url });
    if (res.status < 200 || res.status >= 300) throw new Error(`coingecko HTTP ${res.status}`);
    return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`coingecko HTTP ${res.status}`);
  return res.json();
}

// ── Current price helpers ──────────────────────────────────────────────────

function buildPriceMap(raw, tickers, fiat) {
  const out = {};
  for (const ticker of tickers) {
    const cgId = TICKER_TO_CG[ticker];
    const val  = raw[cgId]?.[fiat.toLowerCase()];
    if (typeof val === 'number' && Number.isFinite(val)) out[ticker] = val;
  }
  return out;
}

/** USD prices for all holdable assets → { [sym]: number }. Replaces fetchPortfolioPricesUsd. */
export async function fetchPortfolioPricesUsdCG() {
  const url = `${CG_BASE}/simple/price?ids=${PORTFOLIO_CG_IDS.join(',')}&vs_currencies=usd`;
  const raw = await cgGet(url);
  return buildPriceMap(raw, PORTFOLIO_TICKERS, 'USD');
}

/** USD prices for the market basket → { [sym]: number }. Replaces fetchMarketPricesUsd. */
export async function fetchMarketPricesUsdCG() {
  const url = `${CG_BASE}/simple/price?ids=${MARKET_CG_IDS.join(',')}&vs_currencies=usd`;
  const raw = await cgGet(url);
  return buildPriceMap(raw, MARKET_SUPPORTED, 'USD');
}

/**
 * Multi-fiat price matrix for the market basket.
 * Returns { [TICKER]: { [FIAT]: number } }. Replaces fetchMarketPricesFiat + fetchMarketPricesFiatCG.
 */
export async function fetchMarketPricesFiatCG(fiats) {
  const vsCurrencies = fiats.map(f => f.toLowerCase()).join(',');
  const url = `${CG_BASE}/simple/price?ids=${MARKET_CG_IDS.join(',')}&vs_currencies=${vsCurrencies}`;
  const raw = await cgGet(url);
  const out = {};
  for (const ticker of MARKET_SUPPORTED) {
    const cgId   = TICKER_TO_CG[ticker];
    const cgData = raw[cgId];
    if (!cgData) continue;
    out[ticker] = {};
    for (const fiat of fiats) {
      const val = cgData[fiat.toLowerCase()];
      if (typeof val === 'number' && Number.isFinite(val)) out[ticker][fiat] = val;
    }
  }
  return out;
}

/**
 * Multi-fiat price matrix for the portfolio (holdable) assets only.
 * Returns { [TICKER]: { [FIAT]: number } }.
 */
export async function fetchPortfolioPricesFiatCG(fiats) {
  const vsCurrencies = fiats.map(f => f.toLowerCase()).join(',');
  const url = `${CG_BASE}/simple/price?ids=${PORTFOLIO_CG_IDS.join(',')}&vs_currencies=${vsCurrencies}`;
  const raw = await cgGet(url);
  const out = {};
  for (const ticker of PORTFOLIO_TICKERS) {
    const cgId   = TICKER_TO_CG[ticker];
    const cgData = raw[cgId];
    if (!cgData) continue;
    out[ticker] = {};
    for (const fiat of fiats) {
      const val = cgData[fiat.toLowerCase()];
      if (typeof val === 'number' && Number.isFinite(val)) out[ticker][fiat] = val;
    }
  }
  return out;
}

/**
 * 24h % change for the market basket → { [sym]: { change24h: number|null } }.
 * Replaces fetchMarketChanges24h.
 */
export async function fetchMarketChanges24hCG() {
  const url = `${CG_BASE}/coins/markets?vs_currency=usd&ids=${MARKET_CG_IDS.join(',')}&price_change_percentage=24h&per_page=50`;
  const raw = await cgGet(url);
  const out = {};
  for (const ticker of MARKET_SUPPORTED) {
    out[ticker] = { change24h: null };
  }
  for (const coin of raw) {
    const ticker = MARKET_SUPPORTED.find(t => TICKER_TO_CG[t] === coin.id);
    if (ticker) {
      const pct = coin.price_change_percentage_24h;
      out[ticker] = { change24h: typeof pct === 'number' && Number.isFinite(pct) ? pct : null };
    }
  }
  return out;
}

// ── OHLCV ─────────────────────────────────────────────────────────────────

// Map CryptoCompare (resolution, limit) → CoinGecko days param.
function toCgDays(resolution, limit) {
  if (resolution === 'minute') return 1;
  if (resolution === 'hour')   return Math.max(1, Math.ceil(limit / 24));
  // day
  return Math.min(365, Math.max(1, limit));
}

/**
 * OHLCV candles for a single symbol.
 * Returns [{ time, open, high, low, close, volumefrom }] — same shape as CryptoCompare.
 * Replaces fetchOHLCV(fsym, resolution, limit).
 *
 * @param {string} fsym       Veyrnox ticker (BTC, ETH, …)
 * @param {'minute'|'hour'|'day'} resolution
 * @param {number} limit
 */
export async function fetchOHLCVCG(fsym, resolution = 'hour', limit = 24) {
  const cgId = TICKER_TO_CG[fsym];
  if (!cgId) throw new Error(`coingecko: no mapping for ${fsym}`);
  const days = toCgDays(resolution, limit);
  const url  = `${CG_BASE}/coins/${cgId}/ohlc?vs_currency=usd&days=${days}`;
  const raw  = await cgGet(url);
  // CoinGecko returns [[timestamp_ms, open, high, low, close], ...]
  return raw.map(([ts, open, high, low, close]) => ({
    time:       Math.floor(ts / 1000),
    open, high, low, close,
    volumefrom: 0,
  }));
}
