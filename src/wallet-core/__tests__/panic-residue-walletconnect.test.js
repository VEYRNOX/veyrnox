// wallet-core/__tests__/panic-residue-walletconnect.test.js
//
// I-3 residue-completeness for the WalletConnect v2 SDK's own IndexedDB store
// (@walletconnect/keyvaluestorage — dbName WALLET_CONNECT_V2_INDEXED_DB, store
// keyvaluestorage). Session records embed the real wallet address as
// `eip155:<chainId>:<address>` and identify the dApps the wallet connected to,
// so surviving a panic wipe proves the coercion-resistant install existed and
// what it did — the same forensic-residue class as veyrnox-threat-intel.
//
// Strix retest 2026-08-29 (test da8afd59-69ef-42d5-978e-2ea684d0ddcc) confirmed
// panicWipeLocal previously left this database readable AND reported clean:true.
// This test locks BOTH properties: the row is gone, the store is gone, and the
// wipe's own honesty check refuses to call clean:true when it survives.

import { describe, it, expect } from 'vitest';
import { panicWipeLocal, inspectKeyMaterial } from '../panic.js';

const DB_NAME = 'WALLET_CONNECT_V2_INDEXED_DB';
const STORE_NAME = 'keyvaluestorage';

// Seed a session-shaped row directly through indexedDB, mirroring what the SDK's
// KeyValueStorage.setItem writes. We bypass the SDK to avoid pulling its
// relay/pairing machinery into a unit test.
function seedSessionRow(key, value) {
  return new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, 1); }
    catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}

function rawGet(key) {
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(DB_NAME); } catch { resolve(null); return; }
    req.onupgradeneeded = () => { try { req.transaction?.abort(); } catch { /* ignore */ } };
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) { db.close(); resolve(null); return; }
      const r = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      r.onsuccess = () => { const v = r.result; db.close(); resolve(v ?? null); };
      r.onerror = () => { db.close(); resolve(null); };
    };
  });
}

function rawHasStore() {
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(DB_NAME); } catch { resolve(false); return; }
    req.onupgradeneeded = () => { try { req.transaction?.abort(); } catch { /* ignore */ } };
    req.onerror = () => resolve(false);
    req.onsuccess = () => {
      const db = req.result;
      const has = db.objectStoreNames.contains(STORE_NAME);
      db.close();
      resolve(has);
    };
  });
}

const REAL_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const SESSION_KEY = 'wc@2:client:0.3//session';
const SESSION_VALUE = JSON.stringify([
  {
    topic: 'aaaabbbb',
    peer: { metadata: { name: 'Uniswap', url: 'https://app.uniswap.org' } },
    namespaces: { eip155: { accounts: [`eip155:1:${REAL_ADDRESS}`] } },
  },
]);

describe('panic wipe — WALLET_CONNECT_V2_INDEXED_DB residue', () => {
  it('erases WC session records and reports clean:true', async () => {
    await seedSessionRow(SESSION_KEY, SESSION_VALUE);
    // Also seed a legacy localStorage fallback key so the sweep is exercised.
    try { localStorage.setItem('wc@2:core:0.3//keychain', '{}'); } catch { /* jsdom fine */ }

    // Pre-condition: the address is discoverable in the store before the wipe.
    const before = await rawGet(SESSION_KEY);
    expect(before).not.toBeNull();
    expect(String(before)).toContain(REAL_ADDRESS);

    const report = await panicWipeLocal();

    // The row is gone — the property that actually matters.
    expect(await rawGet(SESSION_KEY)).toBeNull();
    // The store is gone — no empty-but-present artifact lingers.
    expect(await rawHasStore()).toBe(false);
    // Legacy localStorage fallback keys are gone.
    try { expect(localStorage.getItem('wc@2:core:0.3//keychain')).toBeNull(); } catch { /* ignore */ }
    // And the wipe's OWN honesty check is now consistent with the erasure —
    // this is the half that used to lie (clean:true on a surviving DB).
    expect(report.sideDatabasesResidue).not.toContain(DB_NAME);
    expect(report.clean).toBe(true);
  });

  it('inspectKeyMaterial refuses clean:true when the WC DB survives', async () => {
    // The tripwire: if a future edit drops eraseWalletConnectDatabase(), inspection
    // must catch it via SIDE_DB_NAMES. Seed the store, DO NOT wipe, assert unclean.
    await seedSessionRow(SESSION_KEY, SESSION_VALUE);
    const report = await inspectKeyMaterial();
    expect(report.sideDatabasesVerified).toBe(true);
    expect(report.sideDatabasesResidue).toContain(DB_NAME);
    expect(report.clean).toBe(false);
  });
});
