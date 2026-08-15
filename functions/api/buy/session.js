// functions/api/buy/session.js
//
// Transak widget-URL proxy. The client sends (asset, network, address);
// the edge authenticates with Transak's partner API (secret never leaves
// the server) and returns a one-time widget URL with a sessionId.
//
// Flow:
//   1. Refresh Partner Access Token (cached ~6 days via Cache API)
//   2. POST /api/v2/auth/session with x-api-key + x-user-ip
//   3. Return { url } to the client
//
// Secrets (via context.env):
//   TRANSAK_API_KEY       — partner API key (x-api-key header)
//   TRANSAK_API_SECRET    — partner API secret (refresh-token call)
//   TRANSAK_ENVIRONMENT   — 'STAGING' | 'PRODUCTION' (wrangler.toml)

const ENDPOINTS = {
  STAGING: {
    refreshToken: 'https://api-stg.transak.com/partners/api/v2/refresh-token',
    createSession: 'https://api-gateway-stg.transak.com/api/v2/auth/session',
    widget: 'https://global-stg.transak.com',
  },
  PRODUCTION: {
    refreshToken: 'https://api.transak.com/partners/api/v2/refresh-token',
    createSession: 'https://api-gateway.transak.com/api/v2/auth/session',
    widget: 'https://global.transak.com',
  },
};

const SUPPORTED_ASSETS = new Map([
  ['ETH:ethereum',     { code: 'ETH',  network: 'ethereum'   }],
  ['MATIC:polygon',    { code: 'MATIC', network: 'polygon'   }],
  ['ARB:arbitrum',     { code: 'ETH',  network: 'arbitrum'   }],
  ['OP:optimism',      { code: 'ETH',  network: 'optimism'   }],
  ['AVAX:avaxcchain',  { code: 'AVAX', network: 'avaxcchain' }],
  ['BNB:bsc',          { code: 'BNB',  network: 'bsc'        }],
  ['BTC:mainnet',      { code: 'BTC',  network: 'mainnet'    }],
  ['SOL:solana',       { code: 'SOL',  network: 'solana'     }],
  ['USDC:ethereum',    { code: 'USDC', network: 'ethereum'   }],
  ['USDC:polygon',     { code: 'USDC', network: 'polygon'    }],
  ['USDT:ethereum',    { code: 'USDT', network: 'ethereum'   }],
]);

function err(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  throw e;
}

/**
 * Upstream failure -> generic client error + a correlated server-side log.
 *
 * The two Transak failure paths used to do
 *   err(502, `Transak session ${res.status}: ${text.slice(0, 300)}`)
 * and `err` sets `expose = true`, which _middleware.js returns verbatim — so up
 * to 300 characters of a third-party API's error body reached the client. The
 * partner secret is sent in a request header and never echoed back, so no
 * credential leaked, but this still violates the response-hygiene rule ("wrap
 * errors in a generic envelope with a client-safe message; log the real error
 * with a correlation ID") and hands out upstream diagnostics for free.
 *
 * The detail is not discarded — it goes to the Workers tail log, where
 * operators can read it and callers cannot.
 */
function upstreamErr(stage, res, text) {
  const ref = crypto.randomUUID().slice(0, 8);
  console.error(`[buy/session] ${stage} failed ref=${ref} status=${res.status} body=${String(text).slice(0, 500)}`);
  err(502, `Buy is temporarily unavailable (ref ${ref})`);
}

// Per-IP fixed-window cap on session creation.
//
// WHAT THIS IS: every POST here spends a real upstream
// `POST /api/v2/auth/session` against the Veyrnox Transak partner account. The
// endpoint is unauthenticated by design and had no cap of any kind, so a single
// caller could burn partner quota at request rate. This bounds that.
//
// WHAT THIS IS NOT — do not upgrade the claim: `caches.default` is per-colo and
// read-modify-write here is NOT atomic, so concurrent requests in the same
// window can undercount, and an attacker spread across colos or IPs gets a
// multiple of the limit. It raises the cost of casual and single-source abuse;
// it is not a guarantee. The durable control is a Cloudflare Rate Limiting rule
// at the zone level, which this does not replace.
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_S = 60;

async function enforceRateLimit(clientIp) {
  // An absent client IP must not share one bucket with every other unknown
  // caller — that would let one abuser exhaust the quota for all of them.
  // Unknown IP gets no allowance at all rather than a shared one (I4).
  if (!clientIp || clientIp === '0.0.0.0') err(429, 'Too many requests');

  const window = Math.floor(Date.now() / 1000 / RATE_LIMIT_WINDOW_S);
  const key = new Request(
    `https://edge-cache.internal/buy-session-rl/${encodeURIComponent(clientIp)}/${window}`,
  );
  const cache = caches.default;

  let count = 0;
  try {
    const hit = await cache.match(key);
    if (hit) count = Number(await hit.text()) || 0;
  } catch {
    // FAIL CLOSED. If the limiter cannot decide, do NOT proceed to spend partner
    // quota. Previously this failed open on the theory that a cache blip should
    // not break Buy; but the 2026-08 audit rules that a cache outage silently
    // exposing the paid vendor account is the worse failure, and matches the
    // "fail closed on limiter error" rule now applied uniformly across
    // functions/api/_lib/rate-limit.js. Buy briefly returning 429 during a
    // Cache API incident is preferable to unmetered spend.
    err(429, 'Too many requests');
  }

  if (count >= RATE_LIMIT_MAX) err(429, 'Too many requests');

  try {
    await cache.put(key, new Response(String(count + 1), {
      headers: { 'Cache-Control': `max-age=${RATE_LIMIT_WINDOW_S}` },
    }));
  } catch { /* best-effort accounting */ }
}

async function getPartnerToken(env) {
  const environment = env.TRANSAK_ENVIRONMENT || 'STAGING';
  const urls = ENDPOINTS[environment];
  if (!urls) err(500, 'Invalid TRANSAK_ENVIRONMENT');

  const cacheKey = new Request(`https://edge-cache.internal/transak-partner-token-${environment}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    const { accessToken } = await cached.json();
    if (accessToken) return { accessToken, urls };
  }

  const apiSecret = env.TRANSAK_API_SECRET;
  const apiKey = env.TRANSAK_API_KEY;
  if (!apiSecret || !apiKey) err(503, 'Transak not configured');

  const res = await fetch(urls.refreshToken, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-secret': apiSecret,
      'x-api-key': apiKey,
    },
    body: JSON.stringify({ apiKey }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    upstreamErr('refresh-token', res, text);
  }

  const data = await res.json();
  const accessToken = data?.data?.accessToken || data?.accessToken;
  if (!accessToken) err(502, 'No access token in Transak response');

  const cacheResponse = new Response(JSON.stringify({ accessToken }), {
    headers: { 'Cache-Control': 'max-age=518400' }, // 6 days (token lasts 7)
  });
  await cache.put(cacheKey, cacheResponse);

  return { accessToken, urls };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const apiKey = env.TRANSAK_API_KEY;
  if (!apiKey) err(503, 'Buy not available');

  let body;
  try {
    body = await request.json();
  } catch {
    err(400, 'Invalid JSON');
  }

  const { asset, network, address, fiatAmount, fiatCurrency, productsAvailed } = body;

  if (!address || typeof address !== 'string' || address.length < 10 || address.length > 128) {
    err(400, 'Invalid address');
  }

  const row = SUPPORTED_ASSETS.get(`${asset}:${network}`);
  if (!row) err(400, 'Unsupported asset/network');

  const product = productsAvailed === 'SELL' ? 'SELL' : 'BUY';

  // Codex P3 2026-08-15: identical rationale to rate-limit.js clientIpOf —
  // dropped the X-Forwarded-For fallback so a client cannot forge a rate-
  // limit bucket by setting XFF. Missing CF-Connecting-IP now falls into
  // the shared 'unknown' bucket, which is strictly more restrictive than
  // an attacker-chosen private bucket.
  const clientIp = request.headers.get('CF-Connecting-IP') || '';

  // Before any upstream call — the whole point is to not spend partner quota.
  await enforceRateLimit(clientIp);

  const widgetParams = {
    apiKey,
    referrerDomain: 'veyrnox.com',
    cryptoCurrencyCode: row.code,
    network: row.network,
    walletAddress: address,
    productsAvailed: product,
    disableWalletAddressForm: true,
  };
  // Both are forwarded to a partner API, so they get validated rather than
  // coerced. `Number(fiatAmount)` alone accepts NaN, Infinity and negatives —
  // `Number('abc')` is NaN, which JSON.stringify then sends as `null`. Reject
  // instead of forwarding a value we did not understand (I4).
  if (fiatAmount != null) {
    const amt = Number(fiatAmount);
    if (!Number.isFinite(amt) || amt <= 0 || amt > 1_000_000) err(400, 'Invalid fiatAmount');
    widgetParams.fiatAmount = amt;
  }
  if (fiatCurrency != null) {
    const cur = String(fiatCurrency).toUpperCase();
    if (!/^[A-Z]{3}$/.test(cur)) err(400, 'Invalid fiatCurrency');
    widgetParams.fiatCurrency = cur;
  }

  const sessionBody = {
    apiKey,
    referrerDomain: 'veyrnox.com',
    widgetParams,
  };

  async function callCreateSession(token, urls) {
    return fetch(urls.createSession, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'x-user-ip': clientIp,
        'access-token': token,
      },
      body: JSON.stringify(sessionBody),
    });
  }

  let { accessToken, urls } = await getPartnerToken(env);
  let sessionRes = await callCreateSession(accessToken, urls);

  if (sessionRes.status === 401) {
    await caches.default.delete(
      new Request(`https://edge-cache.internal/transak-partner-token-${env.TRANSAK_ENVIRONMENT || 'STAGING'}`)
    );
    ({ accessToken, urls } = await getPartnerToken(env));
    sessionRes = await callCreateSession(accessToken, urls);
  }

  if (!sessionRes.ok) {
    const text = await sessionRes.text().catch(() => '');
    upstreamErr('create-session', sessionRes, text);
  }

  const sessionData = await sessionRes.json();
  const widgetUrl = sessionData?.data?.widgetUrl;
  if (!widgetUrl) err(502, 'No widgetUrl in Transak response');

  return new Response(JSON.stringify({ url: widgetUrl }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestGet() {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}
