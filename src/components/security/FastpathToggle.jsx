// @ts-nocheck
// components/security/FastpathToggle.jsx
//
// Settings switch for the KEK fast-path biometric-only unlock (#2019, owner
// Option 1 / Q3). OFF by default. Enabling shows a one-time disclosure card
// the user must acknowledge; disabling clears the wrapped-DEK cache
// (best-effort).
//
// I3: renders NULL in decoy/demo — a toggle whose state does not match what a
// click produces is its own tell (same pattern as the wider Security-settings
// block hidden in Settings.jsx). Reads leave no trace; the write-side gate is
// enforced in lib/fastpathUnlock.js setters.
//
// Platform: Android only. iOS and web render NULL — the fast-path relies on
// the Android StrongBox/TEE aliased key (see wallet-core/keystore/native.js).

import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Zap } from 'lucide-react';
import {
  isFastpathEnabled,
  setFastpathEnabled,
  hasSeenFastpathDisclosure,
  markFastpathDisclosureSeen,
} from '@/lib/fastpathUnlock';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { isPasskeyRegistered } from '@/lib/passkey';

export default function FastpathToggle() {
  // Read guard placed at render (not module top) so the deniability state at
  // click-time is what matters, not the state at import-time.
  if (isDeniabilityOrDemoActive()) return null;
  if (Capacitor.getPlatform?.() !== 'android') return null;
  // Owner ruling: users with a passkey enrolled have chosen a stronger unlock
  // factor. Fast-path bypasses the passkey gate at unlock, so we do not offer
  // the toggle to those users. Unenrol the passkey first to enable fast-path.
  if (isPasskeyRegistered()) return null;

  const [enabled, setEnabled] = useState(() => isFastpathEnabled());
  const [showDisclosure, setShowDisclosure] = useState(false);

  const handleToggle = async () => {
    if (enabled) {
      // Disable: flip off + best-effort clear the wrapped-DEK cache so a stale
      // slot cannot be re-used if the user re-enables later without going
      // through slow-path populate.
      setFastpathEnabled(false);
      setEnabled(false);
      try {
        const mod = await import('@/plugins/androidBiometricCache');
        if (typeof mod.clearFastpathDek === 'function') await mod.clearFastpathDek();
      } catch { /* best-effort — populate re-runs on next slow-path unlock */ }
      return;
    }
    // Enable: gate on the one-time disclosure. First run → show the card and
    // wait for ack. Repeat run → straight enable.
    if (!hasSeenFastpathDisclosure()) {
      setShowDisclosure(true);
      return;
    }
    setFastpathEnabled(true);
    setEnabled(true);
  };

  const handleAck = () => {
    markFastpathDisclosureSeen();
    setFastpathEnabled(true);
    setEnabled(true);
    setShowDisclosure(false);
  };

  return (
    <div className="p-5 rounded-xl border border-border bg-card space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Zap className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <h3 className="font-semibold text-sm">Fast unlock</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Uses Face Unlock or fingerprint without asking for your PIN.
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled ? 'true' : 'false'}
          data-testid="fastpath-toggle"
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-muted'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
      </div>

      {showDisclosure && (
        <div
          data-testid="fastpath-disclosure"
          className="p-4 rounded-lg border border-border bg-background space-y-3"
        >
          <p className="text-xs leading-relaxed text-muted-foreground">
            This lets Face ID or your fingerprint unlock the wallet without asking for your PIN.
            It&rsquo;s faster. If someone else has your phone AND can pass your device&rsquo;s
            biometric (for example, if they added their own face), they can unlock the wallet.
            Your PIN still works and everything else is unchanged.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowDisclosure(false)}
              className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="fastpath-disclosure-ack"
              onClick={handleAck}
              className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90"
            >
              I understand, enable it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
