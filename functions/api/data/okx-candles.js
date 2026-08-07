// functions/api/data/okx-candles.js
//
// OKX spot candle (OHLCV) proxy. No API key required — OKX public market data
// is free. Mirrors functions/api/data/klines.js: proxying through the edge
// avoids CORS issues on native WebViews and gives us edge caching. The client
// must NOT call www.okx.com directly — a direct call would also bypass the I3
// deniability chokepoint in src/api/edgeApi.js.
//
// Why OKX alongside Binance: Binance blocks Cloudflare Workers' default
// User-Agent on several hosts (see klines.js, which scrambles across six
// endpoints because of it). OKX serves CF Workers directly, and its public
// limit is 40 req/2s per IP against CoinGecko's ~5/min.

// Multiple official OKX hosts, tried in order. Single-host was a real gap: the
// whole reason klines.js scrambles across six Binance endpoints is that
// exchanges block Cloudflare egress IPs, and www.okx.com is subject to exactly
// the same risk. These are the documented public alternates for the same v5 API.
const OKX_ENDPOINTS = [
  'https://www.okx.com/api/v5/market/candles',
  'https://aws.okx.com/api/v5/market/candles',
  'https://app.okx.com/api/v5/market/candles',
];

// Fixed allowlist — never derived from the caller's holdings (I2).
const ALLOWED_INST_IDS = new Set([
  'BTC-USDT', 'ETH-USDT', 'BNB-USDT', 'SOL-USDT', 'USDC-USDT',
  'POL-USDT', 'ARB-USDT', 'OP-USDT', 'AVAX-USDT',
]);

const ALLOWED_BARS = new Set([
  '1m', '3m', '5m', '15m', '30m', '1H', '2H', '4H', '6H', '12H', '1D', '1W', '1M',
]);

function err(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  throw e;
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);

  const instId = (url.searchParams.get('instId') || '').toUpperCase();
  const bar = url.searchParams.get('bar') || '1H';
  // OKX caps `limit` at 300 for this endpoint.
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1), 300);

  if (!ALLOWED_INST_IDS.has(instId)) err(400, 'Invalid instId');
  if (!ALLOWED_BARS.has(bar)) err(400, 'Invalid bar');

  // Edge cache keyed on canonical params.
  const cacheKey = new Request(`https://okx-candles.internal/${instId}/${bar}/${limit}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const qs = `?instId=${instId}&bar=${bar}&limit=${limit}`;
  const ttl = bar === '1m' ? 15 : bar === '1H' ? 30 : 60;

  let lastStatus = 0;
  for (const base of OKX_ENDPOINTS) {
    let res;
    try {
      res = await fetch(`${base}${qs}`);
    } catch {
      continue; // network error on this host — try the next
    }
    if (!res.ok) { lastStatus = res.status; continue; }

    const body = await res.text();
    // A 200 carrying a non-zero OKX code is an application-level failure (bad
    // instId, rate limit). Treat it as this host failing rather than caching it
    // — caching an error for 60s would turn a blip into a visible outage.
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      lastStatus = 502;
      continue;
    }
    if (parsed?.code !== '0') { lastStatus = 502; continue; }

    const response = new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttl}`,
      },
    });
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  }

  err(502, `All OKX endpoints returned ${lastStatus || 'network error'}`);
}
