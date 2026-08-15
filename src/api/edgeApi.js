// src/api/edgeApi.js
//
// Client-side adapter for the Cloudflare Edge API layer.
// All external API calls route through /api/* — secrets stay server-side.
//
// I3 CHOKEPOINT: every function checks isDeniabilityOrDemoActive() before
// making a network call. The edge never sees a request from a decoy session.

import { Capacitor } from '@capacitor/core';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { DEMO } from '@/api/demoClient';
import { isTransakUrl } from '@/lib/buy/transakUrl.js';

// Absolute origin of the Cloudflare Pages deployment that serves /api/*.
//
// Empty is CORRECT on web: the app is served by the same Pages project that
// hosts the Functions, so a relative /api/* reaches them same-origin.
//
// Empty is BROKEN on native, and silently so. Capacitor loads the bundle from
// `webDir` (capacitor.config.json sets no `server.url`), so the document origin
// is capacitor://localhost on iOS and https://localhost on Android. A relative
// /api/* resolves against THAT — the local bundle, which serves no /api/* — so
// every edge call fails inside the webview: prices, klines, news, gas,
// referrals, telemetry, and the Transak buy session.
//
// Introduced when e99dd422 moved every external call behind /api/*. The Play
// build shipped at the time predates that commit and still called Supabase
// directly, so nothing broke on the store — the failure lands on the NEXT
// native build. Corroborating detail: functions/api/_middleware.js already
// allowlists `capacitor://localhost` and `https://localhost` as CORS origins,
// so native WAS designed to call the edge; only the base URL was never set.
const EDGE_BASE = import.meta.env.VITE_EDGE_BASE || '';

/**
 * Resolve an /api/* path, failing loudly on native when no base is configured
 * rather than emitting a request that can only fail (I4: fail honest).
 *
 * Deliberately a RUNTIME check, not a build-time one: `vite build` produces a
 * single bundle used by both web and native, so only the runtime knows which it
 * is. Web must keep working with an empty base, so this cannot be a blanket
 * assertion at module load.
 */
function edgeUrl(path) {
  if (!EDGE_BASE && Capacitor.isNativePlatform()) {
    throw Object.assign(new Error('EDGE_BASE_UNSET'), { code: 'EDGE_BASE_UNSET' });
  }
  return `${EDGE_BASE}${path}`;
}

function i3Guard() {
  if (DEMO || isDeniabilityOrDemoActive()) {
    throw Object.assign(new Error('I3_DENIABILITY_ACTIVE'), { code: 'I3_DENIABILITY_ACTIVE' });
  }
}

async function post(path, body) {
  const res = await fetch(edgeUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw Object.assign(new Error(data.error || `Edge API ${res.status}`), { status: res.status });
  }
  return res.json();
}

async function get(path) {
  const res = await fetch(edgeUrl(path));
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw Object.assign(new Error(data.error || `Edge API ${res.status}`), { status: res.status });
  }
  return res.json();
}

// ── Buy (Transak) ─────────────────────────────────────────────────────

export async function createBuySession({ asset, network, address, fiatAmount, fiatCurrency }) {
  i3Guard();
  if (!address || typeof address !== 'string') throw new Error('ADDRESS_REQUIRED');
  const res = await post('/api/buy/session', { asset, network, address, fiatAmount, fiatCurrency });
  // Codex P2 2026-08-15: the returned URL is loaded straight into the Buy
  // iframe. Without validation, a backend bug/misroute (or a compromised edge
  // function) that returns { url: "https://attacker.example/..." } would land
  // an arbitrary page inside the Buy flow — in-app phishing surface. Assert
  // the URL is on a Transak origin. Matches the postMessage allowlist in
  // BuyCrypto.jsx and the URL bases in src/lib/buy/transakUrl.js.
  //
  // Branch review 2026-08-15 (C-1): the two hosts were spelled out here as a
  // bare `!==` pair, a third independent copy of the same allowlist. Now shared
  // with lib/buy/transakUrl.js, which also owns the URL bases the backend builds
  // against and the postMessage origins BuyCrypto.jsx checks — one place to edit
  // when a Transak domain changes. isTransakUrl also requires https (S-2).
  if (!isTransakUrl(typeof res?.url === 'string' ? res.url : '')) {
    throw Object.assign(new Error('BUY_URL_UNTRUSTED_ORIGIN'), { code: 'BUY_URL_UNTRUSTED_ORIGIN' });
  }
  return res;
}

// ── Supabase RPCs ─────────────────────────────────────────────────────

export async function rpc(fn, params = {}) {
  i3Guard();
  return post(`/api/rpc/${encodeURIComponent(fn)}`, params);
}

// ── Supabase Edge Functions ───────────────────────────────────────────

export async function edgeFn(fn, body = {}) {
  i3Guard();
  return post(`/api/edge/${encodeURIComponent(fn)}`, body);
}

// ── Market Data ───────────────────────────────────────────────────────
//
// Codex P1 2026-08-15: every /api/data/* helper needs i3Guard() — I3 requires
// ZERO backend calls in decoy/hidden/demo sessions, and a read-only price
// endpoint still leaks network activity that can be observed. Only
// fetchOkxCandles (below) had the guard; prices/klines/coingecko/gas/news did
// not, so a direct import from any UI path (or a mid-session mutate to a decoy
// session with a hot query cache) would still egress. The single UI consumers
// today all pass `enabled: !decoy` to react-query, but the module-level gate
// is the authoritative chokepoint — a UI regression that drops the enabled
// flag must not re-open the egress.

export async function fetchPrices(endpoint, queryParams = {}) {
  i3Guard();
  const qs = new URLSearchParams({ endpoint, ...queryParams });
  return get(`/api/data/prices?${qs}`);
}

export async function fetchKlines(symbol, interval = '1h', limit = 100) {
  i3Guard();
  const qs = new URLSearchParams({ symbol, interval, limit: String(limit) });
  return get(`/api/data/klines?${qs}`);
}

/**
 * OKX spot candles via the edge proxy (functions/api/data/okx-candles.js).
 * Routed through here — not called directly from lib/okx.js — so it gets the
 * i3Guard() explicitly (every /api/data/* helper does; nothing is inherited)
 * and the native-WebView CORS handling every other market data source gets.
 */
export async function fetchOkxCandles(instId, bar = '1H', limit = 100) {
  i3Guard();
  const qs = new URLSearchParams({ instId, bar, limit: String(limit) }).toString();
  return get(`/api/data/okx-candles?${qs}`);
}

export async function fetchCoinGecko(endpoint, queryParams = {}) {
  i3Guard();
  const qs = new URLSearchParams({ endpoint, ...queryParams });
  return get(`/api/data/coingecko?${qs}`);
}

export async function fetchGasFees(mainnet = false) {
  i3Guard();
  const qs = mainnet ? '?mainnet=true' : '';
  return get(`/api/data/gas${qs}`);
}

export async function fetchNews() {
  i3Guard();
  return get('/api/data/news');
}
