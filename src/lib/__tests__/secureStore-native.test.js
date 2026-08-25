// Tests for lib/secureStore.js on the NATIVE (Capacitor) path — pins the two
// invariants that keep the migration honest:
//
//   1. hydrateSecureStore migrates a legacy localStorage value into the native
//      secure store on first boot, then REMOVES the plaintext from
//      localStorage. Otherwise the migration would leave the value in TWO
//      places and every deniability guarantee about localStorage still holds
//      the pre-migration liability.
//
//   2. secureWipeAll clears the native store for every migrated key. Panic
//      wipe depends on this — iOS Keychain items survive app uninstall by
//      default, so a wipe that only touches localStorage leaves an
//      OS-observable tell (I3).

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  store: new Map(),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  KeychainAccess: { whenUnlockedThisDeviceOnly: 1 },
  SecureStorage: {
    setKeyPrefix: vi.fn(async () => {}),
    setSynchronize: vi.fn(async () => {}),
    setDefaultKeychainAccess: vi.fn(async () => {}),
    set: vi.fn(async (k, v) => { h.store.set(k, String(v)); }),
    get: vi.fn(async (k) => (h.store.has(k) ? h.store.get(k) : null)),
    remove: vi.fn(async (k) => { h.store.delete(k); }),
  },
}));

// Fresh module per test so hydrate's memoised promise + cache reset cleanly.
async function loadFresh() {
  vi.resetModules();
  return await import('@/lib/secureStore.js');
}

beforeEach(() => {
  h.store.clear();
  try { localStorage.clear(); } catch { /* noop */ }
});

describe('secureStore — native', () => {
  it('hydrate migrates a legacy localStorage value into the native store and removes the plaintext copy', async () => {
    localStorage.setItem('sdw_session_token', 'legacy-uuid');
    const mod = await loadFresh();

    await mod.hydrateSecureStore();

    // Native store now holds the value
    expect(h.store.get('sdw_session_token')).toBe('legacy-uuid');
    // localStorage plaintext is gone — the whole point of the migration
    expect(localStorage.getItem('sdw_session_token')).toBeNull();
    // And sync reads see it
    expect(mod.secureGet('sdw_session_token')).toBe('legacy-uuid');
  });

  it('secureWipeAll erases every migrated key from the native store', async () => {
    // Populate via hydrate's migration path (deterministically awaited), which
    // avoids racing secureSet's fire-and-forget write.
    localStorage.setItem('sdw_session_token', 'live-uuid');
    const mod = await loadFresh();
    await mod.hydrateSecureStore();
    expect(h.store.has('sdw_session_token')).toBe(true);
    expect(mod.secureGet('sdw_session_token')).toBe('live-uuid');

    await mod.secureWipeAll();

    expect(h.store.has('sdw_session_token')).toBe(false);
    expect(mod.secureGet('sdw_session_token')).toBeNull();
  });

  it('secureSet does not overwrite an already-hydrated native value with a stale localStorage copy on re-hydrate', async () => {
    // Native ahead of localStorage
    h.store.set('sdw_session_token', 'native-authoritative');
    localStorage.setItem('sdw_session_token', 'stale-legacy');
    const mod = await loadFresh();

    await mod.hydrateSecureStore();

    expect(mod.secureGet('sdw_session_token')).toBe('native-authoritative');
    // Legacy copy still removed once the native side holds the value
    expect(localStorage.getItem('sdw_session_token')).toBeNull();
  });
});
