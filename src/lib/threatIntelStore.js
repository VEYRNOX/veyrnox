// lib/threatIntelStore.js — Local threat intelligence database.
//
// IndexedDB-backed store of known-bad addresses: OFAC sanctions, scam wallets,
// drainer contracts, exploit addresses, mixer services, phishing infrastructure.
// Queried INSTANTLY on address entry — zero network latency, zero egress.
//
// Two layers:
//   1. SEED — hardcoded addresses shipped with every build (OFAC SDN, major
//      exploits, known drainers). Always present, never stale-by-omission.
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
  // ── OFAC SDN — Tornado Cash ──────────────────────────────────────────
  { address: '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b', category: 'sanctioned', source: 'OFAC SDN', note: 'Tornado Cash deposit contract', severity: 'critical', chain: 'evm' },
  { address: '0xd4e8a7c32bdd20741bfa5206fe8a0ecad53e6af9', category: 'sanctioned', source: 'OFAC SDN', note: 'Tornado Cash router', severity: 'critical', chain: 'evm' },
  { address: '0x12d66f87a04a9e220743712ce6d9bb1b5616b8fc', category: 'sanctioned', source: 'OFAC SDN', note: 'Tornado Cash 0.1 ETH pool', severity: 'critical', chain: 'evm' },
  { address: '0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936', category: 'sanctioned', source: 'OFAC SDN', note: 'Tornado Cash 1 ETH pool', severity: 'critical', chain: 'evm' },
  { address: '0x910cbd523d972eb0a6f4cae4618ad62622b39dbf', category: 'sanctioned', source: 'OFAC SDN', note: 'Tornado Cash 10 ETH pool', severity: 'critical', chain: 'evm' },
  { address: '0xa160cdab225685da1d56aa342ad8841c3b53f291', category: 'sanctioned', source: 'OFAC SDN', note: 'Tornado Cash 100 ETH pool', severity: 'critical', chain: 'evm' },
  { address: '0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144', category: 'sanctioned', source: 'OFAC SDN', note: 'Tornado Cash 100 DAI pool', severity: 'critical', chain: 'evm' },
  { address: '0x07687e702b410fa43f4cb4af7fa097918ffd2730', category: 'sanctioned', source: 'OFAC SDN', note: 'Tornado Cash 1000 DAI pool', severity: 'critical', chain: 'evm' },
  { address: '0x23773e65ed146a459791799d01336db287f25334', category: 'sanctioned', source: 'OFAC SDN', note: 'Tornado Cash 10000 DAI pool', severity: 'critical', chain: 'evm' },
  { address: '0x22aaa7720ddd5388a3c0a3333430953c68f1849b', category: 'sanctioned', source: 'OFAC SDN', note: 'Tornado Cash 5000 USDC pool', severity: 'critical', chain: 'evm' },
  { address: '0xba214c1c1928a32bffe790263e38b4af9bfcd659', category: 'sanctioned', source: 'OFAC SDN', note: 'Tornado Cash 50000 USDC pool', severity: 'critical', chain: 'evm' },
  { address: '0xb1c8094b234dce6e03f10a5b673c1d8c69739a00', category: 'sanctioned', source: 'OFAC SDN', note: 'Tornado Cash 500 USDT pool', severity: 'critical', chain: 'evm' },
  { address: '0x527653ea119f3e6a1f5bd18fbf4714081d7b31ce', category: 'sanctioned', source: 'OFAC SDN', note: 'Tornado Cash 5000 USDT pool', severity: 'critical', chain: 'evm' },
  { address: '0x58e8dcc13be9780fc42e8723d8ead4cf46943df2', category: 'sanctioned', source: 'OFAC SDN', note: 'Tornado Cash relayer registry', severity: 'critical', chain: 'evm' },
  { address: '0x722122df12d4e14e13ac3b6895a86e84145b6967', category: 'sanctioned', source: 'OFAC SDN', note: 'Tornado Cash governance', severity: 'critical', chain: 'evm' },
  { address: '0xdd4c48c0b24039969fc16d1cdf626eab821d3384', category: 'sanctioned', source: 'OFAC SDN', note: 'Tornado Cash mining contract', severity: 'critical', chain: 'evm' },
  { address: '0xd0975b32cea532eadddfc9c60481976e39db3472', category: 'sanctioned', source: 'OFAC SDN', note: 'Tornado Cash withdrawal proxy', severity: 'critical', chain: 'evm' },

  // ── OFAC SDN — Lazarus Group / DPRK ──────────────────────────────────
  { address: '0x098b716b8aaf21512996dc57eb0615e2383e2f96', category: 'sanctioned', source: 'OFAC SDN', note: 'Lazarus Group — Ronin Bridge exploit ($625M)', severity: 'critical', chain: 'evm' },
  { address: '0xa0e1c89ef1a489c9c7de96311ed5ce5d32c20e4b', category: 'sanctioned', source: 'OFAC SDN', note: 'Lazarus Group — Ronin Bridge exploit', severity: 'critical', chain: 'evm' },
  { address: '0x3cffd56b47b7b41c56258d9c7731abadc360e460', category: 'sanctioned', source: 'OFAC SDN', note: 'Lazarus Group — Ronin Bridge exploit', severity: 'critical', chain: 'evm' },
  { address: '0x53b6936513e738f44fb50d2b9476730c0ab3bfc1', category: 'sanctioned', source: 'OFAC SDN', note: 'Lazarus Group — Harmony Horizon Bridge exploit ($100M)', severity: 'critical', chain: 'evm' },
  { address: '0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936', category: 'sanctioned', source: 'OFAC SDN', note: 'Lazarus Group — linked to Atomic Wallet exploit', severity: 'critical', chain: 'evm' },

  // ── OFAC SDN — Sanctioned exchanges ──────────────────────────────────
  { address: '0x6f1ca141a28907f78ebaa64f83b168e76f32b6ba', category: 'sanctioned', source: 'OFAC SDN', note: 'Garantex exchange (Russian, sanctioned 2022-04)', severity: 'critical', chain: 'evm' },
  { address: '0x8589427373d6d84e98730d7795d8f6f8731fda16', category: 'sanctioned', source: 'OFAC SDN', note: 'Chatex exchange (sanctioned 2021-11)', severity: 'critical', chain: 'evm' },

  // ── OFAC SDN — Blender.io ────────────────────────────────────────────
  { address: '0x57e767405b65d2d05afdca5fb1eaa67d4c84dc45', category: 'sanctioned', source: 'OFAC SDN', note: 'Blender.io mixer (sanctioned 2022-05)', severity: 'critical', chain: 'evm' },

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

function _buildIndex() {
  if (_index.size > 0) return;
  for (const entry of SEED_THREATS) {
    const key = entry.address.toLowerCase();
    const existing = _index.get(key);
    if (existing) existing.push(entry);
    else _index.set(key, [entry]);
  }
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
  let dbHits = [];

  try {
    const db = /** @type {IDBDatabase} */ (await openDb());
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const result = await new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (result) dbHits = [result];
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
  return _index.get(address.toLowerCase()) || [];
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
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
  } catch {
    // Best-effort persistence.
  }
}

/**
 * Cache TIP screening results into the local threat intel store.
 * Called after a successful TIP screen so future lookups of the same
 * address are instant.
 *
 * @param {string} address
 * @param {{ verdict: string, sanctions: boolean, signals: Array }} tipResult
 */
export async function cacheTipResult(address, tipResult) {
  if (!tipResult || tipResult.verdict === 'allow') return;
  if (!address) return;

  const severity = tipResult.verdict === 'block' ? 'critical'
    : tipResult.sanctions ? 'critical' : 'high';

  const category = tipResult.sanctions ? 'sanctioned'
    : tipResult.signals?.[0]?.signal_type?.includes('scam') ? 'scam'
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
