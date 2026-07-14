// @ts-nocheck
// components/KekEnrollmentGate.jsx
//
// MANDATORY hardware-KEK enrollment interstitial — shown after a seed restore on a
// native device that SUPPORTS hardware protection (Secure Enclave / StrongBox) but
// does NOT yet have the vault KEK-wrapped. This is the delete+reinstall+restore case:
// the on-device hardware key is gone, so the restored vault is bare (PIN-only) with no
// device binding. Without this gate the user silently lands in an unprotected wallet.
//
// SECURITY:
//   - The user MUST enter their PIN — enrollKek() (called via onEnroll prop) derives the
//     C factor from it. We never trigger enrollment without a real PIN (fail-closed).
//   - enrollHardwareCredential() (inside onEnroll) prompts the real biometric and GATES
//     on the reported security tier. No fake "ON".
//   - I3-safe: no wallet-core imports here. All keystore calls live in
//     useKekEnrollmentGate (src/lib), which is the allowed R2 ring layer.
//   - Skip is explicit and honestly labelled with the security tradeoff (no hardware
//     protection). It is the only escape when the device can't meet the hardware bar.
//
// Ring boundary: this component lives in src/components (a forbidden R0/R1 import
// layer). All wallet-core work is delegated to the useKekEnrollmentGate hook in
// src/lib, which IS allowed to import from @/wallet-core/keystore.
//
// Props:
//   onEnroll: (pin: string) => Promise<{ ok: boolean, msg?: string, isInsecureTier?: boolean, isWrongPin?: boolean }>
//   onSkip:   () => void

import { useState } from 'react';
import { ShieldCheck, ShieldAlert, Loader2, Fingerprint } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PinPad from '@/components/security/PinPad';

export default function KekEnrollmentGate({ onEnroll, onSkip }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
  // When the device reports an insecure tier, hide the enroll form and offer Skip only —
  // hardware protection genuinely can't be enabled here (I4 honest-disable).
  const [insecureDevice, setInsecureDevice] = useState(false);

  const handleEnroll = async (testPin) => {
    const pinToUse = testPin || pin;
    // Fail-closed: never call enrollKek without a real PIN.
    if (!pinToUse) { setError('Enter your PIN first.'); return; }
    setError('');
    setBusy(true);
    try {
      const result = await onEnroll(pinToUse);
      if (result.ok) {
        setPin('');
        return; // caller (WalletEntry) clears the gate via dismiss()
      }
      if (result.isInsecureTier) {
        setInsecureDevice(true);
        setError(result.msg);
      } else if (result.isWrongPin) {
        setPin('');
        setShakeKey((k) => k + 1);
        setError(result.msg);
      } else {
        setError(result.msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div
        className="w-full max-w-sm space-y-6"
        data-testid="kek-enrollment-gate"
      >
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Fingerprint className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">Protect your wallet with Face ID</h1>
          <p className="text-sm text-muted-foreground">
            Your wallet was restored, but the hardware protection from your previous
            install didn't come with it. Turn it back on now so your wallet can only be
            opened on <strong>this device</strong> — even if someone gets your backup and
            your PIN.
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            This links your wallet to this phone's secure hardware. Nothing leaves the
            device — your keys never go anywhere.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            aria-live="assertive"
            className="text-xs text-destructive text-center"
          >
            {error}
          </p>
        )}

        {!insecureDevice && (
          <div className="space-y-3">
            {busy ? (
              <p
                role="status"
                aria-live="polite"
                className="text-sm text-muted-foreground flex items-center gap-2 justify-center py-6"
              >
                <Loader2 className="h-4 w-4 animate-spin" /> Enabling — approve the prompt…
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground text-center">
                  Enter your PIN, then confirm with Face ID or your fingerprint.
                </p>
                <PinPad
                  key={shakeKey}
                  value={pin}
                  onChange={(v) => { setPin(v); setError(''); }}
                  onComplete={handleEnroll}
                  disabled={busy}
                  length={8}
                  numericOnly
                  submitLabel="Enable Hardware Protection"
                />
              </>
            )}
          </div>
        )}

        {/* Explicit skip — honestly surfaces the security tradeoff (I4). */}
        <div className="space-y-2 rounded-xl border border-caution/30 bg-caution/5 px-3 py-3">
          <div className="flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 text-caution shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              If you skip, your wallet will be protected by your PIN only. Someone who
              copies your backup could try to break your PIN offline. You can turn on
              hardware protection later in Security settings.
            </p>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onSkip?.()}
            disabled={busy}
          >
            Skip for now
          </Button>
        </div>
      </div>
    </div>
  );
}
