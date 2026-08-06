// lib/okx.js — OHLCV source via OKX public market candles (no API key).
//
// Public endpoint: /api/v5/market/candles (spot)
// Rate limit: 40 req/2s per IP — far more generous than CoinGecko's ~5/min.
// True USDT quotes (same ≲0.2% peg caveat as Binance).
//
// Egress goes through the EDGE PROXY (functions/api/data/okx-candles.js) via
// edgeApi.fetchOkxCandles — never a direct browser fetch to www.okx.com. Two
// reasons, both load-bearing:
//   1. I3 — edgeApi.js is the deniability chokepoint and guards
//      `DEMO || isDeniabilityOrDemoActive()`. lib/ohlcv.js's own guard checks
//      only isDeniabilitySessionActive(), so a DEMO session would egress if this
//      module called fetch() itself.
//   2. Native — functions/api/data/klines.js exists because a direct call breaks
//      CORS in the iOS/Android Capacitor WebViews. Same applies here.
// I2: the symbol map is fixed and never derived from the user's holdings, and
// the edge function re-validates instId against its own allowlist.

import { fetchOkxCandles } from '@/api/edgeApi';

const TICKER_TO_OKX = {
  BTC:   'BTC-USDT',
  ETH:   'ETH-USDT',
  BNB:   'BNB-USDT',
  SOL:   'SOL-USDT',
  USDC:  'USDC-USDT',
  MATIC: 'POL-USDT',
  ARB:   'ARB-USDT',
  OP:    'OP-USDT',
  AVAX:  'AVAX-USDT',
};

const RESOLUTION_TO_BAR = { minute: '1m', hour: '1H', day: '1D' };
const RESOLUTION_SECONDS = { minute: 60, hour: 3600, day: 86400 };

export function hasOkxMapping(fsym) {
  return Boolean(TICKER_TO_OKX[fsym]);
}

/**
 * OHLCV candles from OKX spot market.
 * Returns [{ time, open, high, low, close, volumefrom }] — same shape as
 * the Binance/CoinGecko fetchers.
 *
 * OKX returns candles newest-first; we reverse to match the oldest-first
 * convention used by the chart components.
 *
 * @param {string} fsym       Veyrnox ticker (BTC, ETH, …)
 * @param {'minute'|'hour'|'day'} resolution
 * @param {number} limit      number of candles (clamped to OKX max 300)
 * @param {number} [nowMs]    injectable clock for staleness check (tests)
 */
export async function fetchOHLCVOkx(fsym, resolution = 'hour', limit = 24, nowMs = Date.now()) {
  const instId = TICKER_TO_OKX[fsym];
  if (!instId) throw new Error(`okx: no mapping for ${fsym}`);
  const bar = RESOLUTION_TO_BAR[resolution];
  if (!bar) throw new Error(`okx: unsupported resolution ${resolution}`);

  const capped = Math.max(1, Math.min(300, Math.floor(limit)));

  // Throws on non-2xx (edgeApi.get) — no fetch() here by design, see header.
  const json = await fetchOkxCandles(instId, bar, capped);
  if (json.code !== '0') throw new Error(`okx: API error ${json.code} — ${json.msg}`);

  const data = json.data;
  if (!Array.isArray(data) || data.length === 0) throw new Error('okx: empty response');

  // OKX row: [ts(ms), open, high, low, close, vol, volCcy, volCcyQuote, confirm]
  const candles = data.map((k) => ({
    time:       Math.floor(Number(k[0]) / 1000),
    open:       Number(k[1]),
    high:       Number(k[2]),
    low:        Number(k[3]),
    close:      Number(k[4]),
    volumefrom: Number(k[5]),
  }));

  // OKX returns newest-first; chart components expect oldest-first.
  candles.reverse();

  const newest = candles[candles.length - 1];
  const maxAgeSec = 3 * RESOLUTION_SECONDS[resolution] + 300;
  if (nowMs / 1000 - newest.time > maxAgeSec) {
    throw new Error(`okx: stale data for ${instId}`);
  }

  return candles;
}
