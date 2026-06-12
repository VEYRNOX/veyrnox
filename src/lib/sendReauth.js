// src/lib/sendReauth.js
//
// Pure recent-auth-window math for send-time step-up. A send is friction-free while
// the session was authenticated recently; once the window lapses, step-up is required.
// The window MUST reset only on auth events (unlock / successful step-up), never on
// general activity — see WalletProvider (lastAuthAtRef).

export const REAUTH_WINDOW_MS = 2 * 60 * 1000; // 2 minutes (fixed v1 default)

/**
 * @param {{ lastAuthAt: number|null, now: number, windowMs?: number }} args
 * @returns {boolean} true when step-up re-auth is required before a send.
 */
export function sendReauthRequired({ lastAuthAt, now, windowMs = REAUTH_WINDOW_MS }) {
  if (lastAuthAt == null) return true;
  return now - lastAuthAt > windowMs;
}
