// lib/cryptoCompare.js — the SINGLE point of third-party price egress.
//
// All CryptoCompare price traffic goes through here. The deniability invariant
// (I2: a price request must NEVER reveal what the user holds) is enforced
// STRUCTURALLY: no fetcher accepts a caller-supplied symbol list — each sources
// its `fsyms` from a fixed module constant below, so symbol queries are
// holdings-agnostic regardless of wallets/decoy state.
// `tsyms` (fiats) may be passed: fiat choice reveals nothing about holdings.
//
// Two fixed universes (both holdings-agnostic; see design 2026-06-17):
//   PORTFOLIO_SYMBOLS — the wallet's holdable assets, for portfolio USD valuation.
//   MARKET_SYMBOLS    — the top-coin market basket (= cryptos.js TOP_SYMBOLS), for
//                       the calculator / price-alert / 24h-change tools.
//
// I4 (fail closed): every fetcher throws on a non-OK response; callers fall back
// honestly (approximate / hide-the-delta) and never show stale-as-live.
//
// EGRESS CORRELATION NOTE (I2 trade-off):
// When VITE_CRYPTOCOMPARE_API_KEY is set, requests to the v2 OHLCV endpoint
// include `api_key=<key>`. That key is a build-time constant shared across all
// installs of a given build, so CryptoCompare (or a log observer) can identify
// this build as Veyrnox — a per-deployment correlator, not a per-user one.
// The symbol query itself still reveals no per-user holdings (structural I2 above).
// VULN-14 removed the old per-request `extraParams=safecryptowallet` app tag for
// the same reason; wiring an api_key re-introduces a similar signal on the OHLCV
// path only. Operators who need the v2 OHLCV endpoint (chart data on Android) and
// accept this trade-off should set the key in .env.local. The default (no key) is
// fully anonymous — OHLCV calls without a key may be CORS-blocked on some clients.

import { Capacitor } from '@capacitor/core';
import { CapacitorHttp } from '@capacitor/core';
import { ASSETS } from '@/wallet-core/assets.js';
import { TOP_SYMBOLS } from '@/lib/cryptos.js';

const BASE = 'https://min-api.cryptocompare.com/data';
const _CC_KEY = import.meta.env.VITE_CRYPTOCOMPARE_API_KEY;
// api_key is appended to ALL CryptoCompare requests when set.
// See egress correlation note above — per-build correlator, not per-user (I2 trade-off).
const EXTRA = _CC_KEY ? `api_key=${encodeURIComponent(_CC_KEY)}` : '';

// Holdable assets (deduped) — the FULL registry, never narrowed to held assets.
export const PORTFOLIO_SYMBOLS = Object.freeze([...new Set(ASSETS.map((a) => a.symbol))]);
// Top-coin market basket — the canonical list already defined in cryptos.js.
export const MARKET_SYMBOLS = TOP_SYMBOLS;

function withKey(url) {
  if (!EXTRA) return url;
  return url.includes('?') ? `${url}&${EXTRA}` : `${url}?${EXTRA}`;
}

async function getJson(url) {
  const fullUrl = withKey(url);
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({ url: fullUrl });
    if (res.status < 200 || res.status >= 300) throw new Error(`cryptocompare HTTP ${res.status}`);
    return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  }
  const res = await fetch(fullUrl);
  if (!res.ok) throw new Error(`cryptocompare HTTP ${res.status}`);
  return res.json();
}

// pricemulti raw → flat USD map for the given fixed `symbols`.
function toUsdMap(raw, symbols) {
  const out = {};
  for (const s of symbols) {
    const v = raw?.[s]?.USD;
    if (typeof v === 'number' && Number.isFinite(v)) out[s] = v;
  }
  return out;
}

/** USD prices for the PORTFOLIO universe → { [sym]: number }. */
export async function fetchPortfolioPricesUsd() {
  const raw = await getJson(`${BASE}/pricemulti?fsyms=${PORTFOLIO_SYMBOLS.join(',')}&tsyms=USD`);
  return toUsdMap(raw, PORTFOLIO_SYMBOLS);
}

/** USD prices for the MARKET universe → { [sym]: number }. */
export async function fetchMarketPricesUsd() {
  const raw = await getJson(`${BASE}/pricemulti?fsyms=${MARKET_SYMBOLS.join(',')}&tsyms=USD`);
  return toUsdMap(raw, MARKET_SYMBOLS);
}

/** Multi-fiat matrix for the MARKET universe → raw pricemulti shape { [sym]: { [fiat]: number } }. */
export async function fetchMarketPricesFiat(fiats) {
  const tsyms = (Array.isArray(fiats) ? fiats : [fiats]).join(',');
  return getJson(`${BASE}/pricemulti?fsyms=${MARKET_SYMBOLS.join(',')}&tsyms=${tsyms}`);
}

/** 24h % change for the MARKET universe (pricemultifull) → { [sym]: { change24h: number|null } }. */
export async function fetchMarketChanges24h() {
  const raw = await getJson(`${BASE}/pricemultifull?fsyms=${MARKET_SYMBOLS.join(',')}&tsyms=USD`);
  const RAW = raw?.RAW;
  if (!RAW) throw new Error('cryptocompare: no RAW payload');
  const out = {};
  for (const s of MARKET_SYMBOLS) {
    const cell = RAW[s]?.USD;
    out[s] = cell && Number.isFinite(cell.CHANGEPCT24HOUR) ? { change24h: cell.CHANGEPCT24HOUR } : { change24h: null };
  }
  return out;
}

/**
 * OHLCV candles for a single user-selected symbol from the TOP_CRYPTOS list.
 * This is user-initiated market data (not a background holdings oracle) — the
 * symbol is chosen from a fixed display list, not derived from the user's wallet.
 * Gated behind isLivePricesEnabled() at the call site.
 *
 * @param {string} fsym - symbol from TOP_CRYPTOS (BTC, ETH, etc.)
 * @param {'minute'|'hour'|'day'} resolution
 * @param {number} limit - number of candles (max 2000)
 * @returns {Promise<Array<{time:number,open:number,high:number,low:number,close:number,volumefrom:number}>>}
 */
export async function fetchOHLCV(fsym, resolution = 'hour', limit = 24) {
  const endpoint = resolution === 'day' ? 'histoday' : resolution === 'minute' ? 'histominute' : 'histohour';
  const raw = await getJson(`${BASE}/v2/${endpoint}?fsym=${fsym}&tsym=USD&limit=${limit}`);
  if (raw.Response !== 'Success') throw new Error(`cryptocompare OHLCV: ${raw.Message || raw.Response}`);
  return raw.Data.Data;
}
