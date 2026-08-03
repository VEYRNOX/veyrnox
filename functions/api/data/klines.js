// functions/api/data/klines.js
//
// Binance kline (OHLC candlestick) proxy. No API key required — Binance
// public market data is free. Proxying through the edge avoids CORS issues
// on native WebViews and gives us edge caching.

const BINANCE_BASE = 'https://api.binance.com/api/v3/klines';

const ALLOWED_SYMBOLS = new Set([
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'POLUSDT',
  'AVAXUSDT', 'OPUSDT', 'ARBUSDT', 'USDCUSDT', 'USDTUSDC',
]);

const ALLOWED_INTERVALS = new Set([
  '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M',
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

  const symbol = (url.searchParams.get('symbol') || '').toUpperCase();
  const interval = url.searchParams.get('interval') || '1h';
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1), 1000);

  if (!ALLOWED_SYMBOLS.has(symbol)) err(400, 'Invalid symbol');
  if (!ALLOWED_INTERVALS.has(interval)) err(400, 'Invalid interval');

  const upstream = `${BINANCE_BASE}?symbol=${symbol}&interval=${interval}&limit=${limit}`;

  const cacheKey = new Request(upstream);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const res = await fetch(upstream);
  if (!res.ok) err(502, `Binance returned ${res.status}`);

  const body = await res.text();
  const ttl = interval === '1m' ? 15 : interval === '1h' ? 30 : 60;

  const response = new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${ttl}`,
    },
  });

  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
