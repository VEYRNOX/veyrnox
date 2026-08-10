// functions/api/data/prices.js
//
// CryptoCompare price proxy. Injects the API key server-side and caches
// responses at the edge. The client sends only the endpoint path and
// query params (fsyms, tsyms, limit, etc.) — never the API key.
//
// Allowed endpoints (allowlist, not passthrough):
//   pricemulti, pricemultifull, v2/histoday, v2/histohour, v2/histominute

import { enforceRateLimit, clientIpOf } from '../_lib/rate-limit.js';

const CC_BASE = 'https://min-api.cryptocompare.com/data';

const ALLOWED_ENDPOINTS = new Set([
  'pricemulti',
  'pricemultifull',
  'v2/histoday',
  'v2/histohour',
  'v2/histominute',
]);

const CACHE_TTL = {
  'pricemulti': 30,
  'pricemultifull': 30,
  'v2/histoday': 300,
  'v2/histohour': 60,
  'v2/histominute': 15,
};

function err(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  throw e;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const endpoint = url.searchParams.get('endpoint');
  if (!endpoint || !ALLOWED_ENDPOINTS.has(endpoint)) {
    err(400, 'Invalid or missing endpoint');
  }

  // Per-IP cap: this proxy injects a paid CryptoCompare key server-side; without
  // a cap a single caller can burn the whole vendor quota.
  await enforceRateLimit({ bucket: 'data-prices', clientIp: clientIpOf(request) });

  const upstream = new URL(`${CC_BASE}/${endpoint}`);

  for (const [key, val] of url.searchParams.entries()) {
    if (key === 'endpoint') continue;
    upstream.searchParams.set(key, val);
  }

  const ccKey = env.CRYPTOCOMPARE_API_KEY;
  if (ccKey) upstream.searchParams.set('api_key', ccKey);

  const cacheKey = new Request(upstream.toString());
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const res = await fetch(upstream.toString());
  if (!res.ok) err(502, `CryptoCompare returned ${res.status}`);

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
