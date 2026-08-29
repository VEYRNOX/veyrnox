// @ts-nocheck
// src/api/localClient.js
//
// LOCAL-FIRST DATA LAYER — the default backend for the wallet app build.
//
// This is the persistent sibling of demoClient.js. It exposes the EXACT same
// surface as the base44 SDK (`entities.<Name>.list/filter/get/create/update/
// delete`, `auth.*`, `functions.*`, `integrations.Core.*`) so the ~89 modules
// that import `{ base44 }` need no changes — the swap happens entirely behind
// src/api/base44Client.js.
//
// WHAT'S DIFFERENT FROM demoClient:
//   - demoClient holds seeded rows in an in-memory object: great for a tour,
//     but everything resets on reload and nothing the user does survives.
//   - localClient persists every entity row to on-device IndexedDB, so the
//     app's data (wallets list, tx history, watchlists, approvals, address
//     book, …) survives reloads and app restarts. It starts EMPTY — a fresh
//     install has no records — which is the honest state for a real wallet
//     (no fabricated balances/history). Pages render their normal empty
//     states until the user/app creates data.
//
// SCOPE (base44 removal):
//   - ENTITY DATA is fully local here — NO hosted backend, NO network, NO keys.
//   - functions (Phase 3): the old `functions.invoke` consumers were moved to
//     direct client-side / wallet-core paths, so no app page calls this stub
//     anymore:
//       * rpcProxy        → LiveBalances reads via wallet-core/evm/provider
//       * checkPriceAlerts→ PriceAlerts checks the cryptocompare feed in-app
//       * generate*PDF    → exportCataloguePdf() renders with vendored jsPDF
//     The no-op `functions.invoke` below is kept only as a harmless fallback.
//   - integrations (Phase 3, DECISION PENDING): InvokeLLM (AI pages) and
//     SendEmail (email OTP) genuinely need a server. In the local build the UI
//     shows an honest "not available in this local build" state instead of
//     calling these stubs (see base44Client LLM_AVAILABLE / EMAIL_AVAILABLE).
//     The stubs remain so demo mode keeps its scripted tour behaviour.
//   - auth (Phase 2): on-device unlock is the account.
//
// Nothing in this file touches real keys. Key custody/signing live entirely in
// wallet-core and are unaffected.

import { demoBase44 } from "@/api/demoClient";
// Codex P1 2026-08-15: openrouterClient.js deleted. It read
// VITE_OPENROUTER_API_KEY and sent it as `Authorization: Bearer …` from the
// shipped bundle — VITE_-prefixed env vars are PUBLIC (embedded verbatim in
// the client), so any user could extract the key from JS or app traffic and
// spend Veyrnox's OpenRouter account. Rather than ship a leaked-by-design key
// or race a server-side proxy, drop the client entirely; InvokeLLM now always
// falls through to demoBase44's stub. The AI-news / AI-sentiment surfaces
// already handle LLM_AVAILABLE === false (NewsSentimentPage.jsx renders a
// static "no live feed connected" state), so the feature honestly reports
// unavailable in the local build.

const DB_NAME = "veyrnox-appdata";
const STORE = "entities"; // one record per entity name, value = array of rows
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/**
 * Close the cached IndexedDB connection and drop the handle, so a test that
 * deletes the database is not left BLOCKED behind a live module-level
 * connection. The next operation reopens lazily via openDb().
 *
 * @returns {Promise<void>}
 */
export async function closeLocalBase44DbForTest() {
  const pending = dbPromise;
  dbPromise = null;
  if (!pending) return;
  try {
    const db = await pending;
    db.close();
  } catch {
    // The database never opened successfully, so there is nothing to close.
  }
}

function idbGet(name) {
  return openDb().then(
    (db) =>
      new Promise((res, rej) => {
        const r = db.transaction(STORE, "readonly").objectStore(STORE).get(name);
        r.onsuccess = () => res(r.result || null);
        r.onerror = () => rej(r.error);
      }),
  );
}

function idbPut(name, rows) {
  return openDb().then(
    (db) =>
      new Promise((res, rej) => {
        const r = db.transaction(STORE, "readwrite").objectStore(STORE).put(rows, name);
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
      }),
  );
}

const iso = (d) => new Date(d).toISOString();
const getTable = async (name) => (await idbGet(name)) || [];
const matches = (row, query) =>
  !query || Object.entries(query).every(([k, v]) => row[k] === v);

function parseSort(sort) {
  if (typeof sort !== 'string' || !sort.trim()) return null;
  const key = sort.startsWith('-') ? sort.slice(1) : sort;
  if (!key) return null;
  return { key, desc: sort.startsWith('-') };
}

function compareValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const aTime = typeof a === 'string' ? Date.parse(a) : NaN;
  const bTime = typeof b === 'string' ? Date.parse(b) : NaN;
  if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) return aTime - bTime;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function sortRows(rows, sort) {
  const parsed = parseSort(sort);
  if (!parsed) return rows.slice();
  const { key, desc } = parsed;
  return rows.slice().sort((a, b) => {
    const cmp = compareValues(a?.[key], b?.[key]);
    return desc ? -cmp : cmp;
  });
}

function applyLimit(rows, limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return rows;
  return rows.slice(0, Math.floor(n));
}

function makeMissingRowError(entityName, id) {
  const err = new Error(`${entityName} row not found: ${id}`);
  err.code = 'LOCAL_ENTITY_NOT_FOUND';
  err.entity = entityName;
  err.id = id;
  return err;
}

// Globally-unique, collision-free ids that survive across sessions (a module
// counter would reset to the same values on every reload). Prefer the platform
// UUID; fall back to a timestamped random suffix where it's unavailable.
const nextId = () => {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `local-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
};

function makeEntity(name) {
  return {
    // base44's list takes (sort, limit). Honor both so callers that were written
    // against the hosted API keep the same ordering/size semantics locally.
    list: async (sort, limit) => applyLimit(sortRows(await getTable(name), sort), limit),
    filter: async (query) => (await getTable(name)).filter((r) => matches(r, query)),
    get: async (id) => (await getTable(name)).find((r) => r.id === id) || null,
    create: async (data) => {
      const rows = await getTable(name);
      const now = iso(Date.now());
      const row = { id: nextId(), created_date: now, updated_date: now, ...data };
      rows.unshift(row);
      await idbPut(name, rows);
      return row;
    },
    update: async (id, data) => {
      const rows = await getTable(name);
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) throw makeMissingRowError(name, id);
      rows[i] = { ...rows[i], ...data, updated_date: iso(Date.now()) };
      await idbPut(name, rows);
      return rows[i];
    },
    delete: async (id) => {
      const rows = await getTable(name);
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) {
        rows.splice(i, 1);
        await idbPut(name, rows);
      }
      return { success: true };
    },
    subscribe: () => () => {},
  };
}

const entities = new Proxy(
  {},
  { get: (cache, name) => (cache[name] ||= makeEntity(String(name))) },
);

export const localBase44 = {
  entities,
  asServiceRole: { entities },
  auth: demoBase44.auth,
  functions: demoBase44.functions,
  integrations: {
    ...demoBase44.integrations,
    Core: {
      ...demoBase44.integrations.Core,
      InvokeLLM: demoBase44.integrations.Core.InvokeLLM,
    },
  },
};
