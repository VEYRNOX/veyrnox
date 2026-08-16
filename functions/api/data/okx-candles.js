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

import { enforceRateLimit, clientIpOf } from '../_lib/rate-limit.js';

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

/**
 * Bound an OKX `code` before it can reach a client-facing error message.
 *
 * OKX codes are short numeric strings ('0', '50011'). The field is upstream
 * data, so its SHAPE is not ours to assume — a code is only pasted into the
 * response when it looks like one. Anything else becomes a fixed token rather
 * than an unbounded passthrough into our error envelope.
 */
function safeOkxCode(code) {
  const s = String(code ?? '');
  return /^[0-9]{1,8}$/.test(s) ? s : 'unrecognised';
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

  // Per-IP cap: same sibling-proxy class as prices.js — an OKX public endpoint
  // still spends our egress. Fail-CLOSED on limiter error is the contract in
  // _lib/rate-limit.js.
  await enforceRateLimit({ bucket: 'data-okx-candles', clientIp: clientIpOf(request) });

  // Edge cache keyed on canonical params.
  const cacheKey = new Request(`https://okx-candles.internal/${instId}/${bar}/${limit}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const qs = `?instId=${instId}&bar=${bar}&limit=${limit}`;
  const ttl = bar === '1m' ? 15 : bar === '1H' ? 30 : 60;

  // The failure reason is recorded in TWO forms, deliberately:
  //
  //   `lastDetail` — bounded and client-safe, ends up in the 502 message.
  //   console.error — everything, including upstream prose, for the Workers
  //                   tail log where operators can read it and callers cannot.
  //
  // WHY. This used to be a single `lastStatus`, and the two application-level
  // branches below both assigned the literal 502 — so an OKX rate limit
  // (HTTP 200 + code 50011) and a malformed body collapsed into the same
  // `All OKX endpoints returned 502`, with OKX's own code discarded. That cost
  // two undiagnosable CI failures: the `deploy` job's edge check went red on
  // 52e3e05f (2026-08-07) and again on 35d85509 (2026-08-08), each time failing
  // `staging-gate` — a REQUIRED merge check — and each time the endpoint served
  // 200 again minutes later, so nothing was left to inspect. OKX allows
  // 40 req/2s per IP and Cloudflare Workers share egress addresses, which makes
  // a rate limit the leading hypothesis; it stayed a hypothesis precisely
  // because the code was thrown away.
  //
  // The client gets the CODE and not the `msg`: a code is a bounded token
  // (see safeOkxCode), upstream prose is not, and echoing it verbatim would
  // make this error envelope a passthrough for third-party text — the same
  // response-hygiene rule functions/api/buy/session.js `upstreamErr()` applies
  // to Transak.
  let lastDetail = 'network error';

  for (const base of OKX_ENDPOINTS) {
    const host = new URL(base).host;
    let res;
    try {
      res = await fetch(`${base}${qs}`);
    } catch (e) {
      // Network error on this host — try the next.
      lastDetail = 'network error';
      console.error(`[okx-candles] ${host} network error: ${String(e?.message ?? e).slice(0, 200)}`);
      continue;
    }
    if (!res.ok) {
      lastDetail = `HTTP ${res.status}`;
      console.error(`[okx-candles] ${host} ${lastDetail}`);
      continue;
    }

    const body = await res.text();
    // A 200 carrying a non-zero OKX code is an application-level failure (bad
    // instId, rate limit). Treat it as this host failing rather than caching it
    // — caching an error for 60s would turn a blip into a visible outage.
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      lastDetail = 'unparseable response';
      console.error(`[okx-candles] ${host} unparseable response: ${body.slice(0, 200)}`);
      continue;
    }
    if (parsed?.code !== '0') {
      lastDetail = `OKX code ${safeOkxCode(parsed?.code)}`;
      console.error(
        `[okx-candles] ${host} OKX code=${String(parsed?.code ?? '').slice(0, 32)} `
        + `msg=${String(parsed?.msg ?? '').slice(0, 200)}`,
      );
      continue;
    }

    const response = new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttl}`,
      },
    });
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  }

  err(502, `All OKX endpoints failed (last: ${lastDetail})`);
}
