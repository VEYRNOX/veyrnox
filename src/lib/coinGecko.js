// lib/coinGecko.js — free price egress via CoinGecko (no API key required).
//
// Replaces all CryptoCompare calls which now require a paid API key.
// CoinGecko's public endpoints allow anonymous access with rate limiting.
//
// I2 note: all symbol lists are fixed (MARKET_SYMBOLS / PORTFOLIO_SYMBOLS)
// and never derived from the user's holdings — same structural I2 guarantee
// as the original cryptoCompare.js.

import { fetchCoinGecko } from '@/api/edgeApi';
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

// Market basket — top coins we display prices for.
const MARKET_SUPPORTED = TOP_SYMBOLS.filter(s => TICKER_TO_CG[s]);
const MARKET_CG_IDS    = MARKET_SUPPORTED.map(s => TICKER_TO_CG[s]);

// Portfolio universe — all holdable assets (deduped tickers).
const PORTFOLIO_TICKERS  = [...new Set(ASSETS.map(a => a.symbol))].filter(s => TICKER_TO_CG[s]);
const PORTFOLIO_CG_IDS   = PORTFOLIO_TICKERS.map(s => TICKER_TO_CG[s]);

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
  const raw = await fetchCoinGecko('simple/price', {
    ids: PORTFOLIO_CG_IDS.join(','),
    vs_currencies: 'usd',
  });
  return buildPriceMap(raw, PORTFOLIO_TICKERS, 'USD');
}

/** USD prices for the market basket → { [sym]: number }. Replaces fetchMarketPricesUsd. */
export async function fetchMarketPricesUsdCG() {
  const raw = await fetchCoinGecko('simple/price', {
    ids: MARKET_CG_IDS.join(','),
    vs_currencies: 'usd',
  });
  return buildPriceMap(raw, MARKET_SUPPORTED, 'USD');
}

/**
 * Multi-fiat price matrix for the market basket.
 * Returns { [TICKER]: { [FIAT]: number } }. Replaces fetchMarketPricesFiat + fetchMarketPricesFiatCG.
 */
export async function fetchMarketPricesFiatCG(fiats) {
  const vsCurrencies = fiats.map(f => f.toLowerCase()).join(',');
  const raw = await fetchCoinGecko('simple/price', {
    ids: MARKET_CG_IDS.join(','),
    vs_currencies: vsCurrencies,
  });
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
  const raw = await fetchCoinGecko('simple/price', {
    ids: PORTFOLIO_CG_IDS.join(','),
    vs_currencies: vsCurrencies,
  });
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
  const raw = await fetchCoinGecko('coins/markets', {
    vs_currency: 'usd',
    ids: MARKET_CG_IDS.join(','),
    price_change_percentage: '24h',
    per_page: '50',
  });
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

/**
 * Portfolio-basket spot price + 24h % change in one call.
 * Returns { [sym]: { price: number|null, change24h: number|null } }.
 * I2: request is fixed to PORTFOLIO_CG_IDS, never derived from holdings.
 */
export async function fetchPortfolioMarkets24hCG() {
  const raw = await fetchCoinGecko('coins/markets', {
    vs_currency: 'usd',
    ids: PORTFOLIO_CG_IDS.join(','),
    price_change_percentage: '24h',
    per_page: '50',
  });
  const out = {};
  for (const ticker of PORTFOLIO_TICKERS) {
    out[ticker] = { price: null, change24h: null };
  }
  for (const coin of raw) {
    const ticker = PORTFOLIO_TICKERS.find(t => TICKER_TO_CG[t] === coin.id);
    if (ticker) {
      const price = coin.current_price;
      const pct = coin.price_change_percentage_24h;
      out[ticker] = {
        price: typeof price === 'number' && Number.isFinite(price) ? price : null,
        change24h: typeof pct === 'number' && Number.isFinite(pct) ? pct : null,
      };
    }
  }
  return out;
}

// ── OHLCV ─────────────────────────────────────────────────────────────────

// CoinGecko OHLC granularity is determined by the `days` param:
//   days=1      → 30-min candles (intraday)
//   days=7–30   → 4-hour candles (multi-day)
//   days=31–365 → 4-day candles (long-range)
//
// We cannot choose granularity independently, so each resolution band maps to
// the smallest `days` value that produces a DIFFERENT candle set. The old code
// mapped hour/limit=24 to days=1 — identical to minute — which made 1H, 4H,
// and 1D charts show the same data.
//
// `days` is an ENUM, not a free number: /coins/{id}/ohlc accepts only these
// values (plus 'max') and answers HTTP 400 to anything else — verified against
// the live API, where days=31 returns 400 while 30 and 90 return 200. The old
// day mapping computed Math.min(365, Math.max(31, limit)), i.e. days=31, so the
// CoinGecko fallback was hard-failing outright for 1D/1M charts.
const CG_VALID_DAYS = [1, 7, 14, 30, 90, 180, 365];

// The day band must snap UP past 30, never down to it. Per the granularity table
// above, 30 sits in the 4-HOUR band — the same candles the `hour` resolution
// already gets from days=7 — so snapping down would silently reintroduce the
// "1H, 4H and 1D all show the same data" bug this mapping exists to fix.
const CG_DAY_BAND = CG_VALID_DAYS.filter((d) => d > 30); // [90, 180, 365]

function toCgDays(resolution, limit) {
  if (resolution === 'minute') return 1;
  if (resolution === 'hour')   return 7;
  // Smallest 4-day-band value that still covers the requested span.
  const wanted = Number.isFinite(limit) ? limit : 0;
  return CG_DAY_BAND.find((d) => d >= wanted) ?? CG_DAY_BAND[CG_DAY_BAND.length - 1];
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
  const raw  = await fetchCoinGecko('coins/ohlc', {
    coin_id: cgId,
    vs_currency: 'usd',
    days: String(days),
  });
  // CoinGecko returns [[timestamp_ms, open, high, low, close], ...]
  const candles = raw.map(([ts, open, high, low, close]) => ({
    time:       Math.floor(ts / 1000),
    open, high, low, close,
    volumefrom: 0,
  }));
  // toCgDays intentionally over-fetches to get the right granularity band,
  // so trim to the most recent `limit` candles.
  return candles.length > limit ? candles.slice(-limit) : candles;
}
