// Regression: persisted `veyrnox-demo=1` (from a prior `?demo=1` visit) must
// NOT enable DEMO on a device where a real vault was set up. Without this
// guard, the base44 data layer swaps to the empty-seeded demoBase44, which
// makes TransactionLimit.list() return [] (spend caps disarmed) and — via the
// raw DEMO flag — disarms send-gate re-auth, second-factor, simulation, and
// remote screening. Truth-check is the sync localStorage markers written at
// wallet creation: veyrnox-auth-model, veyrnox-wallet-meta, veyrnox-active-wallet.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function setupWindow(search = '') {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
  globalThis.window = /** @type {any} */ ({ location: { search } });
  globalThis.localStorage = /** @type {any} */ (localStorage);
  return { store };
}

async function loadDemo() {
  vi.resetModules();
  vi.doMock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => false },
  }));
  const mod = await import('@/api/demoClient');
  return mod.DEMO;
}

describe('demoClient stale-flag guard', () => {
  beforeEach(() => {
    // Clear any leaked globals from a prior test file.
    delete globalThis.window;
    delete globalThis.localStorage;
  });
  afterEach(() => {
    delete globalThis.window;
    delete globalThis.localStorage;
  });

  it('persisted veyrnox-demo=1 alone still enables DEMO on a device with no vault', async () => {
    const { store } = setupWindow('');
    store.set('veyrnox-demo', '1');
    const DEMO = await loadDemo();
    expect(DEMO).toBe(true);
    expect(store.get('veyrnox-demo')).toBe('1'); // untouched
  });

  it('persisted veyrnox-demo=1 is CLEARED and DEMO stays false when veyrnox-auth-model is present', async () => {
    const { store } = setupWindow('');
    store.set('veyrnox-demo', '1');
    store.set('veyrnox-auth-model', 'pin');
    const DEMO = await loadDemo();
    expect(DEMO).toBe(false);
    expect(store.has('veyrnox-demo')).toBe(false);
  });

  it('same guard fires for veyrnox-wallet-meta and veyrnox-active-wallet markers', async () => {
    for (const marker of ['veyrnox-wallet-meta', 'veyrnox-active-wallet']) {
      const { store } = setupWindow('');
      store.set('veyrnox-demo', '1');
      store.set(marker, '{}');
      const DEMO = await loadDemo();
      expect(DEMO).toBe(false);
      expect(store.has('veyrnox-demo')).toBe(false);
    }
  });

  it('`?demo=0` clears the flag even when a real vault exists (unchanged behaviour)', async () => {
    const { store } = setupWindow('?demo=0');
    store.set('veyrnox-demo', '1');
    store.set('veyrnox-auth-model', 'pin');
    const DEMO = await loadDemo();
    expect(DEMO).toBe(false);
    expect(store.has('veyrnox-demo')).toBe(false);
  });
});
