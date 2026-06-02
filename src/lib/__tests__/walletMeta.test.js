// lib/__tests__/walletMeta.test.js
//
// The non-secret per-wallet metadata layer. These tests pin the behaviours the
// rest of the multi-wallet feature relies on: default asset set, backup-flag
// tracking, active-wallet selection, and — most importantly — RECONCILE, which
// self-heals the localStorage meta against the authoritative seed list so a
// cleared/lost meta store can never silently mark a wallet "backed up".

import { describe, it, expect, beforeEach } from 'vitest';

// The vitest/jsdom environment here ships a non-functional localStorage (see the
// "--localstorage-file" warning in the test run; no existing test relies on it).
// Install a real in-memory Storage shim scoped to THIS file so the persistence
// these tests exercise actually round-trips, without perturbing other suites.
class MemStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
globalThis.localStorage = new MemStorage();

import {
  DEFAULT_ENABLED_ASSETS,
  getWalletMeta,
  ensureWalletMeta,
  setWalletName,
  setWalletBackedUp,
  setEnabledAssets,
  toggleWalletAsset,
  removeWalletMeta,
  getActiveWalletId,
  setActiveWalletId,
  reconcileWalletMeta,
  clearAllWalletMeta,
} from '../walletMeta.js';

beforeEach(() => {
  clearAllWalletMeta();
  try { localStorage.clear(); } catch { /* noop */ }
});

describe('walletMeta — defaults', () => {
  it('returns safe defaults for an unknown wallet', () => {
    const m = getWalletMeta('unknown', 'Wallet 1');
    expect(m.name).toBe('Wallet 1');
    expect(m.backedUp).toBe(false);
    expect(m.enabledAssets).toEqual([...DEFAULT_ENABLED_ASSETS]);
  });

  it('ensureWalletMeta is idempotent and seeds initial values', () => {
    ensureWalletMeta('a', { name: 'Savings', backedUp: true, enabledAssets: ['ETH'] });
    const first = getWalletMeta('a');
    expect(first.name).toBe('Savings');
    expect(first.backedUp).toBe(true);
    expect(first.enabledAssets).toEqual(['ETH']);
    // Second call must not overwrite.
    ensureWalletMeta('a', { name: 'Changed', backedUp: false });
    expect(getWalletMeta('a').name).toBe('Savings');
  });
});

describe('walletMeta — mutations', () => {
  it('rename, backup flag, and asset toggles persist', () => {
    ensureWalletMeta('a', { name: 'W', backedUp: false });
    setWalletName('a', '  My Wallet  ');
    expect(getWalletMeta('a').name).toBe('My Wallet');

    setWalletBackedUp('a', true);
    expect(getWalletMeta('a').backedUp).toBe(true);

    setEnabledAssets('a', ['BTC', 'ETH', 'NONSENSE']); // unknown dropped, canonical order
    expect(getWalletMeta('a').enabledAssets).toEqual(['ETH', 'BTC']);

    const after = toggleWalletAsset('a', 'BTC'); // remove BTC
    expect(after).toEqual(['ETH']);
    toggleWalletAsset('a', 'SOL'); // add SOL
    expect(getWalletMeta('a').enabledAssets).toEqual(['ETH', 'SOL']);
  });

  it('name is length-capped', () => {
    ensureWalletMeta('a');
    setWalletName('a', 'x'.repeat(100));
    expect(getWalletMeta('a').name.length).toBe(40);
  });

  it('removeWalletMeta deletes a record', () => {
    ensureWalletMeta('a', { name: 'A' });
    removeWalletMeta('a');
    expect(getWalletMeta('a', 'fallback').name).toBe('fallback');
  });
});

describe('walletMeta — active wallet', () => {
  it('round-trips the active id', () => {
    expect(getActiveWalletId()).toBeNull();
    setActiveWalletId('a');
    expect(getActiveWalletId()).toBe('a');
    setActiveWalletId(null);
    expect(getActiveWalletId()).toBeNull();
  });
});

describe('walletMeta — reconcile (self-heal vs authoritative seed list)', () => {
  it('creates default meta for new ids and prunes orphans', () => {
    ensureWalletMeta('gone', { name: 'Orphan', backedUp: true });
    const { activeWalletId, metaById } = reconcileWalletMeta(['a', 'b']);
    expect(Object.keys(metaById).sort()).toEqual(['a', 'b']);
    expect(metaById.a.name).toBe('Wallet 1');
    expect(metaById.b.name).toBe('Wallet 2');
    expect(metaById.a.backedUp).toBe(false); // safe default: warn
    expect(activeWalletId).toBe('a');         // first wallet
    // Orphan pruned.
    expect(getWalletMeta('gone', 'fb').name).toBe('fb');
  });

  it('preserves existing meta and keeps a valid active id', () => {
    ensureWalletMeta('a', { name: 'Main', backedUp: true });
    setActiveWalletId('a');
    const { activeWalletId, metaById } = reconcileWalletMeta(['a', 'b']);
    expect(metaById.a.name).toBe('Main');
    expect(metaById.a.backedUp).toBe(true);
    expect(activeWalletId).toBe('a');
  });

  it('repairs an active id that points at a removed wallet', () => {
    setActiveWalletId('deleted');
    const { activeWalletId } = reconcileWalletMeta(['x', 'y']);
    expect(activeWalletId).toBe('x');
  });

  it('a lost meta store degrades to unbacked-up (warns more, never less)', () => {
    // Simulate a vault with wallets but NO meta (e.g. localStorage wiped).
    const { metaById } = reconcileWalletMeta(['a', 'b', 'c']);
    expect(Object.values(metaById).every((m) => m.backedUp === false)).toBe(true);
  });
});
