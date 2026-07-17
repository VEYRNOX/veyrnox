// lib/binance.js — secondary OHLCV source via Binance public klines (no API key).
//
// Why this exists: CoinGecko's anonymous rate limit (~5 req/min per IP) is the
// root cause of the "switching chart timeframes breaks the chart" bug — cycling
// 1H→4H→1D→1W→1M fires up to five fresh OHLC calls in seconds and the later ones
// get HTTP 429. Binance's public klines endpoint allows ~1200 request-weight/min
// anonymously, supports true 1m/1h/1d intervals (CoinGecko's free OHLC endpoint
// cannot do sub-day windows, so 1H and 4H both returned the same full-day data),
// and returns real volume (CoinGecko OHLC has none).
//
// Honest scope: pairs are quoted in USDT, not USD — a ≲0.2% peg deviation from
// true USD is possible. Charts label prices in $; this is the standard
// exchange-chart convention and the CoinGecko fallback remains true-USD.
//
// I2 note: the symbol map is fixed and never derived from the user's holdings —
// same structural I2 guarantee as coinGecko.js. Callers gate egress behind
// isLivePricesEnabled() and the I3 deniability guard in lib/ohlcv.js.

import { Capacitor, CapacitorHttp } from '@capacitor/core';

// Map Veyrnox ticker → Binance spot pair.
// - MATIC → POLUSDT: MATICUSDT was delisted (frozen candles since 2024); the
//   in-app MATIC asset is the Polygon gas token, which IS POL post-migration
//   (see cryptos.js USD_RATES note), so POLUSDT is the honest live price.
// - USDT is intentionally unmapped: Binance has no reliable USDT/USD spot pair,
//   so USDT charts come from the CoinGecko fallback only.
const TICKER_TO_BINANCE = {
  BTC:  'BTCUSDT',
  ETH:  'ETHUSDT',
  BNB:  'BNBUSDT',
  SOL:  'SOLUSDT',
  USDC: 'USDCUSDT',
  XRP:  'XRPUSDT',
  DOGE: 'DOGEUSDT',
  ADA:  'ADAUSDT',
  TRX:  'TRXUSDT',
  MATIC:'POLUSDT',
  ARB:  'ARBUSDT',
  OP:   'OPUSDT',
  AVAX: 'AVAXUSDT',
};

const RESOLUTION_TO_INTERVAL = { minute: '1m', hour: '1h', day: '1d' };
const RESOLUTION_SECONDS     = { minute: 60,   hour: 3600, day: 86400 };

const BINANCE_BASE = 'https://api.binance.com/api/v3';

/** @returns {boolean} whether a Binance pair exists for this ticker. */
export function hasBinanceMapping(fsym) {
  return Boolean(TICKER_TO_BINANCE[fsym]);
}

async function bGet(url) {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({ url });
    if (res.status < 200 || res.status >= 300) throw new Error(`binance HTTP ${res.status}`);
    return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`binance HTTP ${res.status}`);
  return res.json();
}

/**
 * OHLCV candles for a single symbol from Binance spot klines.
 * Returns [{ time, open, high, low, close, volumefrom }] — same shape as the
 * CryptoCompare/CoinGecko fetchers, so callers are source-agnostic.
 *
 * Throws (never returns partial/frozen data — I4, callers fall back):
 * - unmapped ticker or unsupported resolution
 * - HTTP error / non-array / empty response
 * - stale data: a delisted pair keeps answering HTTP 200 with candles frozen at
 *   delisting time (observed live on MATICUSDT), which must not render as live.
 *
 * @param {string} fsym       Veyrnox ticker (BTC, ETH, …)
 * @param {'minute'|'hour'|'day'} resolution
 * @param {number} limit      number of candles (clamped to Binance's max 1000)
 * @param {number} [nowMs]    injectable clock for the staleness check (tests)
 */
export async function fetchOHLCVBinance(fsym, resolution = 'hour', limit = 24, nowMs = Date.now()) {
  const pair = TICKER_TO_BINANCE[fsym];
  if (!pair) throw new Error(`binance: no mapping for ${fsym}`);
  const interval = RESOLUTION_TO_INTERVAL[resolution];
  if (!interval) throw new Error(`binance: unsupported resolution ${resolution}`);

  const capped = Math.max(1, Math.min(1000, Math.floor(limit)));
  const url = `${BINANCE_BASE}/klines?symbol=${pair}&interval=${interval}&limit=${capped}`;
  const raw = await bGet(url);

  if (!Array.isArray(raw)) throw new Error('binance: unexpected response shape');
  if (raw.length === 0) throw new Error('binance: empty response');

  // Kline row: [openTime(ms), open, high, low, close, volume, closeTime, ...] — prices as strings.
  const candles = raw.map((k) => ({
    time:       Math.floor(k[0] / 1000),
    open:       Number(k[1]),
    high:       Number(k[2]),
    low:        Number(k[3]),
    close:      Number(k[4]),
    volumefrom: Number(k[5]),
  }));

  const newest = candles[candles.length - 1];
  const maxAgeSec = 3 * RESOLUTION_SECONDS[resolution] + 300;
  if (nowMs / 1000 - newest.time > maxAgeSec) {
    throw new Error(`binance: stale data for ${pair}`);
  }

  return candles;
}
