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
    // base44's list takes (sort, limit); the local store keeps insertion order
    // (newest first, like the demo) and callers re-sort/slice as needed, so the
    // args are accepted but not used here — same observable behaviour as demo.
    list: async (_sort, _limit) => (await getTable(name)).slice(),
    filter: async (query) => (await getTable(name)).filter((r) => matches(r, query)),
    get: async (id) => (await getTable(name)).find((r) => r.id === id) || null,
    create: async (data) => {
      const rows = await getTable(name);
      const row = { id: nextId(), created_date: iso(Date.now()), ...data };
      rows.unshift(row);
      await idbPut(name, rows);
      return row;
    },
    update: async (id, data) => {
      const rows = await getTable(name);
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) {
        rows[i] = { ...rows[i], ...data };
        await idbPut(name, rows);
        return rows[i];
      }
      return { id, ...data };
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
  // auth / functions / integrations: reuse demoClient's offline no-op stubs for
  // now. They make no network calls and touch no keys; real replacements are
  // Phase 2 (auth) and Phase 3 (functions + integrations).
  auth: demoBase44.auth,
  functions: demoBase44.functions,
  integrations: demoBase44.integrations,
};
