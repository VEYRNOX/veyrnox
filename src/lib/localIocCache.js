// @ts-nocheck
// Local IOC cache — signed manifest sync from TIP.
//
// ─── PURPOSE ───────────────────────────────────────────────────────────────
//
// The wallet previously called TIP over the network for every screening
// verdict. That broke three things:
//   1. Deniability mode (I3: zero backend calls) → Advisor screening was
//      entirely blind for any decoy/duress session.
//   2. Offline → no screening at all.
//   3. Query patterns → every asked-about address landed in TIP's logs.
//
// This module downloads a signed manifest of all IOCs from
// `${TIP_BASE_URL}/api/v1/manifest`, verifies the Ed25519 signature, and
// caches the result in IndexedDB. Subsequent screen lookups check the local
// cache first. Deniability sessions read from cache only — never fetch —
// so I3 stays intact while gaining real screening capability.
//
// ─── HONEST POSTURE ────────────────────────────────────────────────────────
//
// - Signature verification failure → we throw away the response. NEVER trust
//   an unsigned manifest, even from our own server. "Fake authenticity we
//   can't prove" is worse than "no cache".
// - Empty local cache → screening falls through to the network path
//   (unchanged), OR returns null in deniability mode (unchanged from today).
// - Cache is per-installation. No sync between wallets.
// - Cache age > TTL (24h) → still usable, but marked stale. We refresh on
//   next non-deniability unlock.

import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession.js';

const DB_NAME = 'veyrnox-ioc-cache';
const DB_VERSION = 1;
const STORE_NAME = 'manifest';
const MANIFEST_KEY = 'v1';

// Ed25519 public key that signed the manifest, DER-wrapped SPKI, base64.
// Generated 2026-08-08 alongside the /api/v1/manifest endpoint.
// If this ever needs to change, ALL wallets need an update + a coordinated
// server-side switch — the old public key will refuse to verify a new
// signature. Not a routine rotation; treat as a versioned migration.
const IOC_MANIFEST_PUBLIC_KEY_B64 =
  'MCowBQYDK2VwAyEALgWYjSGQY+WULES5PtMn/U04jfqPOCPiELl5er6f8CQ=';

const IOC_MANIFEST_PUBLIC_KEY_ID = 'veyrnox-ioc-v1';

// How often to refresh from the network, when it's OK to fetch (not in
// deniability mode, not offline). Matches the server's ttl_seconds.
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Hard cap on the manifest body we will parse, verify and store.
//
// HONEST SCOPE: this bounds what we PARSE and PERSIST, not what we download —
// the body is already buffered by the time we can measure it. A streaming cap
// would need a reader loop; this is the cheap 90% that stops an oversized or
// hostile manifest from being expanded into a Map and written to IndexedDB.
// 8 MiB is ~25x the current manifest (roughly 35k entries) so it is not a
// ceiling anyone will hit by adding feeds.
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;

// ─── IndexedDB helpers ─────────────────────────────────────────────────────
// Tiny promise wrapper — no idb library dep. Only stores the one manifest
// row, so complexity is minimal.

/**
 * @param {{createIfMissing?: boolean}} [opts]
 *   `createIfMissing: false` opens the database ONLY if it already exists.
 */
function openDb({ createIfMissing = true } = {}) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!createIfMissing) {
        // I3 (audit 2026-08-09): `indexedDB.open()` CREATES the database when it
        // is absent, so a plain read brought `veyrnox-ioc-cache` into existence.
        // `screenTransaction` hydrates before its deniability early-return, which
        // meant a decoy/duress/demo session wrote a new store to disk — and could
        // recreate it after a panic wipe had erased it. The DB's presence is a
        // tell (see panic.js: it is wiped for exactly that reason), and a session
        // that is supposed to leave no trace must not mint one by reading.
        //
        // `onupgradeneeded` firing means version 0 → the database did not exist.
        // Aborting the versionchange transaction rolls the creation back per
        // spec, so nothing is left behind; the open then fails and the caller
        // treats it as an empty cache, which is the honest answer.
        try { req.transaction.abort(); } catch { /* the open still fails below */ }
        return;
      }
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IOC cache open blocked'));
  });
}

async function idbGet(key) {
  let db;
  try {
    // Read-only: never create the store. See openDb's I3 note.
    db = await openDb({ createIfMissing: false });
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  } finally {
    if (db) try { db.close(); } catch { /* noop */ }
  }
}

async function idbPut(key, value) {
  let db;
  try {
    db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Best-effort — a failing IDB write should not crash the wallet. Next
    // refresh will retry; meanwhile the in-memory lookup still works.
  } finally {
    if (db) try { db.close(); } catch { /* noop */ }
  }
}

// ─── Ed25519 verification (Web Crypto) ──────────────────────────────────────

async function importPublicKey() {
  const rawKey = Uint8Array.from(atob(IOC_MANIFEST_PUBLIC_KEY_B64), (c) =>
    c.charCodeAt(0)
  );
  return crypto.subtle.importKey('spki', rawKey, { name: 'Ed25519' }, false, [
    'verify',
  ]);
}

async function verifySignature(payloadCanonicalBytes, signatureB64) {
  if (!signatureB64) return false;
  try {
    const key = await importPublicKey();
    const sig = Uint8Array.from(atob(signatureB64), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify(
      { name: 'Ed25519' },
      key,
      sig,
      payloadCanonicalBytes
    );
  } catch {
    return false;
  }
}

// Byte-for-byte identical to the server's canonicalStringify: sorted keys,
// no whitespace. Any drift here silently breaks signature verification.
function canonicalStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) {
    return '[' + v.map(canonicalStringify).join(',') + ']';
  }
  const keys = Object.keys(v).sort();
  const inner = keys
    .map((k) => JSON.stringify(k) + ':' + canonicalStringify(v[k]))
    .join(',');
  return '{' + inner + '}';
}

// ─── In-memory index ───────────────────────────────────────────────────────
// After a manifest loads (from network or IDB), we keep a Map<addr, entry>
// in memory so lookups are O(1) rather than O(n). The map is re-hydrated
// on demand — first lookup after startup will hit IDB, subsequent are
// in-memory only.

let _memoryIndex = null;      // Map<lowercased addr, ManifestEntry>
let _memoryMeta = null;       // { generated_at, ttl_seconds, counts }

function buildIndex(payload) {
  const m = new Map();
  for (const entry of payload.entries) {
    m.set(entry.addr.toLowerCase(), entry);
  }
  _memoryIndex = m;
  _memoryMeta = {
    generated_at: payload.generated_at,
    ttl_seconds: payload.ttl_seconds,
    counts: payload.counts,
  };
}

// ─── Load / refresh flow ───────────────────────────────────────────────────

/**
 * Load whatever is in IndexedDB into the in-memory index, WITHOUT network.
 * Safe to call in deniability mode — reads only. Returns whether a manifest
 * was successfully loaded.
 */
export async function hydrateFromCache() {
  if (_memoryIndex !== null) return true;
  const stored = await idbGet(MANIFEST_KEY);
  if (!stored || !stored.payload || !stored.signature) return false;

  // Re-verify signature on hydrate — the IDB row was signed at write time,
  // but re-verify defends against on-disk tampering.
  const bytes = new TextEncoder().encode(canonicalStringify(stored.payload));
  const ok = await verifySignature(bytes, stored.signature);
  if (!ok) return false;

  buildIndex(stored.payload);
  return true;
}

/**
 * Fetch the manifest from TIP, verify the signature, cache it.
 * Rejects if the signature is missing/invalid (I4: never trust unsigned).
 *
 * @param {string} tipBaseUrl - e.g. https://tip.veyrnox.com
 */
export async function refreshManifest(tipBaseUrl) {
  // I3 CHOKEPOINT (audit 2026-08-09). This is the module's ONLY egress, so the
  // gate belongs here — not at the caller.
  //
  // It previously lived solely in WalletProvider's unlock effect, which checked
  // `decoyRef || hiddenRef` (== isDeniabilitySessionActive) and therefore MISSED
  // demo sessions: a persisted `veyrnox-demo=1` survives reloads silently, so a
  // device left in demo fired a live fetch on every unlock. `lib/consent.js`
  // (PR #1410) and `btc/provider.js` both learned the same lesson — a gate at
  // the call sites is a gate the next caller forgets. Use the OR-demo predicate,
  // which fails closed if either read throws.
  if (isDeniabilityOrDemoActive()) {
    throw new Error('I3: no manifest fetch in a deniability or demo session');
  }

  const url = `${String(tipBaseUrl).replace(/\/$/, '')}/api/v1/manifest`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) {
    throw new Error(`manifest fetch failed: HTTP ${resp.status}`);
  }

  // Cap before parse — see MAX_MANIFEST_BYTES.
  const raw = await resp.text();
  if (raw.length > MAX_MANIFEST_BYTES) {
    throw new Error('manifest too large — refusing to parse');
  }
  const body = JSON.parse(raw);

  if (!body || typeof body !== 'object') throw new Error('malformed manifest');
  if (body.public_key_id !== IOC_MANIFEST_PUBLIC_KEY_ID) {
    // A key rotation would trip this — refuse rather than silently accepting
    // a manifest signed by an unknown key.
    throw new Error(
      `manifest public_key_id mismatch: got ${body.public_key_id}, expected ${IOC_MANIFEST_PUBLIC_KEY_ID}`
    );
  }
  if (!body.signature) {
    throw new Error('manifest is unsigned — refusing to trust');
  }

  const bytes = new TextEncoder().encode(canonicalStringify(body.payload));
  const ok = await verifySignature(bytes, body.signature);
  if (!ok) {
    throw new Error('manifest signature verification failed');
  }

  // ROLLBACK / REPLAY (audit 2026-08-09). A valid signature proves the manifest
  // is OURS. It does NOT prove it is CURRENT — every manifest we ever published
  // stays validly signed forever, so anyone able to serve a stale-but-authentic
  // response (network position, an intermediary cache, a captive network) could
  // roll screening back to before a given address was listed, and every check
  // above would still pass.
  //
  // Refuse to move backwards. Impact is bounded in normal mode, where a local
  // miss still falls through to the live TIP call — but in deniability and
  // offline the cache is the ONLY path (tipScreen.js returns null rather than
  // reaching the network), so a rollback there is a silent, total screening
  // blind spot in exactly the coercion case this cache was added to serve.
  //
  // Equal timestamps are accepted: re-fetching the same manifest is a harmless
  // no-op refresh, and rejecting it would break the TTL path. Only STRICTLY
  // older is refused. An unparseable/absent incoming date is refused too — we
  // cannot show it is not a rollback, so we fail closed (I4).
  const stored = await idbGet(MANIFEST_KEY);
  const incomingAt = Date.parse(body.payload?.generated_at ?? '');
  const storedAt = Date.parse(stored?.payload?.generated_at ?? '');
  if (Number.isNaN(incomingAt)) {
    throw new Error('manifest has no usable generated_at — refusing to trust');
  }
  if (!Number.isNaN(storedAt) && incomingAt < storedAt) {
    throw new Error('manifest is older than the cached one — refusing rollback');
  }

  buildIndex(body.payload);
  await idbPut(MANIFEST_KEY, {
    payload: body.payload,
    signature: body.signature,
    fetched_at: new Date().toISOString(),
  });
}

/**
 * Best-effort refresh — swallows errors so a bad refresh doesn't crash
 * whatever code is calling this on unlock. Returns whether it succeeded.
 */
export async function refreshManifestIfDue(tipBaseUrl) {
  try {
    const stored = await idbGet(MANIFEST_KEY);
    if (stored && stored.fetched_at) {
      const age = Date.now() - new Date(stored.fetched_at).getTime();
      if (age < REFRESH_INTERVAL_MS) {
        // Already fresh — hydrate but don't hit the network.
        await hydrateFromCache();
        return true;
      }
    }
    await refreshManifest(tipBaseUrl);
    return true;
  } catch (err) {
    if (import.meta.env.DEV) console.error('[IOC cache] refresh failed:', err);
    // Fall back to whatever is already in memory + IDB.
    await hydrateFromCache();
    return false;
  }
}

/**
 * Synchronous local lookup. Returns the ManifestEntry if the address is in
 * cache, or null if not present / cache empty. Callers must call
 * `hydrateFromCache()` or `refreshManifestIfDue()` first to populate the
 * in-memory index.
 *
 * @param {string} address - Case-insensitive; lowercased internally.
 * @returns {{addr: string, cat: string, src: string, reason?: string} | null}
 */
export function lookupLocal(address) {
  if (_memoryIndex === null) return null;
  // A non-string `address` used to throw out of here, past tryLocalScreen's
  // try (which wraps only hydrateFromCache) and out of screenTransaction.
  // A screening helper must never be the thing that breaks the send flow.
  if (typeof address !== 'string' || !address) return null;
  return _memoryIndex.get(address.toLowerCase()) ?? null;
}

/**
 * Metadata about the currently-loaded manifest for status displays.
 */
export function getCacheMeta() {
  return _memoryMeta;
}

/**
 * Clear both in-memory and IndexedDB copies. Called by panic-wipe /
 * settings-clear paths to leave no residue.
 */
export async function clearLocalIocCache() {
  _memoryIndex = null;
  _memoryMeta = null;
  let db;
  try {
    // A clear must never CREATE the store it is clearing. Panic-wipe calls this
    // first and then deletes the database outright (panic.js), so an absent DB
    // is already the desired end state — opening one here would undo the wipe.
    db = await openDb({ createIfMissing: false });
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(MANIFEST_KEY);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch {
    // Best-effort
  } finally {
    if (db) try { db.close(); } catch { /* noop */ }
  }
}
