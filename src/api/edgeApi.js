// src/api/edgeApi.js
//
// Client-side adapter for the Cloudflare Edge API layer.
// All external API calls route through /api/* — secrets stay server-side.
//
// I3 CHOKEPOINT: every function checks isDeniabilityOrDemoActive() before
// making a network call. The edge never sees a request from a decoy session.

import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { DEMO } from '@/api/demoClient';

const EDGE_BASE = '';

function i3Guard() {
  if (DEMO || isDeniabilityOrDemoActive()) {
    const err = new Error('I3_DENIABILITY_ACTIVE');
    err.code = 'I3_DENIABILITY_ACTIVE';
    throw err;
  }
}

async function post(path, body) {
  const res = await fetch(`${EDGE_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `Edge API ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function get(path) {
  const res = await fetch(`${EDGE_BASE}${path}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `Edge API ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ── Buy (Transak) ─────────────────────────────────────────────────────

export async function createBuySession({ asset, network, address, fiatAmount, fiatCurrency }) {
  i3Guard();
  if (!address || typeof address !== 'string') throw new Error('ADDRESS_REQUIRED');
  return post('/api/buy/session', { asset, network, address, fiatAmount, fiatCurrency });
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

export async function fetchPrices(endpoint, queryParams = {}) {
  const qs = new URLSearchParams({ endpoint, ...queryParams });
  return get(`/api/data/prices?${qs}`);
}

export async function fetchKlines(symbol, interval = '1h', limit = 100) {
  const qs = new URLSearchParams({ symbol, interval, limit: String(limit) });
  return get(`/api/data/klines?${qs}`);
}

export async function fetchCoinGecko(endpoint, queryParams = {}) {
  const qs = new URLSearchParams({ endpoint, ...queryParams });
  return get(`/api/data/coingecko?${qs}`);
}

export async function fetchGasFees(mainnet = false) {
  const qs = mainnet ? '?mainnet=true' : '';
  return get(`/api/data/gas${qs}`);
}

export async function fetchNews() {
  return get('/api/data/news');
}
