#!/usr/bin/env node
// scripts/check-edge-endpoints.mjs
//
// Synthetic check for the /api/data/* edge functions against a deployed origin.
//
// WHY THIS EXISTS. On 2026-08-06 /api/data/klines was returning 502 from
// production on every request — Binance blocks Cloudflare egress IPs — and
// nothing surfaced it. It was found by hand, long after the fact. Unit tests
// cannot catch this class of failure: the functions in functions/api/data/ are
// never executed by vitest, and a local `vite` dev server does not serve /api/*
// at all (there is no `wrangler pages dev` script). The only place these run is
// a real deployment, so that is where they have to be checked.
//
// Usage:
//   node scripts/check-edge-endpoints.mjs <base-url>
//   node scripts/check-edge-endpoints.mjs https://veyrnox-prod.pages.dev
//
// Exits non-zero if any REQUIRED check fails. Advisory checks report but do not
// fail the run — used for sources that are known-degraded upstream and are
// covered by a fallback, so the build does not go red for someone else's outage.

const base = (process.argv[2] || '').replace(/\/$/, '');
if (!base) {
  console.error('usage: check-edge-endpoints.mjs <base-url>');
  process.exit(2);
}

const TIMEOUT_MS = 20_000;
// A Cloudflare Pages deployment is not routable the instant `wrangler pages
// deploy` returns: the static assets answer first and the Functions bind a
// moment later. Checking immediately produced a 404 on EVERY endpoint —
// including ones known-good on other URLs — and failed the deploy job for no
// real reason. Wait for the deployment to come up before asserting anything.
const READY_TIMEOUT_MS = 120_000;
const READY_POLL_MS = 5_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll until the Functions layer answers at all (any status other than 404).
 * Returns false if it never does — a genuine "functions did not deploy".
 */
async function waitForFunctions(probePath) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let last = 0;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}${probePath}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      last = res.status;
      if (res.status !== 404) return true;
    } catch {
      // Not resolvable yet — keep waiting.
    }
    await sleep(READY_POLL_MS);
  }
  console.error(`Functions never became routable (last status ${last || 'no response'}) after ${READY_TIMEOUT_MS / 1000}s`);
  return false;
}

/** @type {Array<{name:string,path:string,required:boolean,check:(body:any,res:Response)=>string|null}>} */
const CHECKS = [
  {
    name: 'okx-candles (chart primary)',
    path: '/api/data/okx-candles?instId=BTC-USDT&bar=1H&limit=5',
    required: true,
    check: (b) => {
      if (b?.code !== '0') return `expected code "0", got ${JSON.stringify(b?.code)}`;
      if (!Array.isArray(b.data) || b.data.length === 0) return 'no candles returned';
      // Guard against a source that answers 200 with stale or malformed rows.
      const [ts, open] = b.data[0];
      if (!Number.isFinite(Number(ts)) || !Number.isFinite(Number(open))) return 'malformed candle row';
      const ageH = (Date.now() - Number(ts)) / 3_600_000;
      if (ageH > 6) return `newest candle is ${ageH.toFixed(1)}h old`;
      return null;
    },
  },
  {
    name: 'okx-candles rejects a bad instId',
    path: '/api/data/okx-candles?instId=EVIL-USDT&bar=1H&limit=5',
    required: true,
    expectStatus: 400,
    check: () => null,
  },
  {
    name: 'klines (legacy, shipped clients)',
    path: '/api/data/klines?symbol=BTCUSDT&interval=1h&limit=5',
    // Advisory: Binance blocks CF egress, so this rides the OKX fallback. If
    // BOTH are down it is worth seeing, but it should not fail a deploy.
    required: false,
    check: (b) => {
      if (!Array.isArray(b) || b.length === 0) return 'no rows returned';
      if (!Array.isArray(b[0]) || b[0].length < 6) return 'row is not a kline tuple';
      if (Number(b[0][0]) > Number(b[b.length - 1][0])) return 'rows are newest-first (expected oldest-first)';
      return null;
    },
  },
  {
    name: 'coingecko (chart fallback)',
    path: '/api/data/coingecko?endpoint=coins/ohlc&coin_id=bitcoin&vs_currency=usd&days=90',
    // NB: this proxy takes coin_id, not id — an `id=` probe 400s and looks like
    // an outage. Also ~5 req/min anonymous, so a 429 here is normal.
    required: false,
    check: (b) => (Array.isArray(b) && b.length > 0 ? null : 'no OHLC rows returned'),
  },
];

async function run() {
  let failed = 0;
  let advisory = 0;

  const ready = await waitForFunctions(CHECKS[0].path);
  if (!ready) {
    console.error(`
FAIL  deployment never served /api/* — ${base}`);
    process.exit(1);
  }

  for (const c of CHECKS) {
    const url = `${base}${c.path}`;
    const expect = c.expectStatus ?? 200;
    let res, body, problem = null;

    // Upstream exchanges rate-limit (OKX is 40 req/2s per IP, shared across a
    // Cloudflare egress address), so a single blip must not read as an outage.
    // Retry before declaring failure — but never retry away a persistent fault:
    // ATTEMPTS is small and the last problem is what gets reported.
    const ATTEMPTS = 3;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      res = undefined; body = undefined; problem = null;
      try {
        res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (e) {
        problem = `request failed: ${e.message}`;
      }

      if (!problem) {
        if (res.status !== expect) {
          problem = `HTTP ${res.status} (expected ${expect})`;
        } else if (expect === 200) {
          try {
            body = await res.json();
          } catch {
            problem = 'response was not JSON';
          }
          if (!problem) problem = c.check(body, res);
        }
      }

      if (!problem) break;
      if (attempt < ATTEMPTS) await sleep(3_000);
    }

    const source = res?.headers?.get?.('X-Veyrnox-Source');
    const note = source ? ` [source: ${source}]` : '';

    if (problem) {
      if (c.required) { failed++; console.error(`FAIL  ${c.name}${note} — ${problem}`); }
      else { advisory++; console.warn(`WARN  ${c.name}${note} — ${problem}`); }
    } else {
      console.log(`ok    ${c.name}${note}`);
    }
  }

  console.log(`\n${CHECKS.length - failed - advisory} ok, ${advisory} advisory, ${failed} failed — ${base}`);
  if (failed) process.exit(1);
}

run();
