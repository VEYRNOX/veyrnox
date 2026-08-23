// lib/threatIntelStore.js — Local threat intelligence database.
//
// IndexedDB-backed store of known-bad addresses: scam wallets, drainer
// contracts, exploit addresses, mixer services, phishing infrastructure.
//
// OFAC/SDN seed entries ARE bundled (owner override 2026-08-13; see
// docs/OFAC-legal-gate.md "Owner override" section for the decision and
// accepted trade-offs). A build-time snapshot cannot track delistings
// (Tornado Cash was delisted 2025-03-21, Van Loon v. Treasury, 5th Cir.),
// so entries may be STALE until a new build. The 'sanctioned' CATEGORY
// is also produced by live TIP verdicts at runtime — that path remains
// the source of truth; the bundled seed is a low-latency first-pass.
// Queried INSTANTLY on address entry — zero network latency, zero egress.
//
// Two layers:
//   1. SEED — hardcoded addresses shipped with every build (major exploits,
//      known drainers). Always present, never stale-by-omission.
//   2. LEARNED — cached from TIP screening results + user reports. Persisted
//      in IndexedDB so the wallet remembers threats across sessions.
//
// I2: no egress. This store is read-only from the network's perspective.
// I3: suppressed in deniability/demo — lookups return empty (no trace of what
//     address was checked).

import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

const DB_NAME = 'veyrnox-threat-intel';
const DB_VERSION = 1;
const STORE_NAME = 'threats';

// ── SEED DATA ────────────────────────────────────────────────────────────────
// Every entry: { address (lowercase), category, source, note, severity, chain }
// Categories: sanctioned, scam, drainer, exploit, mixer, phishing, malicious_contract
// Severity: critical, high, medium
// Chain: evm (default), btc, sol, multi

export const SEED_THREATS = [
  // ── OFAC-sanctioned (SDN list) — owner override 2026-08-13 ──────────
  // Owner explicitly re-opened the OFAC gate documented in
  // docs/OFAC-legal-gate.md. See that doc's "Owner override" section for
  // the rationale. Entries are best-effort snapshots and may be STALE
  // (e.g. Tornado Cash was delisted 2025-03-21 per Van Loon v. Treasury,
  // 5th Cir.); a delisting will not update in-app until a new build.
  { address: '0x8589427373d6d84e98730d7795d8f6f8731fda16', category: 'ofac_sanctioned', source: 'OFAC SDN List (Aug 2022 snapshot)', note: 'Tornado Cash router', severity: 'critical', chain: 'evm' },
  { address: '0x722122df12d4e14e13ac3b6895a86e84145b6967', category: 'ofac_sanctioned', source: 'OFAC SDN List (Aug 2022 snapshot)', note: 'Tornado Cash proxy', severity: 'critical', chain: 'evm' },
  { address: '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b', category: 'ofac_sanctioned', source: 'OFAC SDN List (Aug 2022 snapshot)', note: 'Tornado Cash 0.1 ETH pool', severity: 'critical', chain: 'evm' },
  { address: '0xa160cdab225685da1d56aa342ad8841c3b53f291', category: 'ofac_sanctioned', source: 'OFAC SDN List (Aug 2022 snapshot)', note: 'Tornado Cash 100 ETH pool', severity: 'critical', chain: 'evm' },
  { address: '0x098b716b8aaf21512996dc57eb0615e2383e2f96', category: 'ofac_sanctioned', source: 'OFAC SDN List (2022 snapshot)', note: 'Lazarus Group (DPRK)', severity: 'critical', chain: 'evm' },
  { address: '0xa7e5d5a720f06526557c513402f2e6b5fa20b008', category: 'ofac_sanctioned', source: 'OFAC SDN List (2022 snapshot)', note: 'Lazarus Group (DPRK)', severity: 'critical', chain: 'evm' },

  // ── Major exploit wallets ────────────────────────────────────────────
  { address: '0xb624c4c930969ca5e24097d39a3e5abb1a7b141f', category: 'exploit', source: 'On-chain forensics', note: 'Nomad Bridge exploit ($190M, Aug 2022)', severity: 'high', chain: 'evm' },
  { address: '0x59abf3837fa962d6853b4cc0a19513aa031fd32b', category: 'exploit', source: 'On-chain forensics', note: 'Wintermute exploit ($160M, Sep 2022)', severity: 'high', chain: 'evm' },
  { address: '0xeec2ef1b5fbe5aa96e2c3844f6613fb3e588c3ed', category: 'exploit', source: 'On-chain forensics', note: 'Mango Markets exploiter', severity: 'high', chain: 'evm' },
  { address: '0x0d043128146654c7683fbf30ac98d7b2285ded00', category: 'exploit', source: 'On-chain forensics', note: 'Euler Finance exploit ($197M, Mar 2023)', severity: 'high', chain: 'evm' },

  // ── Known wallet drainer contracts ───────────────────────────────────
  { address: '0x0000db5c8b030ae20308ac975898e09741e70000', category: 'drainer', source: 'ScamSniffer', note: 'Inferno Drainer deployer', severity: 'critical', chain: 'evm' },
  { address: '0x39fb0dcd13945b835d47a4869a9b7a543e2b9b98', category: 'drainer', source: 'ScamSniffer', note: 'Angel Drainer contract', severity: 'critical', chain: 'evm' },
  { address: '0x429f70d14cfad36d17d942b77eb2e3b1f6ad8839', category: 'drainer', source: 'ScamSniffer', note: 'Pink Drainer deployer', severity: 'critical', chain: 'evm' },
  { address: '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad', category: 'drainer', source: 'Community reports', note: 'Universal Router phishing — approve-all pattern', severity: 'high', chain: 'evm' },

  // ── Known scam wallets (high-profile) ────────────────────────────────
  { address: '0x0d5f493d5d786eeb53c2fe4f6e15fa3e2847ccaf', category: 'scam', source: 'On-chain forensics', note: 'Plus Token Ponzi scheme ($3B, 2019)', severity: 'high', chain: 'evm' },

  // ── Malicious DEX contracts / rug pulls ──────────────────────────────
  { address: '0xcac0f1a06d3f02397cfb6d7077321d73b504916e', category: 'malicious_contract', source: 'Community reports', note: 'Known honeypot token deployer', severity: 'high', chain: 'evm' },
];

// ── In-memory index (instant lookup) ─────────────────────────────────────────
const _index = new Map();
const _learnedIndex = new Map();
let _hydrateStarted = false;

function _buildIndex() {
  if (_index.size > 0) return;
  for (const entry of SEED_THREATS) {
    const key = entry.address.toLowerCase();
    const existing = _index.get(key);
    if (existing) existing.push(entry);
    else _index.set(key, [entry]);
  }
}

function _pushLearned(entry) {
  if (!entry?.address) return;
  const key = String(entry.address).toLowerCase();
  const existing = _learnedIndex.get(key) || [];
  const dup = existing.some((e) =>
    e.category === entry.category
      && e.source === entry.source
      && e.note === entry.note
      && e.severity === entry.severity
      && e.chain === entry.chain,
  );
  if (!dup) _learnedIndex.set(key, [...existing, entry]);
}

function _hydrateLearnedIndex() {
  if (_hydrateStarted) return;
  _hydrateStarted = true;
  openDb()
    .then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    }))
    .then((rows) => {
      for (const row of rows) _pushLearned(row);
    })
    .catch(() => {
      // IndexedDB unavailable — seed-only remains available.
    });
}

// ── IndexedDB for learned threats ────────────────────────────────────────────

/** @type {Promise<IDBDatabase> | null} */
let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'address' });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('severity', 'severity', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        _dbPromise = null;
        reject(req.error);
      };
    } catch (e) {
      _dbPromise = null;
      reject(e);
    }
  });
  return _dbPromise;
}

/**
 * Close the cached IndexedDB connection and drop the handle, so a subsequent
 * indexedDB.deleteDatabase() is not left permanently BLOCKED behind it.
 *
 * Without this, panic wipe cannot delete this database: the module-level
 * `_dbPromise` above is never closed, a delete request against a live connection
 * fires `onblocked` and stays PENDING, and a pending delete then blocks every
 * later open() on the database for the rest of the session. Callers that need
 * the store again simply call it — the next lookup reopens lazily via openDb().
 *
 * @returns {Promise<void>}
 */
export async function closeThreatIntelDb() {
  const pending = _dbPromise;
  _dbPromise = null;
  if (!pending) return;
  try {
    const db = await pending;
    db.close();
  } catch {
    // Never opened successfully — nothing to close.
  }
}

/**
 * Look up an address in the local threat intel store.
 * Returns matches from BOTH the seed list AND learned (IndexedDB) threats.
 * Returns [] if not found or in deniability mode.
 *
 * @param {string} address
 * @returns {Promise<Array<{address:string, category:string, source:string, note:string, severity:string, chain:string}>>}
 */
export async function lookupThreat(address) {
  if (isDeniabilityOrDemoActive()) return [];
  if (!address || typeof address !== 'string') return [];

  const key = address.toLowerCase();
  _buildIndex();

  const seedHits = _index.get(key) || [];
  let dbHits = _learnedIndex.get(key) || [];

  try {
    const db = /** @type {IDBDatabase} */ (await openDb());
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const result = await new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (result) {
      _pushLearned(result);
      dbHits = _learnedIndex.get(key) || [result];
    }
  } catch {
    // IndexedDB unavailable — seed-only is still useful.
  }

  return [...seedHits, ...dbHits];
}

/**
 * Synchronous seed-only lookup. For the fastest possible check on keystroke.
 * @param {string} address
 * @returns {Array}
 */
export function lookupThreatSync(address) {
  if (isDeniabilityOrDemoActive()) return [];
  if (!address || typeof address !== 'string') return [];
  _buildIndex();
  _hydrateLearnedIndex();
  const key = address.toLowerCase();
  return [...(_index.get(key) || []), ...(_learnedIndex.get(key) || [])];
}

/**
 * Learn a new threat from TIP results or user reports. Persists to IndexedDB.
 * @param {{ address: string, category: string, source: string, note: string, severity: string, chain?: string }} entry
 */
export async function learnThreat(entry) {
  if (isDeniabilityOrDemoActive()) return;
  if (!entry?.address) return;

  const record = {
    address: entry.address.toLowerCase(),
    category: entry.category || 'unknown',
    source: entry.source || 'TIP',
    note: entry.note || '',
    severity: entry.severity || 'medium',
    chain: entry.chain || 'evm',
    learnedAt: Date.now(),
  };

  try {
    const db = /** @type {IDBDatabase} */ (await openDb());
    // Await COMMIT, not just the put() call. The function is async and callers
    // await it, so returning while the transaction is still open made the write
    // fire-and-forget: a read issued straight afterwards could miss the row, and
    // a reload racing the commit could lose it entirely.
    /** @type {Promise<void>} */
    const committed = new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    await committed;
    _pushLearned(record);
  } catch {
    // Best-effort persistence.
  }
}

/**
 * Cache a TIP screening result into the local store.
 *
 * SANCTIONS ARE NEVER CACHED. A sanctions listing is a live legal fact and the
 * only sanctioned-screening path this app permits is the TIP RUNTIME API (see
 * docs/OFAC-legal-gate.md — a bundled or cached verdict cannot track a
 * DELISTING, e.g. Tornado Cash on 2025-03-21, and a stale "sanctioned" flag is
 * a false accusation). So a sanctions hit is re-fetched from TIP on every
 * screen and never written to disk; only non-sanctions signals are cached.
 *
 * @param {string} address
 * @param {{ verdict: string, sanctions: boolean, signals: Array }} tipResult
 */
export async function cacheTipResult(address, tipResult) {
  if (!tipResult || tipResult.verdict === 'allow') return;
  if (!address) return;
  // Sanctions verdicts stay runtime-only — see the note above.
  if (tipResult.sanctions === true) return;

  const severity = tipResult.verdict === 'block' ? 'critical' : 'high';

  // No 'sanctioned' branch: sanctions returned above, so it cannot reach here.
  const category = tipResult.signals?.[0]?.signal_type?.includes('scam') ? 'scam'
    : tipResult.signals?.[0]?.signal_type?.includes('drain') ? 'drainer'
    : 'malicious_contract';

  const note = tipResult.signals?.[0]
    ? `${tipResult.signals[0].signal_type} (${tipResult.signals[0].source}, ${Math.round((tipResult.signals[0].confidence || 0) * 100)}% confidence)`
    : `TIP verdict: ${tipResult.verdict}`;

  await learnThreat({ address, category, source: 'Veyrnox TIP', note, severity });
}

/**
 * Build a suspicious.js-compatible provider backed by this store.
 * Synchronous (seed-only) for instant screening.
 */
export function makeThreatIntelProvider() {
  _buildIndex();
  return {
    name: 'threat-intel-store',
    families: ['evm'],
    screen(normAddr) {
      return lookupThreatSync(normAddr);
    },
  };
}
