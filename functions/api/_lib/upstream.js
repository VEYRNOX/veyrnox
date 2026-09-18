// functions/api/_lib/upstream.js
//
// Timeout + response-size bounds for the outbound calls the Pages Functions
// make (functions/api/data/*, rpc/[fn].js, buy/session.js). Every one of those
// fetches previously had NO deadline and read the upstream body with an
// uncapped `res.text()`, so a slow or oversized upstream tied up the request
// for as long as the platform allowed.
//
// WHAT THIS IS NOT. This is availability hygiene, not an SSRF control. Every
// destination in this codebase is already a hardcoded constant or an env var,
// with caller input confined to allowlisted path segments and query params
// (see the allowlists in data/coingecko.js, data/prices.js, data/klines.js,
// data/okx-candles.js, edge/[fn].js, rpc/[fn].js). Nothing here validates a
// destination, because no handler accepts one.
//
// REDIRECTS ARE STILL FOLLOWED, deliberately. `redirect: 'manual'` would let
// an allowlisted upstream redirect off the allowlist without us noticing, but
// turning it on risks breaking live third parties that legitimately redirect
// (the RSS feeds and the OKX/Binance host fallbacks are the likely ones), and
// the Worker has no internal network to be redirected at — wrangler.toml
// declares no Hyperdrive, service, tunnel or mTLS binding. Availability cost
// of a redirect off-allowlist is bounded by the same timeout below. Revisit
// this if a binding is ever added.

// 8s is comfortably above the p99 of every upstream here and well under the
// point where a caller has given up. The multi-host fallback loops in
// klines.js / okx-candles.js pass a shorter value, because they may try three
// to six hosts in sequence and the bound that matters is the total.
export const DEFAULT_TIMEOUT_MS = 8000;

// 2 MiB. The largest legitimate body in this surface is an RSS feed (low
// hundreds of KiB); a 1000-row Binance kline page is ~120 KiB.
export const MAX_UPSTREAM_BYTES = 2 * 1024 * 1024;

function upstreamErr(message) {
  const e = new Error(message);
  e.status = 502;
  e.expose = true;
  return e;
}

/**
 * fetch() with a deadline. Same signature as fetch; `timeoutMs` is consumed
 * here and everything else is passed through untouched.
 *
 * A timeout surfaces as the runtime's own AbortError from fetch — callers that
 * already wrap the fetch in try/catch to try the next host keep working
 * unchanged.
 * @param {string} url
 * @param {RequestInit & { timeoutMs?: number }} [init]
 * @returns {Promise<Response>}
 */
export function fetchUpstream(url, init = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  return fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
}

/**
 * Drop-in for `await res.text()` that refuses to buffer more than `maxBytes`.
 *
 * Content-Length is checked first as a cheap reject, but it is advisory — a
 * chunked response carries none and a lying one is trivial — so the byte count
 * is enforced on the actual read as well. Throws a 502-shaped error (the
 * `{status, expose}` contract _middleware.js reads) rather than returning a
 * truncated body, because a silently truncated JSON body would be parsed into
 * a wrong answer rather than an error.
 * @param {Response} res
 * @param {number} [maxBytes]
 * @returns {Promise<string>}
 */
export async function readCapped(res, maxBytes = MAX_UPSTREAM_BYTES) {
  const declared = Number(res.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw upstreamErr('Upstream response too large');
  }
  if (!res.body) return res.text();

  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw upstreamErr('Upstream response too large');
    }
    chunks.push(value);
  }

  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buf);
}
