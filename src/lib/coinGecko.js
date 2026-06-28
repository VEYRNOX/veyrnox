// lib/coinGecko.js — price egress for the Converter (Calculator page).
//
// Uses CoinGecko's public /simple/price endpoint which allows CORS from browser
// origins without an API key. CryptoCompare's anonymous path is CORS-blocked in
// browsers/Capacitor, which is why the Converter fell back to this source.
//
// I2 note: the symbol list is fixed (MARKET_SYMBOLS → CG_IDS below) and never
// derived from the user's holdings — same structural I2 guarantee as cryptoCompare.js.

import { TOP_SYMBOLS } from '@/lib/cryptos.js';

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
};

const CG_BASE = 'https://api.coingecko.com/api/v3';

// Only map symbols we have a CG id for.
const SUPPORTED = TOP_SYMBOLS.filter(s => TICKER_TO_CG[s]);
const CG_IDS    = SUPPORTED.map(s => TICKER_TO_CG[s]);

/**
 * Multi-fiat price matrix for the market basket.
 * Returns the same shape as CryptoCompare's pricemulti:
 *   { [TICKER]: { [FIAT]: number } }
 *
 * @param {string[]} fiats  e.g. ["USD","EUR","GBP"]
 */
export async function fetchMarketPricesFiatCG(fiats) {
  const vsCurrencies = fiats.map(f => f.toLowerCase()).join(',');
  const url = `${CG_BASE}/simple/price?ids=${CG_IDS.join(',')}&vs_currencies=${vsCurrencies}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`coingecko HTTP ${res.status}`);
  const raw = await res.json();

  // Re-key from CoinGecko ids back to Veyrnox tickers,
  // and upper-case the currency keys to match the UI expectation.
  const out = {};
  for (const ticker of SUPPORTED) {
    const cgId   = TICKER_TO_CG[ticker];
    const cgData = raw[cgId];
    if (!cgData) continue;
    out[ticker] = {};
    for (const fiat of fiats) {
      const val = cgData[fiat.toLowerCase()];
      if (typeof val === 'number' && Number.isFinite(val)) {
        out[ticker][fiat] = val;
      }
    }
  }
  return out;
}
