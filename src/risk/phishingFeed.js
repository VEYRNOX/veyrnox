// src/risk/phishingFeed.js
//
// Live phishing-domain feed, layered over the local seed in knownBadDapps.js.
//
// The seed list is small and cannot stay delisting-current; this module
// downloads a larger list, caches it in IndexedDB, and registers a lookup with
// knownBadDapps via setFeedLookup(). The seed is NEVER replaced — it remains
// the always-present floor, so a missing, empty or failed feed degrades to
// exactly the pre-feed behaviour rather than to "no list".
//
// Dependency direction is one-way (this file → knownBadDapps) so the two cannot
// form an import cycle and knownBadDapps stays free of network code.
//
// Feed URL: VITE_PHISHING_FEED_URL. Must be https. Expected payload: a JSON
// array of { domain, reason } objects; anything else in the array is dropped.
//
// I2: the only egress is the feed download. The domain being checked is NEVER
//     sent anywhere — matching happens locally against the downloaded list.
// I3: no fetch and no feed matches in deniability/demo, so a decoy session
//     cannot read what a real one downloaded. The local seed still runs, so
//     screening never goes dark — it falls back to what ships with the app.
// I4: feed unavailable → local seed. Never "no list means clean". A payload we
//     cannot validate is discarded rather than trusted.

import { LOCAL_KNOWN_BAD, normalizeDomain, setFeedLookup } from './knownBadDapps.js';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

const DB_NAME = 'veyrnox-phishing-feed';
const DB_VERSION = 1;
const STORE_NAME = 'domains';
const STALE_MS = 60 * 60 * 1000;

// A feed entry's `reason` is rendered verbatim inside the WalletConnect
// approval warning, so it is attacker-influenced copy in our own security
// dialog if the feed host is ever compromised. Cap it, strip control
// characters, and fall back to house copy rather than rendering junk.
const MAX_REASON_LEN = 120;
const DEFAULT_REASON = 'Listed on the phishing-domain feed';

// A feed older than this is treated as ABSENT rather than silently trusted:
// "we last heard something 4 months ago" must not look like "we checked".
const MAX_FEED_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** @type {Map<string, string>|null} domain → reason */
let _feedDomains = null;
let _feedTs = 0;
let _hydrated = false;
/** @type {Promise<void>|null} */
let _initPromise = null;

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
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get('feed');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function writeCached(domains, ts) {
  try {
    const db = await openDb();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ domains, ts }, 'feed');
      // Await COMMIT, not just the put() call — a forceRefresh issued straight
      // afterwards must not race an open transaction.
      tx.oncomplete = () => resolve(undefined);
      tx.onerror = () => resolve(undefined);
      tx.onabort = () => resolve(undefined);
    });
  } catch { /* cache write failure is non-fatal — the in-memory map still works */ }
}

async function deleteCached() {
  try {
    const db = await openDb();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete('feed');
      tx.oncomplete = () => resolve(undefined);
      tx.onerror = () => resolve(undefined);
      tx.onabort = () => resolve(undefined);
    });
  } catch { /* non-fatal */ }
}

/**
 * Validate + normalize one raw feed entry. Only `domain` and `reason` are read;
 * everything else in the object is discarded rather than carried into the UI.
 * @param {unknown} raw
 * @returns {[string, string]|null} [domain, reason]
 */
export function sanitizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const e = /** @type {{domain?: unknown, reason?: unknown}} */ (raw);
  if (typeof e.domain !== 'string') return null;
  const domain = normalizeDomain(e.domain);
  // Require at least one dot: a bare label ("com", "app") would suffix-match a
  // huge slice of the web through the parent-domain walk.
  if (!domain || !domain.includes('.')) return null;

  let reason = typeof e.reason === 'string' ? e.reason : '';
  // Collapse control characters (incl. newlines) to spaces so a feed cannot
  // inject line breaks or terminal escapes into the warning dialog.
  reason = reason.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
  return [domain, reason.slice(0, MAX_REASON_LEN) || DEFAULT_REASON];
}

/**
 * @param {unknown} entries
 * @returns {Map<string, string>} domain → reason
 */
function buildMap(entries) {
  const map = new Map();
  if (!Array.isArray(entries)) return map;
  for (const raw of entries) {
    const pair = sanitizeEntry(raw);
    if (pair) map.set(pair[0], pair[1]);
  }
  return map;
}

/**
 * The lookup handed to knownBadDapps. Takes an already-normalized domain.
 * @param {string} domain
 * @returns {string|null}
 */
function feedLookup(domain) {
  // Checked HERE, not only at publish time: a session can flip to decoy after
  // the feed was registered, and this is the one point every lookup passes
  // through. Mirrors threatIntelStore.lookupThreatSync, which likewise returns
  // nothing in deniability — DOWNLOADED threat data is suppressed in a decoy
  // session; the in-bundle seed list keeps working.
  if (isDeniabilityOrDemoActive()) return null;
  if (!_feedDomains) return null;
  return _feedDomains.get(domain) ?? null;
}

/** Publish the current map to knownBadDapps, or withdraw it if unusable. */
function publish() {
  const usable =
    !!_feedDomains &&
    _feedDomains.size > 0 &&
    Date.now() - _feedTs < MAX_FEED_AGE_MS &&
    !isDeniabilityOrDemoActive();
  setFeedLookup(usable ? feedLookup : null);
}

/**
 * Drop the loaded feed and withdraw it from knownBadDapps. Used by panic wipe,
 * so a post-wipe lookup cannot answer from RAM after the database is gone.
 */
export function resetPhishingFeed() {
  _feedDomains = null;
  _feedTs = 0;
  _hydrated = false;
  _initPromise = null;
  setFeedLookup(null);
}

/**
 * Read VITE_PHISHING_FEED_URL and reject anything that is not a plain https
 * URL. Exported for tests.
 * @returns {string|null}
 */
export function resolveFeedUrl() {
  const raw = import.meta.env.VITE_PHISHING_FEED_URL;
  if (!raw || typeof raw !== 'string') return null;
  try {
    const u = new URL(raw);
    // https only: the feed drives what we tell the user is a phishing site, so
    // it must not be modifiable in transit.
    if (u.protocol !== 'https:') return null;
    // No credentials in the URL, and no localhost/IP-literal hosts — the feed
    // is a public list, not something a local process should be able to serve.
    if (u.username || u.password) return null;
    if (/^(localhost|\[|\d+\.\d+\.\d+\.\d+$)/i.test(u.hostname)) return null;
    return u.toString();
  } catch { return null; }
}

async function refreshFeed({ force = false } = {}) {
  if (isDeniabilityOrDemoActive()) return;
  const feedUrl = resolveFeedUrl();
  if (!feedUrl) return;

  if (!force) {
    const cached = await readCached();
    if (cached?.ts && Date.now() - cached.ts < STALE_MS) return;
  }

  try {
    const res = await fetch(feedUrl, {
      signal: AbortSignal.timeout(10_000),
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!Array.isArray(data)) return;

    const map = buildMap(data);
    // An empty or wholly-invalid payload is treated as a failed refresh, not as
    // "the list is now empty" — otherwise a compromised feed could silently
    // disable feed coverage by serving [].
    if (map.size === 0) return;

    const ts = Date.now();
    _feedDomains = map;
    _feedTs = ts;
    publish();
    await writeCached([...map].map(([domain, reason]) => ({ domain, reason })), ts);
  } catch { /* fetch/parse failure is non-fatal — the local seed remains */ }
}

async function hydrateFromCache() {
  if (_hydrated) return;
  _hydrated = true;
  const cached = await readCached();
  if (cached?.domains) {
    _feedDomains = buildMap(cached.domains);
    _feedTs = typeof cached.ts === 'number' ? cached.ts : 0;
    publish();
  }
}

/**
 * Load the cached feed and register it, then refresh in the background.
 * Idempotent — safe to call on every app init.
 * @returns {Promise<void>}
 */
export function initPhishingFeed() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    if (isDeniabilityOrDemoActive()) return;
    await hydrateFromCache();
    await refreshFeed().catch(() => {});
  })();
  return _initPromise;
}

/** Force a refresh regardless of cache age (e.g. from Settings). */
export async function forceRefreshFeed() {
  if (isDeniabilityOrDemoActive()) return;
  await deleteCached();
  await refreshFeed({ force: true });
}

/**
 * Coverage counts for display. `totalCount` is the size of the UNION, not the
 * sum: the feed and the seed overlap, and adding them would overstate coverage.
 */
export function getFeedStats() {
  const union = new Set(
    LOCAL_KNOWN_BAD.map((e) => normalizeDomain(e.domain)).filter(Boolean),
  );
  if (_feedDomains) for (const d of _feedDomains.keys()) union.add(d);
  return {
    localCount: LOCAL_KNOWN_BAD.length,
    feedCount: _feedDomains?.size ?? 0,
    totalCount: union.size,
    hydrated: _hydrated,
    // Age is surfaced deliberately: a months-old feed must not present
    // identically to one refreshed an hour ago.
    updatedAt: _feedTs || null,
    stale: !_feedTs || Date.now() - _feedTs >= MAX_FEED_AGE_MS,
  };
}
