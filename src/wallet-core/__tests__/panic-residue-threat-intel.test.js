// wallet-core/__tests__/panic-residue-threat-intel.test.js
//
// I-3 residue-completeness for the 'veyrnox-threat-intel' IndexedDB database
// (src/lib/threatIntelStore.js).
//
// WHY THIS IS RESIDUE, given the rows are "just threat intel":
// The SEED list is generic, ships inside the JS bundle, and is never written to
// IndexedDB — it is not user-derived and not a tell. Only LEARNED rows are
// persisted here, and a learned row is written by exactly one path:
//
//   SendCrypto.jsx -> cacheTipResult(toAddress, tipQuery.data)
//                  -> learnThreat({ address: <the address the USER typed>, ... })
//
// The record's PRIMARY KEY is that recipient address. So the database is not a
// copy of the TIP feed — it is the per-device SUBSET of it that this user's own
// send attempts selected. It answers "which flagged addresses did the person
// holding this device try to pay, and when" (`learnedAt`). That is the same class
// of forensic residue as 'veyrnox-appdata', whose deletion comment in panic.js
// says it plainly: rows that NAME addresses tie the device to the destroyed
// wallet set.
//
// Sharper still: openDb() is only ever reached from learnThreat() (the sync
// seed lookup never opens IndexedDB), so the database is created ONLY when a
// flagged address has been entered. Its mere EXISTENCE is the tell — the same
// argument that put 'veyrnox-first-run-tour-seen' and 'veyrnox-device-id' on the
// residue list. "What makes a key a tell is its PRESENCE."
//
// Deleting it costs nothing functionally: the seed list lives in code, so
// screening is unchanged after a wipe; only the learned cache is lost.
//
// This test observes the database directly rather than through
// inspectKeyMaterial(), mirroring the F-06 app-data test in panic.test.js —
// database deletion is additive and best-effort, not part of the localStorage
// residue allowlist.

import { describe, it, expect, vi } from 'vitest';
import { panicWipeLocal } from '../panic.js';
import { learnThreat } from '../../lib/threatIntelStore.js';

// Deniability/demo suppresses learnThreat() by design (I3). These tests cover the
// REAL-session case, which is the only one that can write a row at all.
vi.mock('../deniabilitySession.js', () => ({
  isDeniabilitySessionActive: () => false,
  isDeniabilityOrDemoActive: () => false,
}));

const DB_NAME = 'veyrnox-threat-intel';
const STORE_NAME = 'threats';

// A distinct address per test. threatIntelStore.js caches its IndexedDB
// connection in a module-level `_dbPromise` that is never closed, so a
// deleteDatabase() in beforeEach() would sit BLOCKED behind that live handle and
// deadlock the next put() — the store is isolated by key instead.
const FLAGGED_PRECONDITION = '0x1111111111111111111111111111111111111111';
const FLAGGED_WIPE = '0x2222222222222222222222222222222222222222';

/**
 * Read a row straight out of the store WITHOUT going through threatIntelStore's
 * module-level connection cache — otherwise a stale cached handle, not the
 * on-disk state, is what we would be asserting on.
 * Resolves null when the database or store does not exist.
 */
function rawGet(address) {
  return new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME);
    } catch {
      resolve(null);
      return;
    }
    // If the DB was deleted, open() recreates it EMPTY and with no object store.
    // Do NOT let a read CREATE the database. open() with no existing DB fires
    // onupgradeneeded and would leave an empty, STORELESS db at the same
    // version — after which learnThreat()'s transaction(STORE_NAME) throws and
    // is swallowed by its catch, silently disabling writes for the whole run.
    // Aborting here keeps the read side-effect-free (same guard as panic.js).
    req.onupgradeneeded = () => { try { req.transaction?.abort(); } catch { /* ignore */ } };
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.close();
        resolve(null);
        return;
      }
      const r = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(address);
      r.onsuccess = () => { const v = r.result; db.close(); resolve(v ?? null); };
      r.onerror = () => { db.close(); resolve(null); };
    };
  });
}

/** Does the database still carry the 'threats' object store? */
function rawHasStore() {
  return new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME);
    } catch {
      resolve(false);
      return;
    }
    // Do NOT let a read CREATE the database. open() with no existing DB fires
    // onupgradeneeded and would leave an empty, STORELESS db at the same
    // version — after which learnThreat()'s transaction(STORE_NAME) throws and
    // is swallowed by its catch, silently disabling writes for the whole run.
    // Aborting here keeps the read side-effect-free (same guard as panic.js).
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

describe('panic wipe — veyrnox-threat-intel residue', () => {
  it('a learned TIP row records the address the user typed (pre-condition)', async () => {
    await learnThreat({
      address: FLAGGED_PRECONDITION,
      category: 'scam',
      source: 'Veyrnox TIP',
      note: 'scam_report (chainabuse, 90% confidence)',
      severity: 'high',
    });

    const row = await rawGet(FLAGGED_PRECONDITION);
    // If this fails, the finding's premise is wrong — say so loudly rather than
    // letting the wipe assertion below pass vacuously against an empty store.
    expect(row).not.toBeNull();
    expect(row.address).toBe(FLAGGED_PRECONDITION);
    expect(row.learnedAt).toEqual(expect.any(Number));
  });

  it('panicWipeLocal erases the threat-intel rows (forensic residue)', async () => {
    await learnThreat({
      address: FLAGGED_WIPE,
      category: 'scam',
      source: 'Veyrnox TIP',
      note: 'scam_report (chainabuse, 90% confidence)',
      severity: 'high',
    });
    expect(await rawGet(FLAGGED_WIPE)).not.toBeNull(); // present before the wipe

    await panicWipeLocal();

    // Asserts the property that actually matters — the address is no longer
    // readable — rather than the mechanism. That holds whether the database was
    // deleted outright or merely cleared because threatIntelStore's live handle
    // blocked the delete, which is exactly why the fix clears before deleting.
    expect(await rawGet(FLAGGED_WIPE)).toBeNull();

    // Stronger than "the row is gone": the whole store is gone, so the database
    // does not linger as an empty-but-present artifact.
    expect(await rawHasStore()).toBe(false);
  });

  it('leaves the store usable after a wipe (no pending-delete deadlock)', async () => {
    // REGRESSION GUARD, and the reason panic.js closes the connection before
    // deleting. threatIntelStore caches its connection in a module-level
    // `_dbPromise` that nothing else closes. deleteDatabase() against a live
    // connection fires `onblocked` and stays PENDING — and a pending delete
    // blocks EVERY later open() on that database, so the next lookup hangs
    // forever rather than failing. Observed directly: the delete-without-close
    // version of this fix timed out this file at 180s; with the close it runs in
    // ~3s. A future edit that drops closeThreatIntelDb() re-hangs here.
    const AFTER = '0x3333333333333333333333333333333333333333';

    await panicWipeLocal();

    await learnThreat({
      address: AFTER,
      category: 'drainer',
      source: 'Veyrnox TIP',
      note: 'post-wipe write must still work',
      severity: 'critical',
    });

    const row = await rawGet(AFTER);
    expect(row).not.toBeNull();
    expect(row.address).toBe(AFTER);
  }, 20000);
});
