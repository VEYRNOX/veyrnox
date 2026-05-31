// wallet-core/keystore/index.js — resolve the active KeyStore for this platform.
//
// M2a: web only. Every platform — including the Capacitor webview, which today
// runs the same IndexedDB vault — resolves to the web KeyStore, so behaviour is
// unchanged. The native (Design B, hardware-wrapped key) implementation is
// added in M2b and selected here behind Capacitor.isNativePlatform().

import { webKeyStore } from './web.js';

let _store = null;

/**
 * @returns {import('./keyStore.js').KeyStore} the KeyStore for this platform.
 */
export function getKeyStore() {
  if (_store) return _store;
  // M2b seam — native branch goes here:
  //   if (Capacitor.isNativePlatform()) { _store = nativeKeyStore; return _store; }
  _store = webKeyStore;
  return _store;
}

export { webKeyStore };
