// lib/sessionRevocation.js — HONEST local enforcement of session revocation.
//
// HOW SESSIONS ACTUALLY WORK IN THIS APP (read before changing anything):
//   - A "session" in the device list is a `UserSession` ENTITY record, keyed by
//     a random `session_token` (a UUID stored in localStorage under
//     `sdw_session_token`). Security Center registers the current device on
//     mount; Session Manager lists/revokes these records. In demo this store is
//     client-side; with a backend it is the shared base44 store.
//   - This entity is SEPARATE from the actual access control. Fund/signing access
//     is gated by WalletProvider's in-memory decrypted mnemonic (unlock() loads
//     it, lock() clears it, plus idle/background auto-lock). The account-login
//     session (base44.auth) is a third, separate thing.
//   - PREVIOUS BEHAVIOUR (the theatre): "Revoke" wrote status:"revoked" on the
//     UserSession record and NOTHING read it — access was unchanged. A revoked
//     session did not affect anything.
//
// WHAT REVOCATION NOW HONESTLY DOES (the tractable, real part):
//   - Each device self-enforces: when a device sees that ITS OWN session record
//     (the one matching its `sdw_session_token`) has been revoked, it LOCKS the
//     wallet (drops the in-memory secret → no signing/fund access) and clears its
//     local session token, forcing re-authentication (password) to continue.
//   - This is REAL access control for a non-custodial local-vault app: revoking
//     a device signs it out of its wallet session.
//
// WHAT IT HONESTLY DOES *NOT* DO (do not claim otherwise in the UI):
//   - It cannot REMOTELY force-close another device in real time — there is no
//     server push channel here. Revoking another device takes effect the next
//     time THAT device is opened / polls the store and notices its own session
//     was revoked. The current device is signed out immediately; others are
//     eventual. The UI copy reflects exactly this ("signs that device out /
//     requires re-auth", never "instantly kills a remote session").
//
// This module is pure helpers + the token accessor. The enforcement side-effect
// (lock) lives in components/SessionRevocationGuard.jsx, which mounts in Layout.
// Nothing here touches the vault, keystore, or any key material.

export const SESSION_TOKEN_KEY = 'sdw_session_token';

/** The current device's session token, or null if none/unavailable. */
export function getSessionToken() {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Return the existing token, generating+persisting one if absent. */
export function ensureSessionToken() {
  try {
    let t = localStorage.getItem(SESSION_TOKEN_KEY);
    if (!t) {
      t = crypto.randomUUID();
      localStorage.setItem(SESSION_TOKEN_KEY, t);
    }
    return t;
  } catch {
    return null;
  }
}

/** Forget the current device's session token (used when signing this device out). */
export function clearSessionToken() {
  try {
    localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    /* storage unavailable — best-effort */
  }
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
