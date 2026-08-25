// lib/sessionRevocation.js — HONEST local enforcement of session revocation.
//
// HOW SESSIONS ACTUALLY WORK IN THIS APP (read before changing anything):
//   - A "session" in the device list is a `UserSession` ENTITY record, keyed by
//     a random `session_token` (a UUID persisted under `sdw_session_token`).
//     Security Center registers the current device on mount; Session Manager
//     lists/revokes these records. In demo this store is client-side; with a
//     backend it is the shared entity store.
//   - This entity is SEPARATE from the actual access control. Fund/signing
//     access is gated by WalletProvider's in-memory decrypted mnemonic
//     (unlock() loads it, lock() clears it, plus idle/background auto-lock).
//     The account-login session auth is a third, separate thing.
//   - PREVIOUS BEHAVIOUR (the theatre): "Revoke" wrote status:"revoked" on the
//     UserSession record and NOTHING read it — access was unchanged. A revoked
//     session did not affect anything.
//
// WHAT REVOCATION NOW HONESTLY DOES (the tractable, real part):
//   - Each device self-enforces: when a device sees that ITS OWN session record
//     (the one matching its `sdw_session_token`) has been revoked, it LOCKS
//     the wallet (drops the in-memory secret → no signing/fund access) and
//     clears its local session token, forcing re-authentication (password) to
//     continue.
//   - This is REAL access control for a non-custodial local-vault app:
//     revoking a device signs it out of its wallet session.
//
// WHAT IT HONESTLY DOES *NOT* DO (do not claim otherwise in the UI):
//   - It cannot REMOTELY force-close another device in real time — there is
//     no server push channel here. Revoking another device takes effect the
//     next time THAT device is opened / polls the store and notices its own
//     session was revoked. The current device is signed out immediately;
//     others are eventual. The UI copy reflects exactly this ("signs that
//     device out / requires re-auth", never "instantly kills a remote
//     session").
//
// STORAGE. On native (iOS/Android) the token lives in the OS secure store
// (iOS Keychain / Android Keystore, whenUnlockedThisDeviceOnly) via
// lib/secureStore.js — a random UUID that gates re-auth is arguable-secret,
// and the OS store is the right place for it. On web there is no OS store;
// the wrapper transparently falls back to localStorage (unchanged from before
// this migration). The reads here are synchronous against a cache hydrated
// once at boot; see main.jsx and secureStore.js hydrateSecureStore().
//
// This module is pure helpers + the token accessor. The enforcement
// side-effect (lock) lives in components/SessionRevocationGuard.jsx, which
// mounts in Layout. Nothing here touches the vault, keystore, or any key
// material.

import { secureGet, secureSet, secureRemove } from '@/lib/secureStore';

export const SESSION_TOKEN_KEY = 'sdw_session_token';

/** The current device's session token, or null if none/unavailable. */
export function getSessionToken() {
  return secureGet(SESSION_TOKEN_KEY);
}

/** Return the existing token, generating+persisting one if absent. */
export function ensureSessionToken() {
  const existing = secureGet(SESSION_TOKEN_KEY);
  if (existing) return existing;
  try {
    const t = crypto.randomUUID();
    secureSet(SESSION_TOKEN_KEY, t);
    return t;
  } catch {
    return null;
  }
}

/** Forget the current device's session token (used when signing this device out). */
export function clearSessionToken() {
  secureRemove(SESSION_TOKEN_KEY);
}

/** Find the session record belonging to `token` (this device), or null. */
export function findCurrentSession(sessions, token) {
  if (!token) return null;
  return (sessions || []).find((s) => s && s.session_token === token) || null;
}

/**
 * Is THIS device's session record marked revoked? Pure predicate over an
 * already-fetched session list — the guard uses this to decide whether to lock.
 */
export function isCurrentSessionRevoked(sessions, token) {
  const s = findCurrentSession(sessions, token);
  return !!s && s.status === 'revoked';
}
