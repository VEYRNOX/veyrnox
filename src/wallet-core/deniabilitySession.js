// wallet-core/deniabilitySession.js
//
// RUNTIME DENIABILITY-SESSION MARKER (I3).  PROVISIONAL.
//
// THE PROBLEM. A decoy (duress) or hidden (stealth) session is the I3 case that
// matters most under coercion: the app must make ZERO backend/device calls that
// could betray that a real wallet exists or leak the coerced user's activity.
// But decoy/hidden session state is deliberately held in React state ONLY
// (WalletProvider's isDecoy/isHidden) and is NEVER persisted to localStorage —
// persisting it would itself be a forensic deniability TELL. So wallet-core
// modules (which run outside React and must gate network/device egress, e.g.
// hw/trezor.js reaching connect.trezor.io) cannot read isDecoy/isHidden from
// storage. The previous Trezor "deniability guard" only checked the demo flag
// (`veyrnox-demo=1`), so a REAL coerced decoy/hidden session was NOT blocked —
// an I2/I3 violation.
//
// THE FIX. A single in-memory (module-scoped) boolean, set by WalletProvider the
// instant a decoy/hidden session opens and cleared on lock / primary unlock.
// In-memory means:
//   - NOT persisted, so it adds NO storage artifact / deniability tell (unlike a
//     localStorage flag, which a forensic dump would reveal).
//   - Readable synchronously by wallet-core egress gates WITHOUT a React import.
//   - Reset on reload (a fresh page load has no unlocked session anyway).
//
// FAIL CLOSED (I4). The reader treats "unknown" as deniability-active is NOT the
// model here (a fresh primary session must be allowed to use Trezor). Instead the
// SETTER is the trusted authority: WalletProvider sets the flag true for every
// decoy/hidden unlock BEFORE any signing UI can run, and false only for a
// confirmed primary session. Any wallet-core egress that cannot positively
// confirm a primary session via this marker plus its own checks must refuse.

let _deniabilityActive = false;

/**
 * Best-effort DOM event fired whenever the deniability marker is set (I-2 fix).
 * Listeners (e.g. TierProvider) subscribe to invalidate cached paid-tier state
 * the instant a decoy/hidden session opens mid-session — without this signal a
 * cached `safety_plus` would leak into the decoy UI (Manage-subscription button,
 * SafetyPlus "unlocked" copy). Mirrors SEND_2FA_CHANGED_EVENT / PASSKEY_
 * REGISTRATION_EVENT (same-tab in-document notify). A missing event bus must
 * never block the setter — dispatch is wrapped best-effort.
 */
export const DENIABILITY_SESSION_CHANGED_EVENT = 'veyrnox:deniability-session-changed';

/**
 * Mark whether the CURRENT in-memory session is a deniability (decoy/hidden) one.
 * Called by WalletProvider.unlock for every session: true for decoy/hidden,
 * false for a confirmed primary session. Called by lock() to clear on lock.
 * Dispatches DENIABILITY_SESSION_CHANGED_EVENT best-effort so live listeners
 * (TierProvider) can react to a mid-session flip.
 * @param {boolean} active
 */
export function setDeniabilitySession(active) {
  _deniabilityActive = active === true;
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event(DENIABILITY_SESSION_CHANGED_EVENT));
    }
  } catch {
    /* best-effort — a missing event bus must never block the setter. */
  }
}

/**
 * @returns {boolean} true when the current in-memory session is a decoy/hidden
 * (deniability) session and backend/device egress must be refused (I3).
 */
export function isDeniabilitySessionActive() {
  return _deniabilityActive === true;
}

/**
 * LIVE deniability-OR-demo check (issue #972 round-3 P1). Matches the OLD
 * hw/trezor.js:deniabilityActive() semantics verbatim: returns true when EITHER
 *   1. isDeniabilitySessionActive() (in-memory decoy/hidden session), OR
 *   2. `localStorage['veyrnox-demo']` === '1' (persisted demo/tour flag).
 * The persisted flag is read LIVE on every call, so a flag set AFTER module
 * import is still caught (`api/demoClient.js`'s exported DEMO is a load-time
 * IIFE snapshot and won't catch that case — this helper does). Fail-closed:
 * either read throwing returns true.
 *
 * Callers (SendCrypto.jsx render conditional, mutationFn gate, hw-send.js's
 * assertNotDeniabilitySession) MUST use this — using the imported DEMO constant
 * alone leaves a post-import-flip window where an RPC egress path fires before
 * the ultimate hw-send.js gate refuses.
 * @returns {boolean}
 */
export function isDeniabilityOrDemoActive() {
  try {
    if (isDeniabilitySessionActive()) return true;
  } catch {
    return true;
  }
  try {
    return (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('veyrnox-demo') === '1'
    );
  } catch {
    return true;
  }
}
