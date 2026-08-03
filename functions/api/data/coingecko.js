// functions/api/data/coingecko.js
//
// CoinGecko price proxy. No API key required (free tier). Proxying through
// the edge solves CORS on native WebViews and gives us edge caching.
//
// Allowed endpoints (allowlist):
//   simple/price, coins/markets, coins/:id/ohlc

const CG_BASE = 'https://api.coingecko.com/api/v3';

const ALLOWED_CG_IDS = new Set([
  'bitcoin', 'ethereum', 'tether', 'binancecoin', 'solana',
  'usd-coin', 'ripple', 'dogecoin', 'cardano', 'tron',
  'matic-network', 'arbitrum', 'optimism', 'avalanche-2',
]);

const ALLOWED_ENDPOINTS = new Set(['simple/price', 'coins/markets', 'coins/ohlc']);

const CACHE_TTL = {
  'simple/price': 30,
  'coins/markets': 60,
  'coins/ohlc': 120,
};

function err(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  throw e;
}

function validateIds(idsParam) {
  if (!idsParam) return;
  const ids = idsParam.split(',');
  for (const id of ids) {
    if (!ALLOWED_CG_IDS.has(id.trim())) err(400, `Coin id not allowed: ${id}`);
  }
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);

  const endpoint = url.searchParams.get('endpoint');
  if (!endpoint || !ALLOWED_ENDPOINTS.has(endpoint)) {
    err(400, 'Invalid or missing endpoint');
  }

  const upstream = new URL(`${CG_BASE}/${endpoint}`);

  for (const [key, val] of url.searchParams.entries()) {
    if (key === 'endpoint') continue;
    upstream.searchParams.set(key, val);
  }

  validateIds(upstream.searchParams.get('ids'));

  const cacheKey = new Request(upstream.toString());
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const res = await fetch(upstream.toString());
  if (!res.ok) err(502, `CoinGecko returned ${res.status}`);

  const body = await res.text();
  const ttl = CACHE_TTL[endpoint] || 30;

  const response = new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${ttl}`,
    },
  });

  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
