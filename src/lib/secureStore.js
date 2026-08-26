// @ts-nocheck
// lib/secureStore.js — thin native-secure-storage wrapper for MIGRATED keys.
//
// SCOPE. This wraps @aparajita/capacitor-secure-storage (iOS Keychain / Android
// Keystore, whenUnlockedThisDeviceOnly, non-syncable) behind a SYNCHRONOUS API
// so callers that live in JSX render paths (e.g. SessionRevocationGuard) do
// not have to become async. The underlying plugin is async only; we mirror the
// live value in a module-level Map, hydrated once at boot from the native
// store, and write-through fire-and-forget after that. The migrated values
// (see MIGRATED_KEYS below) are best-effort: a persistence hiccup regenerates
// on next boot rather than blocking a control path.
//
// WHAT NOT TO PUT HERE.
//   • Never put a value in here whose PRESENCE is a deniability tell. The vault
//     seed, the biometric password cache, and the wallet-core PRF/passkey cred
//     ids all live elsewhere for a reason — see CLAUDE.md's I3 note and the
//     recon report accompanying this PR: iOS Keychain items survive app
//     uninstall unless explicitly deleted, so anything migrated here MUST also
//     be listed in secureWipeAll()'s call from panic.js. If a key is a tell
//     that would be re-observable after uninstall, it does NOT belong here.
//   • Never store material that decrypts the vault (vault password, seed, key
//     material). Those paths already exist (biometricUnlock.js, wallet-core
//     keystore) and this wrapper is deliberately narrower than them.
//
// WEB FALLBACK. The web build has no OS Keychain to route to; this file
// therefore keeps localStorage there, HONESTLY. That is unchanged from the
// pre-migration state on web — no security regression — and matches how
// biometricUnlock.js documents its web/demo path.

import { Capacitor } from '@capacitor/core';

const NATIVE_PREFIX = 'veyrnox_';

// The set of keys migrated by this module. Kept as the source of truth so
// hydrate/wipe/migration cannot drift out of step with the actual set.
export const MIGRATED_KEYS = Object.freeze([
  'sdw_session_token',
]);

const _cache = new Map();
let _hydratePromise = null;

/**
 * Lazy plugin load — never reaches the web/test bundle.
 * @returns {Promise<any|null>} the SecureStorage singleton, or null on non-native.
 */
async function loadPlugin() {
  if (!Capacitor.isNativePlatform()) return null;
  const mod = await import('@aparajita/capacitor-secure-storage');
  await mod.SecureStorage.setKeyPrefix(NATIVE_PREFIX);
  await mod.SecureStorage.setSynchronize(false);
  await mod.SecureStorage.setDefaultKeychainAccess(
    mod.KeychainAccess.whenUnlockedThisDeviceOnly,
  );
  return mod.SecureStorage;
}

/**
 * Preload the migrated keys from the native store into the sync cache. Also
 * runs the one-shot migration: any legacy localStorage value for a migrated
 * key is copied to the native store and then removed from localStorage.
 *
 * Idempotent; a second call awaits the first. Safe to call before render on
 * every platform (web is a no-op that resolves immediately).
 *
 * FAIL-OPEN by design: a plugin/permission fault must not block app startup.
 * A missed hydrate degrades to "no cached secret" — the caller's fallback
 * path (regenerate a random token) still works.
 *
 * @returns {Promise<void>}
 */
export function hydrateSecureStore() {
  if (_hydratePromise) return _hydratePromise;
  _hydratePromise = (async () => {
    if (!Capacitor.isNativePlatform()) return;
    let plugin = null;
    try { plugin = await loadPlugin(); } catch { return; }
    if (!plugin) return;
    for (const k of MIGRATED_KEYS) {
      let native = null;
      try {
        const v = await plugin.get(k, false);
        const s = v == null ? null : String(v);
        native = (s && s.length > 0) ? s : null;
      } catch { /* missing entry — noop */ }

      // A caller can write this key WHILE we are on the bridge — secureSet()
      // populates the cache SYNCHRONOUSLY and persists async — so this has to
      // be re-read AFTER the await, not before the loop. A present entry is
      // newer than anything the store held when hydrate started, and it wins:
      // clobbering it hands callers a stale token they have already stopped
      // using. Concretely, ensureSessionToken() mints a token on a cold native
      // boot and SecurityCenter registers a UserSession record under it; if
      // getSessionToken() then reverts to the older value,
      // SessionRevocationGuard polls a record that does not exist and revoking
      // that device silently stops locking the wallet.
      const fresher = _cache.has(k);

      // One-shot migration: legacy localStorage value → native store. Only if
      // native has nothing (never overwrite an existing native value) and no
      // caller got there first — writing the legacy value here would race
      // secureSet's own write-through for the same key.
      if (native == null && !fresher) {
        let legacy = null;
        try { legacy = localStorage.getItem(k); } catch { /* storage unavailable */ }
        if (legacy != null && legacy.length > 0) {
          try {
            await plugin.set(k, legacy);
            native = legacy;
          } catch { /* write failed — leave localStorage alone as fallback */ }
        }
      }

      // Remove the legacy copy IF the value now lives in the OS store —
      // deniability requires the plaintext not to sit in localStorage once it
      // does. A fresher in-session write counts: secureSet already persisted it.
      if (native != null || fresher) {
        try { localStorage.removeItem(k); } catch { /* noop */ }
      }
      if (native != null && !fresher) _cache.set(k, native);
    }
  })();
  return _hydratePromise;
}

/**
 * Synchronous read. On native, reads the hydrated cache; if hydrate has not
 * completed, returns null (fail-closed for the security control's perspective;
 * the caller's ensureX() path regenerates as needed).
 * On web, falls back to localStorage (unchanged from pre-migration).
 * @param {string} key
 * @returns {string|null}
 */
export function secureGet(key) {
  if (Capacitor.isNativePlatform()) {
    return _cache.has(key) ? _cache.get(key) : null;
  }
  try { return localStorage.getItem(key); } catch { return null; }
}

/**
 * Fire-and-forget write. Native: updates cache immediately + persists async.
 * A silent persistence failure means the value is regenerated on next boot,
 * which is the current best-effort contract of every caller here.
 * @param {string} key
 * @param {string} value
 */
export function secureSet(key, value) {
  if (value == null) { secureRemove(key); return; }
  const s = String(value);
  if (Capacitor.isNativePlatform()) {
    _cache.set(key, s);
    (async () => {
      try {
        const plugin = await loadPlugin();
        if (plugin) await plugin.set(key, s);
      } catch { /* best-effort — cache is authoritative for this session */ }
    })();
    return;
  }
  try { localStorage.setItem(key, s); } catch { /* noop */ }
}

/** Fire-and-forget delete. */
export function secureRemove(key) {
  if (Capacitor.isNativePlatform()) {
    _cache.delete(key);
    (async () => {
      try {
        const plugin = await loadPlugin();
        if (plugin) await plugin.remove(key);
      } catch { /* noop */ }
    })();
    return;
  }
  try { localStorage.removeItem(key); } catch { /* noop */ }
}

/**
 * Synchronously erase EVERY migrated key from the sync cache AND kick off the
 * native-store wipe. Called from panic.js so a wipe empties Keychain/Keystore
 * for our items too — iOS Keychain survives app uninstall by default, so the
 * localStorage-only wipe would leave forensic residue in the OS store (I3).
 *
 * Returns a promise that resolves once the native deletes are done. panic.js
 * awaits it so inspectKeyMaterial() reflects the true post-wipe state.
 * @returns {Promise<void>}
 */
export async function secureWipeAll() {
  _cache.clear();
  if (!Capacitor.isNativePlatform()) return;
  let plugin = null;
  try { plugin = await loadPlugin(); } catch { return; }
  if (!plugin) return;
  for (const k of MIGRATED_KEYS) {
    try { await plugin.remove(k); } catch { /* may already be gone */ }
  }
}

/**
 * Read the native store back and report what SURVIVED — the honest counterpart
 * to secureWipeAll(), which swallows every failure by design (a wipe must not
 * throw). Without this, panic.js's inspectKeyMaterial() had no way to see the
 * OS store at all: a Keychain/Keystore delete that silently failed still
 * produced `clean: true`, and because hydrate removes the localStorage copy the
 * moment the native store holds the value, the localStorage sweep could not
 * catch it either. Same shape as inspectKeyMaterial's sideDatabases* pair — a
 * store we could not read is reported UNVERIFIED, never as clean (I4).
 *
 * HONEST LIMITATION. The plugin signals "no such entry" by throwing, and gives
 * us no way to tell that apart from a genuine read error, so a throw is counted
 * as absent. A value that READS BACK is definitely residue; a read that fails
 * for an unexpected reason is not detected. Widening this needs a plugin API
 * that distinguishes the two.
 *
 * On web there is no native store, so the result is vacuously verified+empty;
 * the localStorage residue sweep already covers that platform.
 *
 * @returns {Promise<{residue: string[], verified: boolean}>}
 */
export async function inspectSecureStore() {
  if (!Capacitor.isNativePlatform()) return { residue: [], verified: true };
  let plugin = null;
  try { plugin = await loadPlugin(); } catch { return { residue: [], verified: false }; }
  if (!plugin) return { residue: [], verified: false };
  const residue = [];
  for (const k of MIGRATED_KEYS) {
    try {
      const v = await plugin.get(k, false);
      if (v != null && String(v).length > 0) residue.push(k);
    } catch { /* absent — the desired post-wipe state; see limitation above */ }
  }
  return { residue, verified: true };
}

/** Test-only: reset internal state so unit tests can re-hydrate cleanly. */
export function __resetSecureStoreForTest() {
  _cache.clear();
  _hydratePromise = null;
}
