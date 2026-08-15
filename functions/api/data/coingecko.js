// functions/api/data/coingecko.js
//
// CoinGecko price proxy. Passes the demo API key when COINGECKO_API_KEY is
// set in CF Pages env vars. Proxying through the edge solves CORS on native
// WebViews and gives us edge caching.
//
// Allowed endpoints (allowlist):
//   simple/price, coins/markets, coins/:id/ohlc

import { enforceRateLimit, clientIpOf } from '../_lib/rate-limit.js';

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

function resolveEndpoint(endpoint, params) {
  if (endpoint === 'coins/ohlc') {
    const coinId = params.get('coin_id');
    // Codex P3 2026-08-15: fixed-token error, do NOT reflect caller input.
    // Matches the hygiene of every other error message in this surface —
    // no reflected value means no JSON-injection / cache-poison / log-
    // pollution vector, even the theoretical one.
    if (!coinId || !ALLOWED_CG_IDS.has(coinId)) err(400, 'Invalid coin_id for OHLC');
    params.delete('coin_id');
    return `coins/${coinId}/ohlc`;
  }
  return endpoint;
}

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
    // Codex P3 2026-08-15: fixed-token error, do NOT reflect caller input
    // (matching resolveEndpoint above).
    if (!ALLOWED_CG_IDS.has(id.trim())) err(400, 'Coin id not allowed');
  }
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);

  const endpoint = url.searchParams.get('endpoint');
  if (!endpoint || !ALLOWED_ENDPOINTS.has(endpoint)) {
    err(400, 'Invalid or missing endpoint');
  }

  // Per-IP cap: this proxy injects the CoinGecko demo API key server-side.
  await enforceRateLimit({ bucket: 'data-coingecko', clientIp: clientIpOf(request) });

  const upstreamParams = new URLSearchParams();
  for (const [key, val] of url.searchParams.entries()) {
    if (key === 'endpoint') continue;
    upstreamParams.set(key, val);
  }

  const resolvedPath = resolveEndpoint(endpoint, upstreamParams);
  const upstream = new URL(`${CG_BASE}/${resolvedPath}`);
  for (const [key, val] of upstreamParams.entries()) {
    upstream.searchParams.set(key, val);
  }

  validateIds(upstream.searchParams.get('ids'));

  const cacheKey = new Request(upstream.toString());
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const headers = {};
  const apiKey = context.env?.COINGECKO_API_KEY;
  if (apiKey) headers['x-cg-demo-api-key'] = apiKey;

  const res = await fetch(upstream.toString(), { headers });
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
