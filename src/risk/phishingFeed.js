// src/risk/phishingFeed.js
//
// Live phishing domain feed with local fallback.
//
// Replaces the static LOCAL_KNOWN_BAD list with a remote-updatable feed
// cached in IndexedDB. The local seed (knownBadDapps.js) remains as an
// always-present fallback — if the remote feed is unavailable, the seed
// still provides baseline protection.
//
// Feed URL: configurable via VITE_PHISHING_FEED_URL. Expected format:
// JSON array of { domain, reason, severity? } objects.
//
// Update cadence: once per hour (or on app init if stale). The fetch is
// fire-and-forget — the check function always returns immediately from
// whatever data is available (seed + cached feed).
//
// I2: the only egress is the feed URL fetch. The domain being checked
//     is NEVER sent to the remote. Checking is purely local against a
//     downloaded list.
// I3: suppressed in deniability/demo — no feed fetch, local seed only.
// I4: feed unavailable → local seed. Never "no list means clean".

import { LOCAL_KNOWN_BAD, normalizeDomain } from './knownBadDapps.js';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

const DB_NAME = 'veyrnox-phishing-feed';
const DB_VERSION = 1;
const STORE_NAME = 'domains';
const META_KEY = '__meta__';
const STALE_MS = 60 * 60 * 1000;

/** @type {Map<string, {domain: string, reason: string}>|null} */
let _feedDomains = null;
let _hydrated = false;
/** @type {Promise<void>|null} */
let _hydratePromise = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readCached() {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('feed');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function writeCached(data) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ domains: data, ts: Date.now() }, 'feed');
  } catch { /* write failure is non-fatal */ }
}

function buildMap(entries) {
  const map = new Map();
  for (const e of entries) {
    const d = normalizeDomain(e.domain);
    if (d) map.set(d, e);
  }
  return map;
}

async function hydrateFromCache() {
  if (_hydrated) return;
  const cached = await readCached();
  if (cached?.domains) {
    _feedDomains = buildMap(cached.domains);
  }
  _hydrated = true;
}

/**
 * Ensure the feed is loaded. Call on app init.
 * Safe to call multiple times — deduplicates.
 */
export function initPhishingFeed() {
  if (_hydratePromise) return _hydratePromise;
  _hydratePromise = (async () => {
    await hydrateFromCache();
    if (!isDeniabilityOrDemoActive()) {
      refreshFeed().catch(() => {});
    }
  })();
  return _hydratePromise;
}

async function refreshFeed() {
  const feedUrl = import.meta.env.VITE_PHISHING_FEED_URL;
  if (!feedUrl) return;

  const cached = await readCached();
  if (cached?.ts && Date.now() - cached.ts < STALE_MS) return;

  try {
    const res = await fetch(feedUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return;
    const data = await res.json();
    if (!Array.isArray(data)) return;

    const valid = data.filter(e => typeof e?.domain === 'string' && e.domain.length > 0);
    if (valid.length === 0) return;

    await writeCached(valid);
    _feedDomains = buildMap(valid);
  } catch { /* feed fetch failure is non-fatal — local seed remains */ }
}

// Lazy — knownBadDapps.js also imports checkDomain from this file, so at module
// load LOCAL_KNOWN_BAD is still in its TDZ / undefined when the mutual import
// hits us. Build the map on first checkDomain() call instead.
/** @type {Map<string, {reason: string}>|null} */
let _localMap = null;
function localMap() {
  if (_localMap) return _localMap;
  _localMap = buildMap(LOCAL_KNOWN_BAD || []);
  return _localMap;
}

/**
 * Check a dApp URL/domain against both the live feed AND the local seed.
 * Pure + total: never throws, never makes a network call at check time,
 * and never returns a "safe" verdict.
 *
 * @param {unknown} url
 * @returns {{ domain: string, flagged: boolean, reason: string|null, source: 'feed'|'local'|null }}
 */
export function checkDomain(url) {
  const domain = normalizeDomain(url);
  if (!domain) return { domain: '', flagged: false, reason: null, source: null };

  const labels = domain.split('.');

  // Check feed first (more up-to-date), then local seed.
  /** @type {Array<[Map<string,{reason:string}>|null, 'feed'|'local']>} */
  const sources = [[_feedDomains, 'feed'], [localMap(), 'local']];
  for (const [map, source] of sources) {
    if (!map) continue;

    const exact = map.get(domain);
    if (exact) return { domain, flagged: true, reason: exact.reason, source };

    for (let i = 1; i < labels.length - 1; i++) {
      const suffix = labels.slice(i).join('.');
      const hit = map.get(suffix);
      if (hit) return { domain, flagged: true, reason: hit.reason, source };
    }
  }

  return { domain, flagged: false, reason: null, source: null };
}

/**
 * Force a feed refresh (e.g. from settings).
 */
export async function forceRefreshFeed() {
  if (isDeniabilityOrDemoActive()) return;
  const cached = await readCached();
  if (cached) {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete('feed');
  }
  await refreshFeed();
}

export function getFeedStats() {
  return {
    localCount: LOCAL_KNOWN_BAD.length,
    feedCount: _feedDomains?.size ?? 0,
    totalCount: (LOCAL_KNOWN_BAD.length) + (_feedDomains?.size ?? 0),
    hydrated: _hydrated,
  };
}
