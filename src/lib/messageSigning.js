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

import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

// localStorage key for the preference. "1" = on; absent/anything-else = off.
export const MESSAGE_SIGNING_KEY = 'veyrnox-message-signing-enabled';

// Dispatched (best-effort) whenever the preference changes in THIS document, so
// a mounted CryptoSigning page re-reads via useMessageSigningEnabled().
export const MESSAGE_SIGNING_CHANGED_EVENT = 'veyrnox:message-signing-changed';

/**
 * @returns {boolean} has the user turned Message signing on? (false unless exactly "1")
 *
 * Codex P1 2026-08-15 — K-2 chokepoint: a decoy/hidden session must NOT see
 * the real user's message-signing pref, because the pref state is a tell
 * (a coercer reading the Settings toggle learns something about the real
 * account). Fail-closed to `false` for deniable sessions — matches the
 * pattern in `lib/consent.js`. Reading real localStorage under the hood
 * would still leak via network-inspection tools, but that is a separate
 * threat model; the JS-caller surface is safe.
 */
export function isMessageSigningEnabled() {
  if (isDeniabilityOrDemoActive()) return false;
  try {
    return localStorage.getItem(MESSAGE_SIGNING_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Persist the Message-signing preference and signal same-tab listeners.
 *
 * Codex P1 2026-08-15 — K-2 chokepoint: a decoy/hidden session must NOT
 * mutate the real user's stored preference. No-op in deniable sessions —
 * the toggle in the decoy Settings page will click but never persist.
 */
export function setMessageSigningEnabled(on) {
  if (isDeniabilityOrDemoActive()) return;
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
