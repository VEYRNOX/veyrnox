// wallet-core/__tests__/panic.test.js
//
// Tests for PANIC WIPE (S3 — Direction-C). ⚠️ DESTRUCTIVE primitive — these run
// against the REAL crypto (vault.js Argon2id+AES-GCM) and a fake IndexedDB, so
// they exercise the same code path WalletProvider uses. They assert the
// properties the safety claim rests on:
//   - the panic PIN fires ONLY on an exact match, never on a wrong password;
//   - a wipe destroys EVERY entry in the vault store (primary + duress decoy +
//     stealth pool + panic marker) — nothing recoverable remains;
//   - inspectKeyMaterial() truthfully reports clean vs not (the proof the UI/demo
//     rely on);
//   - removing the panic PIN wipes nothing else;
//   - the panic marker is byte-shaped like every other vault blob (no tell).

import { describe, it, expect, beforeEach } from 'vitest';
import {
  setPanicVault, clearPanicVault, hasPanicVault, tryPanicUnlock,
  panicWipeLocal, inspectKeyMaterial,
} from '../panic.js';
import { webKeyStore } from '../keystore/web.js';
import { setDuressVault, hasDuressVault } from '../duress.js';
import {
  createHiddenWallet, tryRevealHidden, ensureStealthPool,
} from '../stealth.js';
import { generateMnemonic } from '../mnemonic.js';
import { clearVault } from '../evm/vaultStore.js';

const REAL_PW = 'main-pass-2468';
const DURESS_PW = 'duress-pass-1357';
const HIDDEN_SECRET = 'hidden-key-9753';
const PANIC_PW = 'burn-everything-0000';

// Stand up a fully-populated device: primary vault + duress decoy + a hidden
// wallet + a panic PIN — i.e. every kind of key material a wipe must destroy.
async function populateDevice() {
  await webKeyStore.createVault(generateMnemonic(128), REAL_PW);
  await ensureStealthPool();
  await setDuressVault(generateMnemonic(128), DURESS_PW);
  await createHiddenWallet(HIDDEN_SECRET);
  await setPanicVault(PANIC_PW);
}

function unb64(str) {
  const s = atob(str); const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}
function getBlob(key) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('veyrnox-vault', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('vault')) db.createObjectStore('vault');
    };
    req.onsuccess = () => {
      const db = req.result;
      const r = db.transaction('vault', 'readonly').objectStore('vault').get(key);
      r.onsuccess = () => { db.close(); resolve(r.result ?? null); };
      r.onerror = () => { db.close(); reject(r.error); };
    };
    req.onerror = () => reject(req.error);
  });
}

// Open the SEPARATE app-data DB (veyrnox-appdata) exactly as src/api/localClient.js
// does, so the test exercises the real store shape a thorough wipe must remove.
function appDataPut(name, rows) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('veyrnox-appdata', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('entities')) db.createObjectStore('entities');
    };
    req.onsuccess = () => {
      const db = req.result;
      const r = db.transaction('entities', 'readwrite').objectStore('entities').put(rows, name);
      r.onsuccess = () => { db.close(); resolve(); };
      r.onerror = () => { db.close(); reject(r.error); };
    };
    req.onerror = () => reject(req.error);
  });
}
function appDataGet(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('veyrnox-appdata', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('entities')) db.createObjectStore('entities');
    };
    req.onsuccess = () => {
      const db = req.result;
      const r = db.transaction('entities', 'readonly').objectStore('entities').get(name);
      r.onsuccess = () => { db.close(); resolve(r.result ?? null); };
      r.onerror = () => { db.close(); reject(r.error); };
    };
    req.onerror = () => reject(req.error);
  });
}

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

describe('panic wipe', () => {
  beforeEach(async () => {
    // Best-effort fresh slate (a prior test may have deleted the DB entirely).
    try { await clearVault(); } catch { /* noop */ }
    try { await panicWipeLocal(); } catch { /* noop */ }
  });

  it('sets / detects / clears a panic PIN', async () => {
    expect(await hasPanicVault()).toBe(false);
    await setPanicVault(PANIC_PW);
    expect(await hasPanicVault()).toBe(true);
    await clearPanicVault();
    expect(await hasPanicVault()).toBe(false);
  });

  it('rejects a too-short panic PIN', async () => {
    await expect(setPanicVault('short')).rejects.toThrow();
  });

  it('fires ONLY on the exact panic PIN, never on a wrong password', async () => {
    await setPanicVault(PANIC_PW);
    expect(await tryPanicUnlock(PANIC_PW)).toBe(true);
    expect(await tryPanicUnlock('wrong-guess')).toBe(false);
    expect(await tryPanicUnlock(REAL_PW)).toBe(false);
    expect(await tryPanicUnlock('')).toBe(false);
  });

  it('returns false when no panic PIN is configured', async () => {
    expect(await hasPanicVault()).toBe(false);
    expect(await tryPanicUnlock(PANIC_PW)).toBe(false);
  });

  it('the panic marker is byte-shaped like every other vault blob (no tell)', async () => {
    await populateDevice();
    const store = await dumpVaultStore();
    const shape = (k) => Object.keys(store[k]).sort().join(',');
    // 'tertiary' (panic) must have the SAME blob structure as 'primary',
    // 'secondary' (decoy), and the stealth slots.
    expect(shape('tertiary')).toBe(shape('primary'));
    expect(shape('tertiary')).toBe(shape('secondary'));
    expect(shape('tertiary')).toBe(shape('vault:1'));
  });

  it('inspectKeyMaterial truthfully reports populated vs clean', async () => {
    await populateDevice();
    const before = await inspectKeyMaterial();
    expect(before.clean).toBe(false);
    // primary + secondary + tertiary + the stealth pool (POOL_SIZE slots; M1
    // raised it 12 -> 256). Assert via the actual pool size rather than a magic
    // number so this stays correct if the pool is retuned.
    const stealthSlots = before.indexedDbKeys.filter((k) => k.startsWith('vault:')).length;
    expect(before.vaultBlobCount).toBe(3 + stealthSlots);
    expect(before.indexedDbKeys).toContain('primary');
    expect(before.indexedDbKeys).toContain('secondary');
    expect(before.indexedDbKeys).toContain('tertiary');
    expect(stealthSlots).toBe(256);
  });

  it('panicWipeLocal destroys ALL key material — nothing recoverable remains', async () => {
    await populateDevice();
    // sanity: everything opens before the wipe.
    expect(await hasDuressVault()).toBe(true);
    expect(await tryRevealHidden(HIDDEN_SECRET)).not.toBeNull();
    expect(await hasPanicVault()).toBe(true);

    const report = await panicWipeLocal();

    // The returned report proves the store is empty.
    expect(report.clean).toBe(true);
    expect(report.vaultBlobCount).toBe(0);
    expect(report.indexedDbKeys).toEqual([]);
    expect(report.localStorageResidue).toEqual([]);

    // And every path that previously opened key material now misses.
    expect(await webKeyStore.hasVault()).toBe(false);
    expect(await hasDuressVault()).toBe(false);
    expect(await tryRevealHidden(HIDDEN_SECRET)).toBeNull();
    expect(await hasPanicVault()).toBe(false);

    // A re-inspection AFTER those probes confirms the same — crucially, the post-wipe
    // tryRevealHidden() probe above must NOT re-create any residue. Reveal now uses a
    // READ-ONLY salt accessor (readSlotForSecret), so a missing 'veyrnox-stealth-slot-
    // salt' (a tracked deniability tell) is never re-provisioned by a reveal. Before
    // the read/write salt split, tryRevealHidden -> getOrCreateStealthSalt re-wrote
    // that key, silently re-introducing the very tell the wipe had just removed; this
    // ordering (probe, THEN inspect) is the regression guard for that fix.
    const after = await inspectKeyMaterial();
    expect(after.clean).toBe(true);
  });

  it('wipes the deniability tells in localStorage and reports them honestly (C-1)', async () => {
    // The forensic artifacts a panic wipe must also destroy — leaving any of these
    // proves the coercion-resistance stack was in use (and the decoy salt + a
    // coerced PIN reproduces the deterministic decoy). Internal audit C-1, extended
    // per AI-review F-02/F-03/F-05 (stealth-slot salt, audit-device salt, passkey
    // config) and F-06 (biometric pref, PIN-lockout counters, multi-wallet/portfolio
    // metadata, spam overrides). This pins the FULL membership of the residue lists
    // (DENIABILITY_RESIDUE_KEYS + METADATA_RESIDUE_KEYS), so a key dropped from the
    // wipe list — leaving a tell behind while clean still reports true — fails here
    // (also guards F-04).
    const TELLS = [
      // coercion-stack / auth-factor tells (DENIABILITY_RESIDUE_KEYS)
      'veyrnox-pin-decoy-salt',
      'veyrnox-auth-model',
      'veyrnox-audit-log',
      'veyrnox-stealth-slot-salt',
      'veyrnox-audit-device-salt',
      'veyrnox-passkey-unlock',
      'veyrnox-passkey-cred',
      'veyrnox-2fa-passkey',
      'veyrnox-biometric-unlock',
      'veyrnox-pin-attempts',
      'veyrnox-pin-backoff-until',
      // non-secret wallet/token metadata residue (METADATA_RESIDUE_KEYS) — F-06
      'veyrnox-wallet-meta',
      'veyrnox-active-wallet',
      'veyrnox-portfolios',
      'veyrnox-active-portfolio',
      'veyrnox-spam-overrides',
    ];
    await populateDevice();
    for (const k of TELLS) localStorage.setItem(k, 'x');

    // Before: inspection must SEE the tells (clean is honestly false).
    const before = await inspectKeyMaterial();
    expect(before.clean).toBe(false);
    for (const k of TELLS) expect(before.localStorageResidue).toContain(k);

    const report = await panicWipeLocal();

    // After: every tell is gone from storage AND the report says clean.
    for (const k of TELLS) expect(localStorage.getItem(k)).toBeNull();
    expect(report.localStorageResidue).toEqual([]);
    expect(report.clean).toBe(true);
    expect((await inspectKeyMaterial()).clean).toBe(true);
  });

  it('panicWipeLocal also deletes the separate app-data DB (forensic residue) — F-06', async () => {
    // veyrnox-appdata (src/api/localClient.js) holds entity rows that NAME addresses,
    // tx hashes, wallet labels, and alerts — NO key material, but forensic residue
    // tying the device to the destroyed wallet set. A thorough wipe must remove it
    // too. This deletion is additive and best-effort (mirrors deleteVaultDatabase),
    // so it is observed directly here rather than through inspectKeyMaterial().
    await populateDevice();
    await appDataPut('Wallet', [{ id: 'w1', address: '0xdeadbeef', name: 'My ETH' }]);
    await appDataPut('Transaction', [{ id: 't1', hash: '0xabc', to: '0xvictim' }]);
    // sanity: the named residue is present before the wipe.
    expect(await appDataGet('Wallet')).not.toBeNull();
    expect(await appDataGet('Transaction')).not.toBeNull();

    await panicWipeLocal();

    // After the wipe the database was deleted; reopening yields a fresh EMPTY store,
    // so every named row is gone.
    expect(await appDataGet('Wallet')).toBeNull();
    expect(await appDataGet('Transaction')).toBeNull();
  });

  // ── H2 part B: deniability uniformity — FIXED_LEN padding of the panic marker ──

  it('H2: panic is still correctly detected after padding (pad+strip round-trip)', async () => {
    // The marker is now padded to FIXED_LEN on encrypt and stripped on decrypt;
    // detection (an exact-match decrypt) must still fire for the right PIN and only
    // the right PIN — padding is inert to the trigger.
    await setPanicVault(PANIC_PW);
    expect(await tryPanicUnlock(PANIC_PW)).toBe(true);   // recognised after pad+strip
    expect(await tryPanicUnlock('wrong-guess-123')).toBe(false);
    // And the wipe still actually fires end-to-end from a padded marker.
    await populateDevice();                              // re-seed (PANIC_PW reused)
    expect(await tryPanicUnlock(PANIC_PW)).toBe(true);
    const report = await panicWipeLocal();
    expect(report.clean).toBe(true);
  });

  it('H2: a REAL panic blob and a CHAFF panic blob have BYTE-IDENTICAL ct length', async () => {
    // Chaff (provisionDeniabilityChaff -> setPanicVault with a throwaway pw) and a
    // personalized panic (setPanicVault with a user PIN) both pad to FIXED_LEN, so
    // their ciphertext lengths are identical — a coercer cannot tell a configured
    // panic from a chaff one by blob length.
    const { provisionDeniabilityChaff } = await import('../provisionChaff.js');
    await provisionDeniabilityChaff();           // chaff into 'tertiary'
    const chaffPanic = await getBlob('tertiary');
    await setPanicVault(PANIC_PW);                // overwrite with a real PIN
    const realPanic = await getBlob('tertiary');
    expect(unb64(chaffPanic.ct).length).toBe(unb64(realPanic.ct).length);
  });

  it("H2: the panic ('tertiary') and duress ('secondary') blobs are ct-length-identical", async () => {
    // Both deniability slots now pad their plaintext to the SAME FIXED_LEN, so the
    // two slots are length-indistinguishable regardless of mnemonic word count.
    await setDuressVault(generateMnemonic(256), DURESS_PW); // 24-word decoy
    await setPanicVault(PANIC_PW);
    const secondary = await getBlob('secondary');
    const tertiary = await getBlob('tertiary');
    expect(unb64(tertiary.ct).length).toBe(unb64(secondary.ct).length);
  });

  it('removing the panic PIN wipes nothing else', async () => {
    await populateDevice();
    await clearPanicVault();
    expect(await hasPanicVault()).toBe(false);
    // The primary vault, decoy, and hidden wallet are all intact.
    expect(await webKeyStore.hasVault()).toBe(true);
    expect(await hasDuressVault()).toBe(true);
    expect(await tryRevealHidden(HIDDEN_SECRET)).not.toBeNull();
  });
});
