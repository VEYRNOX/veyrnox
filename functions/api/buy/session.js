// functions/api/buy/session.js
//
// Transak widget-URL proxy. The client sends (asset, network, address);
// the edge authenticates with Transak's partner API (secret never leaves
// the server) and returns a one-time widget URL with a sessionId.

import { enforceRateLimit as sharedEnforceRateLimit, clientIpOf } from '../_lib/rate-limit.js';
import { fetchUpstream, readCapped } from '../_lib/upstream.js';
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

// Referer sent on server-to-server calls to Transak. Must match the
// `referrerDomain` in the session body and the domain allowlisted with
// Transak for our partner key. See T-INF-103 remediation in this file's
// history.
const PARTNER_REFERER = 'https://veyrnox.com/';

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
  console.error(`[buy/session] ${stage} failed ref=${ref} status=${res.status} ${upstreamDetail(text)}`);
  err(502, `Buy is temporarily unavailable (ref ${ref})`);
}

// Characters kept per logged field. Transak's longest useful value is a
// `message`; 160 is enough to read one and short enough that a padded field
// cannot flood the tail log.
const MAX_LOG_FIELD = 160;

function logField(value) {
  if (value == null) return '';
  // Strip C0 controls, DEL and the Unicode line separators so a field cannot
  // forge a second log line.
  const cleaned = String(value).replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, '');
  return cleaned.length > MAX_LOG_FIELD ? `${cleaned.slice(0, MAX_LOG_FIELD)}…` : cleaned;
}

/**
 * Field-select an upstream Transak error for the tail log.
 *
 * This used to log `String(text).slice(0, 500)` — the whole response body. The
 * request we just sent Transak carries `widgetParams.walletAddress`, and an API
 * that rejects a payload commonly echoes the offending field back, so a failed
 * create-session could write a user's wallet address into the Workers log.
 * CLAUDE.md's logging rule is explicit: never log full addresses.
 *
 * Same split as the one in functions/api/rpc/[fn].js. Transak's error envelope
 * is `{ error: { statusCode, name, message, ... } }`; `name` and `message` say
 * what went wrong (`T-INF-103 Missing referer header`, `Invalid api-secret`,
 * errorCode 1002) and are what you actually grep for. Everything else is
 * dropped — including any echoed request payload.
 *
 * An unparseable body has no field structure to be selective about (a WAF
 * challenge page, a gateway error), so it keeps a short slice: enough to
 * recognise one, too short to carry a 42-char address plus context.
 */
function upstreamDetail(text) {
  const raw = String(text ?? '');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return `unparsed=${logField(raw)}`;
  }
  const e = (parsed && typeof parsed === 'object' && parsed.error) || parsed || {};
  const name = logField(e.name);
  const message = logField(e.message ?? (typeof parsed === 'string' ? parsed : null));
  const code = logField(e.errorCode ?? e.statusCode ?? e.code);
  return `code=${code} name=${name} message=${message}`;
}

// Per-IP fixed-window cap on session creation.
//
// Delegated to the shared limiter in functions/api/_lib/rate-limit.js so that
// bucket semantics (fail-closed on cache error, unknown-IP handling, non-atomic
// cross-colo caveats) stay identical to the other unauthenticated vendor-key
// proxies. Prior local reimplementation drifted (10/60s hardcoded, separate
// cache-key format) — consolidated 2026-08-16.
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_S = 60;

async function getPartnerToken(env, clientIp) {
  const environment = env.TRANSAK_ENVIRONMENT || 'STAGING';
  const urls = ENDPOINTS[environment];
  if (!urls) err(500, 'Invalid TRANSAK_ENVIRONMENT');

  const cacheKey = new Request(`https://edge-cache.internal/transak-partner-token-${environment}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    const { accessToken } = await cached.json();
    if (accessToken) return { accessToken, urls, fromCache: true };
  }

  const apiSecret = env.TRANSAK_API_SECRET;
  const apiKey = env.TRANSAK_API_KEY;
  if (!apiSecret || !apiKey) err(503, 'Transak not configured');

  const res = await fetchUpstream(urls.refreshToken, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
      'api-secret': apiSecret,
      'x-api-key': apiKey,
      'x-user-ip': clientIp || '0.0.0.0',
      // Transak support 2026-08-31: their WAF rejects the create-widget-URL
      // family with `T-INF-103 Missing referer header in request` unless
      // the server-side call carries a Referer matching `referrerDomain`.
      // Set from the backend (not forwarded from the client) so the value
      // is trusted and cannot be spoofed by end users.
      'Referer': PARTNER_REFERER,
    },
    body: JSON.stringify({ apiKey }),
  });

  if (!res.ok) {
    const text = await readCapped(res).catch(() => '');
    upstreamErr('refresh-token', res, text);
  }

  const data = JSON.parse(await readCapped(res));
  const accessToken = data?.data?.accessToken || data?.accessToken;
  if (!accessToken) err(502, 'No access token in Transak response');

  const cacheResponse = new Response(JSON.stringify({ accessToken }), {
    headers: { 'Cache-Control': 'max-age=518400' }, // 6 days (token lasts 7)
  });
  await cache.put(cacheKey, cacheResponse);

  return { accessToken, urls, fromCache: false };
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

  // clientIpOf only trusts CF-Connecting-IP (spoofable XFF fallback removed
  // by Codex P3 2026-08-15). Missing IP degrades to the shared "unknown"
  // bucket, strictly more restrictive than attacker-chosen buckets.
  const clientIp = clientIpOf(request);

  // Before any upstream call — the whole point is to not spend partner quota.
  // Shared limiter throws an err-shaped object ({status, expose}) that the
  // middleware surfaces as { error: 'Too many requests' }.
  await sharedEnforceRateLimit({
    bucket: 'buy-session',
    clientIp,
    max: RATE_LIMIT_MAX,
    windowSeconds: RATE_LIMIT_WINDOW_S,
  });

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

  // Transak's Create Widget URL spec takes `widgetParams` and nothing else;
  // `apiKey` and `referrerDomain` are mandatory INSIDE that object (they are
  // set in widgetParams above). We also sent them at the top level, which the
  // spec does not define. Harmless while they ignored unknown fields, but an
  // undefined field is not a contract — dropped to match the published shape
  // exactly. https://docs.transak.com/reference/create-widget-url
  const sessionBody = { widgetParams };

  async function callCreateSession(token, urls) {
    return fetchUpstream(urls.createSession, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
        'x-api-key': apiKey,
        'x-user-ip': clientIp,
        'access-token': token,
        'Referer': PARTNER_REFERER,
      },
      body: JSON.stringify(sessionBody),
    });
  }

  let { accessToken, urls, fromCache: tokenFromCache } = await getPartnerToken(env, clientIp);
  let sessionRes = await callCreateSession(accessToken, urls);

  // Retry ONCE, and only if the token we just used came from the cache.
  //
  // Transak's refresh-token docs: "Invoke this endpoint only when the existing
  // access token has expired (validity: 7 days). Do not call it repeatedly or
  // on every request, as this can cause unnecessary token regeneration and
  // potential rate-limiting issues" — and each new token invalidates the last.
  //
  // The previous code purged and re-minted on EVERY 401, including a 401 that
  // has nothing to do with the token. During the 2026-09-16 outage, when
  // create-session began returning 401 for every caller, that turned each Buy
  // tap into a token regeneration against the endpoint they warn about, at the
  // rate of live user traffic. A freshly minted token cannot be expired, so
  // re-minting after it fails is never the right move.
  if (sessionRes.status === 401 && tokenFromCache) {
    await caches.default.delete(
      new Request(`https://edge-cache.internal/transak-partner-token-${env.TRANSAK_ENVIRONMENT || 'STAGING'}`)
    );
    ({ accessToken, urls } = await getPartnerToken(env, clientIp));
    sessionRes = await callCreateSession(accessToken, urls);
  }

  if (!sessionRes.ok) {
    const text = await readCapped(sessionRes).catch(() => '');
    upstreamErr('create-session', sessionRes, text);
  }

  const sessionData = JSON.parse(await readCapped(sessionRes));
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
