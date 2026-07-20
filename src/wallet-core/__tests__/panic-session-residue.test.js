// wallet-core/__tests__/panic-session-residue.test.js
//
// C-1 residue-completeness: panic.js swept localStorage / IndexedDB / cookies but
// had ZERO sessionStorage references, so 'veyrnox-recent-pages' (the More-drawer
// recents list — which names '/duress-pin', '/stealth-wallets', '/panic-wipe')
// survived a panic wipe AND survived the post-wipe reload by spec (sessionStorage
// is per-tab, not per-navigation). A coercer opening the app after a wipe could
// read the destroyed wallet's security-page history.
//
// Same erase+verify discipline as ALL_RESIDUE_KEYS: one list drives BOTH the
// erase (clearSessionResidue) and the inspection (readSessionResidue →
// inspectKeyMaterial().sessionStorageResidue / .clean).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { panicWipeLocal, inspectKeyMaterial, clearWipeMarker } from '../panic.js';
import { clearVault } from '../evm/vaultStore.js';

const RECENTS_KEY = 'veyrnox-recent-pages';

describe('panic wipe — sessionStorage residue (C-1)', () => {
  beforeEach(async () => {
    try { await clearVault(); } catch { /* noop */ }
    try { await panicWipeLocal(); } catch { /* noop */ }
    try { clearWipeMarker(); } catch { /* noop */ }
    sessionStorage.clear();
  });

  it('inspectKeyMaterial() enumerates the recents key pre-wipe and reports not-clean', async () => {
    sessionStorage.setItem(
      RECENTS_KEY,
      JSON.stringify(['/duress-pin', '/stealth-wallets', '/panic-wipe']),
    );
    const before = await inspectKeyMaterial();
    expect(before.sessionStorageResidue).toContain(RECENTS_KEY);
    expect(before.clean).toBe(false);
  });

  it('panicWipeLocal() removes the recents key and leaves clean=true', async () => {
    sessionStorage.setItem(RECENTS_KEY, JSON.stringify(['/duress-pin']));
    const report = await panicWipeLocal();
    expect(sessionStorage.getItem(RECENTS_KEY)).toBeNull();
    expect(report.sessionStorageResidue).toEqual([]);
    expect(report.clean).toBe(true);
    expect((await inspectKeyMaterial()).clean).toBe(true);
  });

  it('reports clean when no session residue exists', async () => {
    const report = await inspectKeyMaterial();
    expect(report.sessionStorageResidue).toEqual([]);
    expect(report.sessionStorageVerified).toBe(true);
    expect(report.clean).toBe(true);
  });
});

// P2-2: erase-and-VERIFY. readSessionResidue() returned [] when sessionStorage
// access threw, so inspectKeyMaterial().clean could report TRUE while residue was
// never verifiably removed — a fail-OPEN claim of destruction. An unreadable
// sessionStorage must be reported as UNVERIFIED and must not be called clean.
describe('panic wipe — unverifiable sessionStorage must not be reported clean (P2-2)', () => {
  // jsdom's Storage is a Proxy, so vi.spyOn(sessionStorage, 'getItem') writes a
  // STORED ITEM instead of overriding the method. Swap the whole accessor instead.
  const real = window.sessionStorage;
  function install(stub) {
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get: () => stub });
  }

  afterEach(() => {
    install(real);
    real.clear();
  });

  it('inspectKeyMaterial() reports sessionStorageVerified=false and clean=false when reads throw', async () => {
    install({
      getItem() { throw new Error('SecurityError'); },
      setItem() { throw new Error('SecurityError'); },
      removeItem() { throw new Error('SecurityError'); },
    });

    const report = await inspectKeyMaterial();

    expect(report.sessionStorageVerified).toBe(false);
    expect(report.clean).toBe(false);
  });

  it('panicWipeLocal() does not claim clean when the residue read is unverifiable', async () => {
    install({
      getItem() { throw new Error('SecurityError'); },
      setItem() { throw new Error('SecurityError'); },
      removeItem() { throw new Error('SecurityError'); },
    });

    const report = await panicWipeLocal();

    expect(report.sessionStorageVerified).toBe(false);
    expect(report.clean).toBe(false);
  });

  it('a removal failure surfaces as not-clean (the key is still readable)', async () => {
    real.setItem(RECENTS_KEY, JSON.stringify(['/duress-pin']));
    install({
      getItem: (k) => real.getItem(k),
      setItem: (k, v) => real.setItem(k, v),
      removeItem() { throw new Error('SecurityError'); },
    });

    const report = await panicWipeLocal();

    expect(report.sessionStorageResidue).toContain(RECENTS_KEY);
    expect(report.clean).toBe(false);
  });
});
