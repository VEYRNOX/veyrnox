// src/lib/useMessageSigningEnabled.js
//
// Reactive wrapper around isMessageSigningEnabled() (lib/messageSigning.js).
// The preference is a synchronous localStorage read; reading it ONCE at render
// would leave a mounted CryptoSigning page showing a stale state after the user
// flips the toggle in Settings. This hook re-reads on the events that signal a
// change:
//   - `storage`                        — a change in ANOTHER tab/window.
//   - MESSAGE_SIGNING_CHANGED_EVENT    — same-tab write via setMessageSigningEnabled.
// Mirrors lib/useSend2faMethod.js.

import { useState, useEffect } from 'react';
import { isMessageSigningEnabled, MESSAGE_SIGNING_CHANGED_EVENT } from '@/lib/messageSigning';

/** @returns {boolean} live "Message signing enabled" preference. */
export function useMessageSigningEnabled() {
  const [enabled, setEnabled] = useState(isMessageSigningEnabled);

  useEffect(() => {
    const refresh = () => setEnabled(isMessageSigningEnabled());
    // Re-sync immediately in case a write landed between the initial useState
    // read and this effect running.
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener(MESSAGE_SIGNING_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(MESSAGE_SIGNING_CHANGED_EVENT, refresh);
    };
  }, []);

  return enabled;
}
