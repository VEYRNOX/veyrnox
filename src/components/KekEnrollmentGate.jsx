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
//   - The user MUST enter their PIN — enrollKek() derives the C factor from it. We never
//     call enrollKek() without a real PIN (fail-closed).
//   - enrollHardwareCredential() prompts the real biometric and GATES on the reported
//     security tier (ENROLL_ERR.INSECURE_TIER on a software/unknown tier). No fake "ON".
//   - I3-safe: pure local keystore reads/writes, no egress, no RPC.
//   - Skip is explicit and honestly labelled with the security tradeoff (no hardware
//     protection). It is the only escape when the device can't meet the hardware bar.
//
// Props:
//   onComplete: () => void  — called after a successful enrollKek (clears the hold)
//   onSkip:     () => void  — called when the user explicitly skips (clears the hold)

import { useState } from 'react';
import { ShieldCheck, ShieldAlert, Loader2, Fingerprint } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PinPad from '@/components/security/PinPad';
import { getKeyStore } from '@/wallet-core/keystore';
import { KEK_ERR } from '@/wallet-core/keystore/kek.js';

// Machine-code → plain-language copy. We classify on the STABLE code, never on prose.
const WRONG_PIN_MSG =
  'That PIN didn’t match. Enter the PIN you use to unlock your wallet.';
const NO_HARDWARE_MSG =
  'Couldn’t reach this device’s hardware security. Please try again.';
const INSECURE_TIER_MSG =
  'This device doesn’t meet the hardware security requirement. You can continue without hardware protection.';
const GENERIC_MSG = 'Something went wrong. Please try again.';

// decryptVault throws a code-less Error whose message is a STABLE internal sentinel.
function isWrongPinVaultError(e) {
  const msg = e?.message || '';
  return msg.startsWith('Decryption failed') || msg.startsWith('No wallet');
}

export default function KekEnrollmentGate({ onComplete, onSkip }) {
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
      const { enrollHardwareCredential, getHardwareFactor } = await import(
        '@/wallet-core/keystore/hardware.js'
      );
      const ks = getKeyStore();
      // Step 1: mint/confirm the hardware-bound key and GATE on the real tier. A
      // software/unknown tier throws ENROLL_ERR.INSECURE_TIER before any wrap is written.
      // Reconcile the double-enroll guard against the REAL vault state (a stale native
      // alias over a bare restored vault must not block this fresh enroll).
      const enrolledTier = await enrollHardwareCredential({
        isVaultWrapped: () => ks.hasVaultKekWrap(),
      });
      // Step 2: KEK-wrap the vault using the typed PIN (C) + device factor (H).
      await ks.enrollKek(pinToUse, {
        getHardwareFactor,
        hardwareKekTier: enrolledTier?.securityLevelName ?? null,
      });
      setPin('');
      onComplete?.();
    } catch (e) {
      const code = e?.code;
      if (code === 'KEK_ENROLL_INSECURE_TIER') {
        // Honest-disable: this device can't do hardware protection. Offer Skip only.
        setInsecureDevice(true);
        setError(INSECURE_TIER_MSG);
      } else if (
        code === KEK_ERR.UNWRAP_FAILED ||
        code === KEK_ERR.NO_HARDWARE_FACTOR ||
        code === 'WRONG_PASSWORD' ||
        code === 'KEK_NO_HARDWARE_FACTOR' ||
        isWrongPinVaultError(e)
      ) {
        // Wrong PIN / hardware factor mismatch: shake, clear, let the user retry.
        setPin('');
        setShakeKey((k) => k + 1);
        setError(code === KEK_ERR.NO_HARDWARE_FACTOR ? NO_HARDWARE_MSG : WRONG_PIN_MSG);
        // Best-effort cleanup of any partially-created credential so a retry is clean.
        try {
          const { clearHardwareCredential } = await import('@/wallet-core/keystore/hardware.js');
          await clearHardwareCredential();
        } catch { /* best-effort */ }
      } else {
        setError(GENERIC_MSG);
        try {
          const { clearHardwareCredential } = await import('@/wallet-core/keystore/hardware.js');
          await clearHardwareCredential();
        } catch { /* best-effort */ }
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
            install didn’t come with it. Turn it back on now so your wallet can only be
            opened on <strong>this device</strong> — even if someone gets your backup and
            your PIN.
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            This links your wallet to this phone’s secure hardware. Nothing leaves the
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
