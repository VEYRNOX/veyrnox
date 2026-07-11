// src/lib/useSend2faMethod.js
//
// Reactive wrapper around resolveSend2faMethod (lib/send2faMethod.js). The two
// device-global inputs — is2faBiometricEnabled() and is2faPasskeyEnabled(), plus
// isPasskeyRegistered() — are synchronous localStorage reads. Computing the method
// ONCE at render (the previous SendCrypto pattern, audit L-3) meant a user who
// toggled their 2FA method in Settings mid-session, while the Send screen stayed
// mounted in the background, kept the STALE method until a remount.
//
// This hook re-reads on the events that signal a 2FA-preference change:
//   - `storage`                     — a change in another tab/window (native `storage`
//                                     does NOT fire for same-tab writes, hence the two below).
//   - SEND_2FA_CHANGED_EVENT        — dispatched by set2faBiometricEnabled /
//                                     set2faPasskeyEnabled for same-tab pref toggles.
//   - PASSKEY_REGISTRATION_EVENT    — a passkey being registered/cleared flips
//                                     passkeyRegistered, which the resolver depends on.
//
// The REACTIVE (React-state) inputs — actionPasswordConfigured, isDecoy, isHidden —
// are passed in by the caller and drive a re-resolve through the effect deps. This
// only changes the REACTIVITY of the method selection; the security decision itself
// is unchanged (it still delegates to the same pure resolveSend2faMethod).

import { useState, useEffect, useCallback } from 'react';
import { resolveSend2faMethod } from '@/lib/send2faMethod';
import { is2faBiometricEnabled } from '@/lib/biometric';
import { is2faPasskeyEnabled, isPasskeyRegistered, PASSKEY_REGISTRATION_EVENT } from '@/lib/passkey';

// Dispatched (best-effort) whenever a device-global 2FA preference changes in THIS
// document. The native `storage` event only fires in OTHER tabs, so same-tab
// Settings toggles need this to reach a mounted Send screen live.
export const SEND_2FA_CHANGED_EVENT = 'veyrnox:2fa-changed';

/**
 * @param {object}  args
 * @param {boolean} args.demo
 * @param {boolean} args.isNative
 * @param {boolean} args.actionPasswordConfigured
 * @param {boolean} args.isDecoy
 * @param {boolean} args.isHidden
 * @returns {'biometric'|'passkey'|'password'|'none'}
 */
export function useSend2faMethod({
  demo = false,
  isNative = false,
  actionPasswordConfigured = false,
  isDecoy = false,
  isHidden = false,
} = {}) {
  const read = useCallback(() => resolveSend2faMethod({
    demo,
    isNative,
    biometric2faEnabled: is2faBiometricEnabled(),
    passkey2faEnabled: is2faPasskeyEnabled(),
    passkeyRegistered: isPasskeyRegistered(),
    actionPasswordConfigured,
    isDecoy,
    isHidden,
  }), [demo, isNative, actionPasswordConfigured, isDecoy, isHidden]);

  const [method, setMethod] = useState(read);

  useEffect(() => {
    const refresh = () => setMethod(read());
    // Re-sync immediately: a reactive input (actionPasswordConfigured/isDecoy/isHidden)
    // may have changed since the last render, or a pref write may have landed between
    // the initial useState read and this effect running.
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener(SEND_2FA_CHANGED_EVENT, refresh);
    window.addEventListener(PASSKEY_REGISTRATION_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(SEND_2FA_CHANGED_EVENT, refresh);
      window.removeEventListener(PASSKEY_REGISTRATION_EVENT, refresh);
    };
  }, [read]);

  return method;
}

/**
 * Best-effort in-document signal that a device-global 2FA preference changed, so a
 * mounted useSend2faMethod re-reads. Called by the pref setters. A missing event bus
 * must never block a preference write.
 */
export function notifySend2faChanged() {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event(SEND_2FA_CHANGED_EVENT));
    }
  } catch {
    /* best-effort — a missing event bus must never block a pref write. */
  }
}
