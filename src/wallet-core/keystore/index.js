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
    // Native-only: metadata-only check of whether the stored vault is KEK-wrapped.
    // Used to reconcile the "hardware enrolled" badge against real protection.
    async hasVaultKekWrap() {
      return (await load()).nativeKeyStore.hasVaultKekWrap();
    },
    // Native-only: metadata-only read of the REAL hardware tier the vault's KEK
    // was enrolled under (StrongBox/TEE/SE), for the honest badge (H-1).
    async getVaultKekTier() {
      return (await load()).nativeKeyStore.getVaultKekTier();
    },
    async createVault(secret, password) {
      return (await load()).nativeKeyStore.createVault(secret, password);
    },
    // KEK-preserving content re-persist (KEK downgrade fix). On an enrolled vault
    // this keeps the kek-dek wrap; on a bare vault it writes bare like createVault.
    async saveVaultContents(secret, password, opts) {
      return (await load()).nativeKeyStore.saveVaultContents(secret, password, opts);
    },
    async unlock(password, opts) {
      return (await load()).nativeKeyStore.unlock(password, opts);
    },
    async changePassword(currentPassword, newPassword, opts) {
      return (await load()).nativeKeyStore.changePassword(currentPassword, newPassword, opts);
    },
    async enrollKek(password, opts) {
      return (await load()).nativeKeyStore.enrollKek(password, opts);
    },
    async unenrollKek(password, opts) {
      return (await load()).nativeKeyStore.unenrollKek(password, opts);
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
    // Native-only: deliver H for a KEK-enrolled vault unlock. Web omits this.
    // MUST forward opts verbatim: the v2 { kekSalt } binding travels through here,
    // and dropping it silently reverts every enrolled vault to the fixed v1 salt
    // (C-1 regression, 2026-07-05). Every other facade method already forwards.
    async getHardwareFactor(opts) {
      return (await load()).nativeKeyStore.getHardwareFactor(opts);
    },
    // Native-only: suppress background-lock hook for non-security OS dialogs.
    async suppressLock(fn) {
      return (await load()).nativeKeyStore.suppressLock(fn);
    },
  };
}

export { webKeyStore };

// Lock-suppression escape hatch for native file-picker operations. The Capacitor
// `pause` event fires when a native Activity (system file/document picker) comes
// to the foreground, which would otherwise fire the lock hook. On native this
// re-exports native.js's depth-counted suppressor; on web it is a transparent
// no-op — the `<input type="file">` path never pauses the app. Scope is narrow
// by intent: only file-picker call sites should use it.
export function withLockSuppressed(fn) {
  if (Capacitor.isNativePlatform()) {
    return import('./native.js').then((m) => m.withLockSuppressed(fn));
  }
  return Promise.resolve().then(fn);
}
