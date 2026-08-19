// src/wallet-core/__tests__/panic-residue-phishing-feed.test.js
//
// The phishing-domain feed (src/risk/phishingFeed.js) adds a NEW IndexedDB
// database, 'veyrnox-phishing-feed'. Its CONTENTS are a public blocklist and
// incriminate nobody — its PRESENCE is the tell: the database only exists if
// this device ran outside deniability long enough to download a feed, which
// contradicts a decoy story. Same reasoning that put veyrnox-threat-intel and
// veyrnox-ioc-cache on the wipe list, and the same class as the
// veyrnox-first-run-tour-* keys that were missed once already.
//
// Two things must hold, and the second is the one historically forgotten: the
// database must be DELETED, and inspectKeyMaterial must LOOK for it — a wipe
// that misses a store while still reporting `clean: true` is worse than one
// that misses it loudly.

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { panicWipeLocal, inspectKeyMaterial } from '../panic.js';

const DB_NAME = 'veyrnox-phishing-feed';

function openFeedDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('domains')) db.createObjectStore('domains');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbExists() {
  const list = await indexedDB.databases();
  return (list || []).some((d) => d && d.name === DB_NAME);
}

beforeEach(async () => {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = resolve;
    req.onerror = resolve;
    req.onblocked = resolve;
  });
});

describe('panic wipe — phishing feed cache', () => {
  it('deletes the feed database, so its presence cannot contradict a decoy story', async () => {
    const db = await openFeedDb();
    await new Promise((resolve) => {
      const tx = db.transaction('domains', 'readwrite');
      tx.objectStore('domains').put(
        { domains: [{ domain: 'evil.test', reason: 'x' }], ts: Date.now() },
        'feed',
      );
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
    db.close();

    expect(await dbExists()).toBe(true);

    await panicWipeLocal();

    expect(await dbExists()).toBe(false);
  });

  it('inspectKeyMaterial LOOKS for it — a surviving feed DB is never reported clean', async () => {
    // Hold the connection open so the delete is blocked and the database
    // survives the wipe. If the name were missing from the inspection list,
    // this would come back `clean: true` with the database still sitting there.
    const held = await openFeedDb();
    try {
      await panicWipeLocal();
      const report = await inspectKeyMaterial();
      expect(report.sideDatabasesVerified).toBe(true);
      expect(report.sideDatabasesResidue).toContain(DB_NAME);
      expect(report.clean).toBe(false);
    } finally {
      try { held.close(); } catch { /* noop */ }
    }
  });
});
