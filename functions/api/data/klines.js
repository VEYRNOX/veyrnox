// functions/api/data/klines.js
//
// Binance kline (OHLC candlestick) proxy. No API key required — Binance
// public market data is free. Proxying through the edge avoids CORS issues
// on native WebViews and gives us edge caching.
//
// Binance blocks Cloudflare Workers' default User-Agent on api.binance.com.
// CF Workers overrides any custom UA header set in fetch(), so we can't fix
// it that way. Instead we try multiple official Binance endpoints — they are
// on different CDNs and may not all block CF IPs.
//
// OKX FALLBACK — why this exists.
// As of 2026-08-06 ALL SIX Binance endpoints return 502 from production
// (measured: three consecutive requests to /api/data/klines on
// veyrnox-prod.pages.dev, all 502), so this endpoint has been failing silently
// for some time. Current app builds no longer call it — src/lib/ohlcv.js moved
// to OKX in #1586 — but ALREADY-SHIPPED clients (the Play internal-testing
// release) still do, and they cannot be fixed by a server-side change to any
// other file. Translating an OKX response into Binance's kline row shape gets
// those installs working charts again with no app update.
//
// The translation is lossy in exactly one respect and that is fine: Binance
// rows carry trade-count and taker-volume fields OKX does not report. Nothing
// in this app reads past index 5 (see src/lib/binance.js, which maps indices
// 0-5 only), so the unused tail is zero-filled rather than guessed.

const BINANCE_ENDPOINTS = [
  'https://data-api.binance.vision/api/v3/klines',
  'https://api1.binance.com/api/v3/klines',
  'https://api2.binance.com/api/v3/klines',
  'https://api3.binance.com/api/v3/klines',
  'https://api4.binance.com/api/v3/klines',
  'https://api.binance.com/api/v3/klines',
];

const ALLOWED_SYMBOLS = new Set([
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'POLUSDT',
  'AVAXUSDT', 'OPUSDT', 'ARBUSDT', 'USDCUSDT', 'USDTUSDC',
]);

const ALLOWED_INTERVALS = new Set([
  '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M',
]);

// Binance symbol/interval -> OKX instId/bar, for the fallback below. Only the
// pairs in ALLOWED_SYMBOLS that OKX actually lists are mapped; anything absent
// simply has no fallback and still returns 502 rather than a wrong instrument.
// Note POLUSDT -> POL-USDT (MATIC was renamed POL on both venues).
const BINANCE_TO_OKX_INST = {
  BTCUSDT: 'BTC-USDT', ETHUSDT: 'ETH-USDT', BNBUSDT: 'BNB-USDT',
  SOLUSDT: 'SOL-USDT', POLUSDT: 'POL-USDT', AVAXUSDT: 'AVAX-USDT',
  OPUSDT: 'OP-USDT',   ARBUSDT: 'ARB-USDT', USDCUSDT: 'USDC-USDT',
};

// OKX uses uppercase letters for hour/day/week/month bars; minutes stay lower.
// Binance intervals with no OKX equivalent (3d, 8h) are deliberately absent.
const BINANCE_TO_OKX_BAR = {
  '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1H', '2h': '2H', '4h': '4H', '6h': '6H', '12h': '12H',
  '1d': '1D', '1w': '1W', '1M': '1M',
};

// Same three hosts okx-candles.js uses. OKX rate-limits at 40 req/2s per IP,
// and a shared Cloudflare egress IP can hit that, so a single host makes the
// fallback flaky exactly when it is most needed.
const OKX_ENDPOINTS = [
  'https://www.okx.com/api/v5/market/candles',
  'https://aws.okx.com/api/v5/market/candles',
  'https://app.okx.com/api/v5/market/candles',
];

/**
 * Fetch from OKX and reshape into Binance kline rows.
 * Binance row: [openTime, open, high, low, close, volume, closeTime, quoteVol,
 *               trades, takerBase, takerQuote, ignore]  — oldest-first
 * OKX row:     [ts, open, high, low, close, vol, volCcy, volCcyQuote, confirm]
 *              — newest-first
 * Returns null when OKX cannot serve it, so the caller still reports the
 * Binance failure rather than masking it as success.
 */
async function fetchViaOkx(symbol, interval, limit) {
  const instId = BINANCE_TO_OKX_INST[symbol];
  const bar = BINANCE_TO_OKX_BAR[interval];
  if (!instId || !bar) return null;

  // OKX caps this endpoint at 300; Binance allows up to 1000.
  const capped = Math.min(limit, 300);
  const qs = `?instId=${instId}&bar=${bar}&limit=${capped}`;

  for (const base of OKX_ENDPOINTS) {
    let res;
    try {
      res = await fetch(`${base}${qs}`);
    } catch {
      continue;
    }
    if (!res.ok) continue;

    let parsed;
    try {
      parsed = JSON.parse(await res.text());
    } catch {
      continue;
    }
    if (parsed?.code !== '0' || !Array.isArray(parsed.data) || parsed.data.length === 0) continue;

    const barMs = Number(parsed.data[0][0]) - Number(parsed.data[1]?.[0] ?? parsed.data[0][0]);
    const rows = parsed.data
      .slice()
      .reverse() // OKX newest-first -> Binance oldest-first
      .map((k) => {
        const openTime = Number(k[0]);
        return [
          openTime,
          k[1], k[2], k[3], k[4],   // open, high, low, close
          k[5],                      // base volume
          openTime + (barMs || 0) - 1, // closeTime (approximate; unread by this app)
          k[7] ?? '0',               // quote volume
          0, '0', '0', '0',          // trades / taker fields — not reported by OKX
        ];
      });
    return JSON.stringify(rows);
  }
  return null;
}

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

  const qs = `?symbol=${symbol}&interval=${interval}&limit=${limit}`;

  // Edge cache keyed on canonical params (endpoint-agnostic).
  const cacheKey = new Request(`https://binance-klines.internal/${symbol}/${interval}/${limit}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Try each endpoint until one succeeds. Binance blocks CF Workers on some
  // hosts but not others — data-api.binance.vision and the numbered api
  // endpoints are on different CDNs.
  let lastStatus = 0;
  for (const base of BINANCE_ENDPOINTS) {
    try {
      const res = await fetch(`${base}${qs}`);
      if (res.ok) {
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
      lastStatus = res.status;
    } catch {
      // Network error on this endpoint — try the next one.
    }
  }

  // Every Binance host failed. Serve the same data from OKX in Binance's shape
  // so already-shipped clients keep working (see the header note).
  const okxBody = await fetchViaOkx(symbol, interval, limit);
  if (okxBody !== null) {
    const ttl = interval === '1m' ? 15 : interval === '1h' ? 30 : 60;
    const response = new Response(okxBody, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttl}`,
        // Observability: without this, a silent source swap is invisible and
        // "klines works again" would hide that Binance is still down.
        'X-Veyrnox-Source': 'okx-fallback',
      },
    });
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  }

  err(502, `All Binance endpoints returned ${lastStatus || 'network error'}; OKX fallback unavailable`);
}
