// wallet-core/__tests__/audit-log.test.js
//
// Tests for the LOCAL AUDIT LOG (S4 — opt-in, deniability-safe). These run
// against the REAL crypto (vault.js Argon2id+AES-GCM) and a fake IndexedDB, so
// they exercise the same storage seam the rest of the wallet uses. They assert
// the properties the deniability claim rests on:
//   - PANIC WIPE destroys the audit blob along with everything else;
//   - record() REFUSES every denylisted event (duress/stealth/hidden/panic/
//     decoy/seed) — nothing is written;
//   - when DISABLED (the default), record() writes nothing — no 'quaternary' key
//     ever appears, so a non-user leaves zero audit artifact;
//   - the stored blob is byte-shaped EXACTLY like every other vault blob (no
//     deniability tell);
//   - the ring-buffer cap holds, clearAuditLog() removes it, and the round-trip
//     only decrypts with the correct password.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isAuditLogEnabled, setAuditLogEnabled,
  recordAuditEvent, readAuditLog, clearAuditLog,
  ALLOWED_EVENT_TYPES, AUDIT_LOG_PREF_KEY,
} from '../auditLog.js';
import { panicWipeLocal } from '../panic.js';
import { encryptVault } from '../vault.js';
import { webKeyStore } from '../keystore/web.js';
import { generateMnemonic } from '../mnemonic.js';

const REAL_PW = 'main-pass-2468';
const WRONG_PW = 'not-the-password-9999';
const AUDIT_KEY = 'quaternary';

// Deterministic fresh slate: clear the object store IN PLACE (no DB delete).
// panic.js's panicWipeLocal deletes the database via a best-effort delete that
// resolves on `onblocked` BEFORE the deletion actually lands, so using it in a
// beforeEach lets a deferred delete fire mid-next-test and pollute state. A plain
// clear() of the store is synchronous-on-await and leaves no pending operation.
function freshStore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('veyrnox-vault', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('vault')) db.createObjectStore('vault');
    };
    req.onsuccess = () => {
      const db = req.result;
      const r = db.transaction('vault', 'readwrite').objectStore('vault').clear();
      r.onsuccess = () => { db.close(); resolve(); };
      r.onerror = () => { db.close(); reject(r.error); };
    };
    req.onerror = () => reject(req.error);
  });
}

// Raw dump of the vault store (same helper shape as panic/stealth tests).
function dumpVaultStore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('veyrnox-vault', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('vault')) db.createObjectStore('vault');
    };
    req.onsuccess = () => {
      const db = req.result;
      const st = db.transaction('vault', 'readonly').objectStore('vault');
      const keysReq = st.getAllKeys();
      const valsReq = st.getAll();
      keysReq.onsuccess = () => {
        valsReq.onsuccess = () => {
          const out = {};
          keysReq.result.forEach((k, i) => { out[k] = valsReq.result[i]; });
          db.close();
          resolve(out);
        };
      };
      keysReq.onerror = () => reject(keysReq.error);
    };
    req.onerror = () => reject(req.error);
  });
}

describe('local audit log (S4)', () => {
  beforeEach(async () => {
    // Fresh slate: empty the store in place and clear the opt-in pref so each test
    // starts OFF with no blob.
    try { await freshStore(); } catch { /* noop */ }
    try { localStorage.removeItem(AUDIT_LOG_PREF_KEY); } catch { /* noop */ }
  });

  // ---- enable switch (opt-in, OFF by default) ----

  it('is OFF by default and toggles via the localStorage pref', () => {
    expect(isAuditLogEnabled()).toBe(false);     // absence of key = OFF
    setAuditLogEnabled(true);
    expect(isAuditLogEnabled()).toBe(true);
    expect(localStorage.getItem(AUDIT_LOG_PREF_KEY)).toBe('1');
    setAuditLogEnabled(false);
    expect(isAuditLogEnabled()).toBe(false);
    // OFF is stored as ABSENCE of the key (no lingering "0" tell).
    expect(localStorage.getItem(AUDIT_LOG_PREF_KEY)).toBeNull();
  });

  // ---- DISABLED: writes nothing (zero artifact for a non-user) ----

  it('when disabled (default), record() writes nothing — no quaternary key ever appears', async () => {
    expect(isAuditLogEnabled()).toBe(false);
    // Try to log every allowlisted type while OFF.
    for (const type of ALLOWED_EVENT_TYPES) {
      await recordAuditEvent(type, REAL_PW);
    }
    const store = await dumpVaultStore();
    expect(Object.keys(store)).not.toContain(AUDIT_KEY);
    // And reading back yields an empty log (no blob to decrypt).
    expect(await readAuditLog(REAL_PW)).toEqual([]);
  });

  // ---- HARD DENYLIST: refuses every deniability-sensitive event ----

  it('record() refuses EVERY denylisted event type — nothing is written', async () => {
    setAuditLogEnabled(true); // even when ON, denylisted events are refused
    const denied = [
      'duress_unlock', 'duress',
      'stealth_pool_seeded', 'stealth',
      'hidden_wallet_revealed', 'hidden_wallet_created', 'hidden',
      'panic_armed', 'panic_wipe', 'panic',
      'decoy_opened', 'decoy',
      'seed_exported', 'seed_revealed', 'seed',
      'mnemonic_backup',
    ];
    for (const type of denied) {
      await recordAuditEvent(type, REAL_PW);
    }
    // Not a single one was written: no blob exists at all.
    const store = await dumpVaultStore();
    expect(Object.keys(store)).not.toContain(AUDIT_KEY);
    expect(await readAuditLog(REAL_PW)).toEqual([]);
  });

  it('record() silently ignores types outside the allowlist (no throw, no write)', async () => {
    setAuditLogEnabled(true);
    // Benign-sounding but not allowlisted, plus malformed inputs.
    await recordAuditEvent('totally_made_up_event', REAL_PW);
    await recordAuditEvent('', REAL_PW);
    await recordAuditEvent(undefined, REAL_PW);
    await recordAuditEvent({ type: 'send_completed' }, REAL_PW); // non-string
    const store = await dumpVaultStore();
    expect(Object.keys(store)).not.toContain(AUDIT_KEY);
  });

  it('refuses approval_granted now that granting is HONEST-DISABLED (removed from allowlist)', async () => {
    setAuditLogEnabled(true);
    await recordAuditEvent('approval_granted', REAL_PW); // no longer allowlisted
    const store = await dumpVaultStore();
    expect(Object.keys(store)).not.toContain(AUDIT_KEY);
    expect(await readAuditLog(REAL_PW)).toEqual([]);
  });

  // ---- happy path: allowlisted events round-trip ----

  it('records allowlisted events as { type, ts } only and reads them back in order', async () => {
    setAuditLogEnabled(true);
    await recordAuditEvent('settings_changed', REAL_PW);
    await recordAuditEvent('send_completed', REAL_PW);
    await recordAuditEvent('approval_revoked', REAL_PW);

    const log = await readAuditLog(REAL_PW);
    expect(log.length).toBe(3);
    expect(log.map((e) => e.type)).toEqual([
      'settings_changed', 'send_completed', 'approval_revoked',
    ]);
    // Each entry has EXACTLY { type, ts } — no amounts/recipients/addresses/seed.
    for (const e of log) {
      expect(Object.keys(e).sort()).toEqual(['ts', 'type']);
      expect(typeof e.ts).toBe('number');
      expect(ALLOWED_EVENT_TYPES).toContain(e.type);
    }
  });

  // ---- deniability tell: blob is byte-shaped like any other vault blob ----

  it('the stored blob is byte-shaped like a vault blob (no deniability tell)', async () => {
    setAuditLogEnabled(true);
    await recordAuditEvent('approval_revoked', REAL_PW);

    const store = await dumpVaultStore();
    const auditBlob = store[AUDIT_KEY];
    expect(auditBlob).toBeTruthy();

    // Same { v, kdf, salt, iv, ct } shape as a freshly encrypted vault blob.
    const reference = await encryptVault('anything', REAL_PW);
    expect(Object.keys(auditBlob).sort()).toEqual(Object.keys(reference).sort());
    expect(Object.keys(auditBlob).sort()).toEqual(['ct', 'iv', 'kdf', 'salt', 'v']);

    // Same KDF name and params — the kdf field cannot be used to pick the audit
    // blob out from the primary/decoy/stealth/panic blobs.
    expect(auditBlob.kdf.name).toBe(reference.kdf.name);
    expect(auditBlob.kdf.name).toBe('argon2id');
    expect(auditBlob.kdf.memorySize).toBe(reference.kdf.memorySize);
    expect(auditBlob.kdf.iterations).toBe(reference.kdf.iterations);
    expect(auditBlob.kdf.parallelism).toBe(reference.kdf.parallelism);
    expect(auditBlob.kdf.hashLength).toBe(reference.kdf.hashLength);

    // The ciphertext fields are present, non-empty, and base64 (not plaintext).
    expect(typeof auditBlob.ct).toBe('string');
    expect(auditBlob.ct.length).toBeGreaterThan(0);
    expect(auditBlob.ct).not.toContain('approval_revoked');
  });

  // ---- ring buffer cap (100), oldest dropped ----

  it('caps the ring buffer at 100 entries, dropping the oldest', async () => {
    setAuditLogEnabled(true);
    // Seed a near-full log (99 entries, ts = 1..99) directly as ONE vault blob,
    // rather than driving 99 record() calls — each record() runs TWO Argon2id
    // KDFs (decrypt-to-read + encrypt-to-write), and the pure-JS WASM KDF in the
    // test env is ~1 s each, so looping past the cap would blow the 60 s budget
    // (and a timed-out test's dangling writes would pollute later tests). Seeding
    // the blob the SAME way record() persists it keeps the test fast and faithful.
    const seeded = Array.from({ length: 99 }, (_, i) => ({
      type: 'settings_changed', ts: i + 1, // ts 1..99
    }));
    const seedBlob = await encryptVault(JSON.stringify(seeded), REAL_PW);
    await new Promise((res, rej) => {
      const req = indexedDB.open('veyrnox-vault', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('vault')) db.createObjectStore('vault');
      };
      req.onsuccess = () => {
        const db = req.result;
        const r = db.transaction('vault', 'readwrite').objectStore('vault')
          .put(seedBlob, AUDIT_KEY);
        r.onsuccess = () => { db.close(); res(); };
        r.onerror = () => { db.close(); rej(r.error); };
      };
      req.onerror = () => rej(req.error);
    });

    // Five more real records cross the cap (99 + 5 = 104 -> trimmed to 100). Their
    // Date.now() timestamps are far larger than the seeded 1..99.
    for (let i = 0; i < 5; i++) await recordAuditEvent('send_completed', REAL_PW);

    const log = await readAuditLog(REAL_PW);
    // Held at the cap, oldest dropped: seeded ts 1..4 fell off the front.
    expect(log.length).toBe(100);
    expect(log[0].ts).toBe(5);
    expect(log.some((e) => e.ts === 1)).toBe(false);
    // The five newest are the records we just made.
    expect(log.slice(-5).map((e) => e.type)).toEqual(Array(5).fill('send_completed'));
    // Timestamps are non-decreasing (oldest dropped, newest kept).
    for (let i = 1; i < log.length; i++) {
      expect(log[i].ts).toBeGreaterThanOrEqual(log[i - 1].ts);
    }
  });

  // ---- round-trip needs the correct password ----

  it('round-trips only with the correct password; the wrong one fails to decrypt', async () => {
    setAuditLogEnabled(true);
    await recordAuditEvent('send_completed', REAL_PW);

    // Correct password reads it back.
    const ok = await readAuditLog(REAL_PW);
    expect(ok.length).toBe(1);
    expect(ok[0].type).toBe('send_completed');

    // Wrong password cannot read it (GCM auth fails — same as every vault read).
    await expect(readAuditLog(WRONG_PW)).rejects.toThrow();
  });

  // ---- clearAuditLog removes the blob, nothing else ----

  it('clearAuditLog() removes the quaternary blob', async () => {
    setAuditLogEnabled(true);
    await recordAuditEvent('settings_changed', REAL_PW);
    expect(Object.keys(await dumpVaultStore())).toContain(AUDIT_KEY);

    await clearAuditLog();
    expect(Object.keys(await dumpVaultStore())).not.toContain(AUDIT_KEY);
    expect(await readAuditLog(REAL_PW)).toEqual([]);
  });

  it('clearAuditLog() does not touch the primary vault', async () => {
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    setAuditLogEnabled(true);
    await recordAuditEvent('settings_changed', REAL_PW);

    await clearAuditLog();
    // Audit blob gone, primary vault intact.
    expect(Object.keys(await dumpVaultStore())).not.toContain(AUDIT_KEY);
    expect(await webKeyStore.hasVault()).toBe(true);
  });

  // ---- AL-02: ciphertext length must NOT leak entry count (activity oracle) ----

  it('AL-02: 1-entry and 5-entry logs produce the SAME padded-block ciphertext size', async () => {
    // Blob 1: a single event.
    await freshStore();
    setAuditLogEnabled(true);
    await recordAuditEvent('settings_changed', REAL_PW);
    const oneEntry = (await dumpVaultStore())[AUDIT_KEY];
    expect(await readAuditLog(REAL_PW)).toHaveLength(1); // round-trip still works

    // Blob 2: five events (all under the small-count size class).
    await freshStore();
    setAuditLogEnabled(true);
    for (let i = 0; i < 5; i++) await recordAuditEvent('send_completed', REAL_PW);
    const fiveEntries = (await dumpVaultStore())[AUDIT_KEY];
    expect(await readAuditLog(REAL_PW)).toHaveLength(5); // round-trip still works

    // The base64 ciphertext length is the observable an adversary reads from the
    // blob. With 512-byte padding, both small logs land in the same size class,
    // so entry count is not inferable from the blob length.
    expect(oneEntry.ct.length).toBe(fiveEntries.ct.length);
  });

  // ---- THE security-critical one: panic wipe destroys the audit blob ----

  it('panic wipe destroys the audit blob (it is just another vault entry)', async () => {
    setAuditLogEnabled(true);
    await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
    await recordAuditEvent('approval_revoked', REAL_PW);
    // The audit blob exists before the wipe.
    expect(Object.keys(await dumpVaultStore())).toContain(AUDIT_KEY);

    const report = await panicWipeLocal();
    expect(report.clean).toBe(true);

    // The 'quaternary' key is gone from the store — the wipe took it.
    const store = await dumpVaultStore();
    expect(Object.keys(store)).not.toContain(AUDIT_KEY);
    expect(await readAuditLog(REAL_PW)).toEqual([]);
  });
});
