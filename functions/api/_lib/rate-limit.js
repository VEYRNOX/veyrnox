// functions/api/_lib/rate-limit.js
//
// Per-caller fixed-window rate limiter for unauthenticated vendor-key proxies
// (functions/api/data/*). All of these inject a paid vendor API key server-side
// (CryptoCompare, CoinGecko, Etherscan) or spend our egress on public APIs
// (Binance, mempool.space, RSS) and had no per-caller cap of any kind, so a
// single caller could burn quota / egress at request rate.
//
// FAIL CLOSED on cache errors, deliberately.
//
// The buy/session.js limiter fails OPEN on cache error because turning a cache
// blip into a Buy outage is worse than briefly under-limiting. These proxies
// protect a metered spend quota with no fallback path, so a cache blip that
// disables the limiter would immediately expose the quota. Erring on 429 for
// the duration of a Cache API outage is the right trade here.
//
// LIMITS OF THIS CONTROL — do not upgrade the claim: `caches.default` is
// per-colo and read-modify-write is NOT atomic, so concurrent requests in the
// same window can undercount, and an attacker spread across colos or IPs gets
// a multiple of the limit. This raises the cost of casual and single-source
// abuse; it is NOT a guarantee. The durable control is a Cloudflare Rate
// Limiting rule at the zone level.

const DEFAULTS = { max: 60, windowSeconds: 60 };

export function clientIpOf(request) {
  // Codex P3 2026-08-15: only trust CF-Connecting-IP. The prior
  // X-Forwarded-For fallback was spoofable — a client can set that header
  // freely, and if any deployment path (test harness, dev, misrouted
  // Worker) ever served a request without CF stamping CF-Connecting-IP,
  // the rate-limit key would come straight from the untrusted client.
  // Falling back to '' (which the caller bucket-keys as "unknown") makes
  // the identity DEGRADE INTO A SHARED BUCKET rather than into an
  // attacker-chosen bucket — an attacker spamming from behind our own
  // edge shares the bucket with every other missing-IP request, which is
  // strictly more restrictive than granting them a private per-IP quota
  // via a forged XFF header.
  return request.headers.get('CF-Connecting-IP') || '';
}

/**
 * Enforce a per-IP fixed-window cap using Cache API for cross-request state.
 * Throws an `err`-shaped object (status/expose) on 429 or when the limiter
 * cannot decide safely.
 *
 * @param {object} p
 * @param {string} p.bucket           namespace, e.g. 'data-prices'
 * @param {string} p.clientIp
 * @param {number} [p.max]            requests per window per IP
 * @param {number} [p.windowSeconds]  window size in seconds
 */
export async function enforceRateLimit({
  bucket,
  clientIp,
  max = DEFAULTS.max,
  windowSeconds = DEFAULTS.windowSeconds,
}) {
  // An absent client IP must not share one bucket with every other unknown
  // caller — that would let one abuser exhaust the quota for all of them.
  if (!clientIp || clientIp === '0.0.0.0') throw rlError();

  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = new Request(
    `https://edge-cache.internal/rl/${encodeURIComponent(bucket)}/${encodeURIComponent(clientIp)}/${window}`,
  );
  const cache = caches.default;

  let count = 0;
  try {
    const hit = await cache.match(key);
    if (hit) count = Number(await hit.text()) || 0;
  } catch {
    // Fail CLOSED. See file-level comment.
    throw rlError();
  }

  if (count >= max) throw rlError();

  try {
    await cache.put(key, new Response(String(count + 1), {
      headers: { 'Cache-Control': `max-age=${windowSeconds}` },
    }));
  } catch { /* best-effort accounting */ }
}

function rlError() {
  const e = new Error('Too many requests');
  e.status = 429;
  e.expose = true;
  return e;
}
