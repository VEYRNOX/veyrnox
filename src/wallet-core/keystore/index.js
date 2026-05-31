// wallet-core/keystore/index.js — resolve the active KeyStore for this platform.
//
// M2a: web only. M2b: adds the native (Design B — hardware-gated unlock +
// hardware-backed at-rest storage) branch, selected here behind
// Capacitor.isNativePlatform().
//
// The native implementation (./native.js) imports Capacitor plugins, so it is
// loaded LAZILY via dynamic import and ONLY on a real native platform. On web
// and in tests the dynamic import is never triggered: getKeyStore() returns the
// unchanged webKeyStore, and ./native.js (with its plugin imports) is never
// evaluated. This keeps the web vault path and the test suite byte-identical.

import { Capacitor } from '@capacitor/core';
import { webKeyStore } from './web.js';

let _store = null;

/**
 * @returns {import('./keyStore.js').KeyStore} the KeyStore for this platform.
 */
export function getKeyStore() {
  if (_store) return _store;
  _store = Capacitor.isNativePlatform() ? makeNativeFacade() : webKeyStore;
  return _store;
}

// A thin, synchronous facade over the native KeyStore. getKeyStore() must return
// synchronously (WalletProvider resolves it at module scope), but ./native.js
// must be code-split so its plugin imports never reach the web bundle/runtime.
// The facade dynamic-imports ./native.js on first use and delegates. No method
// here uses `this`, so callers may extract bare references (WalletProvider does
// this for hasVault/clearVault) safely.
function makeNativeFacade() {
  let mod = null; // resolved module, for synchronous access after first load
  let loading = null;

  const load = () => {
    if (mod) return Promise.resolve(mod);
    if (!loading) loading = import('./native.js').then((m) => { mod = m; return m; });
    return loading;
  };

  return {
    async isSecureHardwareAvailable() {
      return (await load()).nativeKeyStore.isSecureHardwareAvailable();
    },
    async hasVault() {
      return (await load()).nativeKeyStore.hasVault();
    },
    async createVault(secret, password) {
      return (await load()).nativeKeyStore.createVault(secret, password);
    },
    async unlock(password) {
      return (await load()).nativeKeyStore.unlock(password);
    },
    // Synchronous, matching the interface. If native isn't loaded yet there is
    // nothing unlocked to clear; once loaded, delegate to the real lock().
    lock() {
      if (mod) mod.nativeKeyStore.lock();
    },
    async clearVault() {
      return (await load()).nativeKeyStore.clearVault();
    },
    // Native-only extension (see native.js). Loading native here also registers
    // the background listeners early. Web's keyStore omits this method.
    setLockHook(cb) {
      load().then((m) => m.nativeKeyStore.setLockHook(cb));
    },
  };
}

export { webKeyStore };
