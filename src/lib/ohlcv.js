// lib/ohlcv.js — dual-source OHLCV with automatic fallback.
//
// Primary: Binance public klines (true 1m/1h/1d intervals, real volume,
// ~1200 request-weight/min anonymous limit). Fallback: CoinGecko OHLC (true
// USD quotes, but a ~5 req/min anonymous limit that 429s when the user cycles
// chart timeframes — the original "chart breaks" bug). Order is deliberate:
// keeping CoinGecko primary would still pay a guaranteed 429 on most timeframe
// switches; Binance-first makes the failure path the exception.
//
// I3: this is a directly-callable export, so it fails closed itself in a
// deniability session (mirrors priceFeed.fetchLivePricesUsd) — zero egress to
// EITHER host — rather than relying solely on callers' `enabled` gates.

import { isDeniabilitySessionActive } from '@/wallet-core/deniabilitySession.js';
import { fetchOHLCVBinance, hasBinanceMapping } from '@/lib/binance.js';
import { fetchOHLCVCG } from '@/lib/coinGecko.js';

/**
 * OHLCV candles for a single symbol, Binance-first with CoinGecko fallback.
 * Returns [{ time, open, high, low, close, volumefrom }].
 *
 * @param {string} fsym       Veyrnox ticker (BTC, ETH, …)
 * @param {'minute'|'hour'|'day'} resolution
 * @param {number} limit
 */
export async function fetchOHLCV(fsym, resolution = 'hour', limit = 24) {
  if (isDeniabilitySessionActive()) throw new Error('I3: no egress in deniability session');

  if (hasBinanceMapping(fsym)) {
    try {
      return await fetchOHLCVBinance(fsym, resolution, limit);
    } catch {
      // Fall through to CoinGecko (rate limit, geo-block, stale pair, outage).
    }
  }

  const candles = await fetchOHLCVCG(fsym, resolution, limit);
  if (!Array.isArray(candles) || candles.length === 0) {
    throw new Error('coingecko: empty response');
  }
  return candles;
}
