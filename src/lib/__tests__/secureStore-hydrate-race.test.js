// REVIEW-B regression — kept in its OWN file on purpose.
//
// This test deliberately leaves secureSet's fire-and-forget write-through in
// flight at the moment hydrate resolves. Sharing a file with tests that call
// vi.resetModules() lets that pending write resume against a reset module
// registry — it then loads the REAL plugin instead of the mock and surfaces as
// an unhandled rejection, which vitest reports even when every assertion
// passes. Vitest isolates test FILES, so one file per race keeps it clean.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

const h = vi.hoisted(() => ({
  store: new Map(),
  // plugin.get() resolves only once this settles, but snapshots its return
  // value at CALL time — so a write landing in the meantime cannot change it.
  // That is the real bridge ordering, and it is what holds hydrate's read open
  // across the caller's write.
  getGate: null,
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  KeychainAccess: { whenUnlockedThisDeviceOnly: 1 },
  SecureStorage: {
    setKeyPrefix: vi.fn(async () => {}),
    setSynchronize: vi.fn(async () => {}),
    setDefaultKeychainAccess: vi.fn(async () => {}),
    set: vi.fn(async (k, v) => { h.store.set(k, String(v)); }),
    get: vi.fn((k) => {
      const snapshot = h.store.has(k) ? h.store.get(k) : null;
      return h.getGate ? h.getGate.then(() => snapshot) : Promise.resolve(snapshot);
    }),
    remove: vi.fn(async (k) => { h.store.delete(k); }),
  },
}));

beforeEach(() => {
  h.store.clear();
  h.getGate = null;
  try { localStorage.clear(); } catch { /* noop */ }
});

describe('secureStore — hydrate race', () => {
  // hydrate is fire-and-forget from main.jsx and crosses several
  // native-bridge round trips. A caller that reads before it settles (
  // ensureSessionToken on a cold native boot) sees an empty cache, mints a
  // fresh token and write-throughs it. hydrate must NOT then overwrite that
  // with the older stored value: SecurityCenter has already registered a
  // UserSession record under the fresh token, and if getSessionToken() reverts
  // to the old one, SessionRevocationGuard polls a record that does not exist
  // and revoking the device silently stops working.
  it('hydrate does not clobber a token written while it was awaiting the native bridge', async () => {
    h.store.set('sdw_session_token', 'stored-A');
    // Hold hydrate's read open across the caller's write. plugin.get snapshots
    // at call time, so it still resolves with the OLD value — the real bridge
    // ordering on a cold native boot.
    let releaseGet;
    h.getGate = new Promise((r) => { releaseGet = r; });
    const mod = await import('@/lib/secureStore.js');

    const hydrating = mod.hydrateSecureStore();
    await vi.waitFor(() => expect(SecureStorage.get).toHaveBeenCalled());
    mod.secureSet('sdw_session_token', 'fresh-B'); // caches synchronously
    releaseGet();
    await hydrating;

    expect(mod.secureGet('sdw_session_token')).toBe('fresh-B');
    // The legacy plaintext sweep still has to run for that key.
    expect(localStorage.getItem('sdw_session_token')).toBeNull();
    // Flush secureSet's fire-and-forget write-through before the test ends:
    // cache and native store must agree, and a write left in flight resolves
    // after the NEXT test's vi.resetModules() against the real (unmocked)
    // plugin, which vitest reports as an unhandled rejection.
    await vi.waitFor(() => expect(h.store.get('sdw_session_token')).toBe('fresh-B'));
  });

});
