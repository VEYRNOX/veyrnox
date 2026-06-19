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

    // A re-inspection confirms the same. NOTE: this MUST run before the probe
    // calls below — tryRevealHidden() calls getOrCreateStealthSalt(), which
    // regenerates 'veyrnox-stealth-slot-salt' in localStorage as a side-effect.
    // Since that key is now a tracked residue key, probing after the wipe would
    // re-create a tell the inspector honestly reports — so we confirm cleanliness
    // first, then probe the (still-wiped) key-material paths.
    const after = await inspectKeyMaterial();
    expect(after.clean).toBe(true);

    // And every path that previously opened key material now misses.
    expect(await webKeyStore.hasVault()).toBe(false);
    expect(await hasDuressVault()).toBe(false);
    expect(await tryRevealHidden(HIDDEN_SECRET)).toBeNull();
    expect(await hasPanicVault()).toBe(false);
  });

  it('wipes the deniability tells in localStorage and reports them honestly (C-1)', async () => {
    // The forensic artifacts a panic wipe must also destroy — leaving any of these
    // proves the coercion-resistance stack was in use (and the decoy salt + a
    // coerced PIN reproduces the deterministic decoy). Internal audit C-1, extended
    // per AI-review F-02/F-03/F-05 (stealth-slot salt, audit-device salt, passkey
    // config). This pins the FULL membership of DENIABILITY_RESIDUE_KEYS, so a key
    // dropped from the wipe list — leaving a tell behind while clean still reports
    // true — fails here (also guards F-04).
    const TELLS = [
      'veyrnox-pin-decoy-salt',
      'veyrnox-auth-model',
      'veyrnox-audit-log',
      'veyrnox-stealth-slot-salt',
      'veyrnox-audit-device-salt',
      'veyrnox-passkey-unlock',
      'veyrnox-passkey-cred',
      'veyrnox-2fa-passkey',
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
