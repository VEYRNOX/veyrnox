// lib/messageSigning.js — the opt-in "Message signing" preference.
//
// Message signing (signing arbitrary text with the wallet key on the
// /crypto-signing page) is OFF by default (fail-closed, I4): a wallet that
// never signs arbitrary messages is safer against blind-signing phishing, so
// the capability is only present when the user explicitly turns it on in
// Settings. This mirrors the biometric-2fa / audit-log preference convention:
// a single localStorage boolean, stored as "1" (on) / absent (off), plus a
// same-tab custom event so a mounted page re-reads live (the native `storage`
// event fires only in OTHER tabs).

// localStorage key for the preference. "1" = on; absent/anything-else = off.
export const MESSAGE_SIGNING_KEY = 'veyrnox-message-signing-enabled';

// Dispatched (best-effort) whenever the preference changes in THIS document, so
// a mounted CryptoSigning page re-reads via useMessageSigningEnabled().
export const MESSAGE_SIGNING_CHANGED_EVENT = 'veyrnox:message-signing-changed';

/** @returns {boolean} has the user turned Message signing on? (false unless exactly "1") */
export function isMessageSigningEnabled() {
  try {
    return localStorage.getItem(MESSAGE_SIGNING_KEY) === '1';
  } catch {
    return false;
  }
}

/** Persist the Message-signing preference and signal same-tab listeners. */
export function setMessageSigningEnabled(on) {
  try {
    if (on) localStorage.setItem(MESSAGE_SIGNING_KEY, '1');
    else localStorage.removeItem(MESSAGE_SIGNING_KEY);
  } catch {
    /* storage unavailable — preference is best-effort, non-fatal. */
  }
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event(MESSAGE_SIGNING_CHANGED_EVENT));
    }
  } catch {
    /* best-effort — a missing event bus must never block a pref write. */
  }
}
