// @ts-nocheck
// components/KekEnrollmentGate.jsx
//
// MANDATORY hardware-KEK enrollment interstitial — shown after either
//   (a) a fresh Phase-2 create on a hardware-capable device, or
//   (b) a seed restore whose delete+reinstall+restore cycle left the device
//       hardware key gone (bare, PIN-only vault).
// Without this gate the user silently lands in an unprotected wallet.
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
// UX (2026-07-16 polish):
//   - Vault illustration anchors the moment. Different copy for fresh vs restored
//     vaults (the previous single copy read "your wallet was restored" for both,
//     which was misleading — and I4-honest — on fresh Phase-2 creates).
//   - Framer-Motion stagger orchestrates the reveal; degrades under reduced-motion.
//   - Perpetual motion (vault dial rotation, glow pulse) is isolated inside the
//     memoized VaultIllustration.
//
// Props:
//   onEnroll: (pin: string) => Promise<{ ok: boolean, msg?: string, isInsecureTier?: boolean, isWrongPin?: boolean }>
//   onSkip:   () => void
//   origin?:  'fresh' | 'restored'  (default: 'restored' — matches historical copy)

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PinPad from '@/components/security/PinPad';
import VaultIllustration from '@/components/VaultIllustration';
import ShakeOnKey from '@/components/ShakeOnKey';

const COPY = {
  fresh: {
    heading: 'Seal your wallet into hardware',
    body: (
      <>
        Your new wallet lives inside this device's encrypted vault. Turn on
        hardware protection so it can only be opened <strong>here</strong> — even if
        someone gets your backup phrase and your PIN.
      </>
    ),
  },
  restored: {
    heading: 'Reseal your wallet into hardware',
    body: (
      <>
        Your wallet was restored, but the hardware protection from your previous
        install didn't come with it. Turn it back on now so your wallet can only
        be opened on <strong>this device</strong> — even if someone gets your backup
        and your PIN.
      </>
    ),
  },
};

export default function KekEnrollmentGate({ onEnroll, onSkip, origin = 'restored' }) {
  const reduce = useReducedMotion();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
  // When the device reports an insecure tier, hide the enroll form and offer Skip only —
  // hardware protection genuinely can't be enabled here (I4 honest-disable).
  const [insecureDevice, setInsecureDevice] = useState(false);

  const copy = COPY[origin] || COPY.restored;

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

  const container = {
    hidden: {},
    show: { transition: reduce ? {} : { staggerChildren: 0.09, delayChildren: 0.04 } },
  };
  const item = reduce
    ? { hidden: { opacity: 1, y: 0 }, show: { opacity: 1, y: 0 } }
    : {
        hidden: { opacity: 0, y: 12 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
      };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-background overflow-hidden">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="w-full max-w-sm space-y-6"
        data-testid="kek-enrollment-gate"
      >
        <motion.div variants={item} className="flex flex-col items-center text-center space-y-4">
          <VaultIllustration size={200} label="Hardware-protected vault" />
          <h1 className="text-2xl font-semibold tracking-tight">{copy.heading}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground max-w-[20rem]">
            {copy.body}
          </p>
        </motion.div>

        <motion.div
          variants={item}
          className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5"
        >
          <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            This links your wallet to this phone's secure hardware. Nothing leaves the
            device — your keys never go anywhere.
          </p>
        </motion.div>

        {error && (
          <motion.p
            variants={item}
            role="alert"
            aria-live="assertive"
            className="text-xs text-destructive text-center"
          >
            {error}
          </motion.p>
        )}

        {!insecureDevice && (
          <motion.div variants={item} className="space-y-3">
            {busy ? (
              <p
                role="status"
                aria-live="polite"
                className="text-sm text-muted-foreground flex items-center gap-2 justify-center py-6"
              >
                <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> Enabling — approve the prompt…
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground text-center">
                  Enter your PIN, then confirm with Face ID, your fingerprint,
                  or your device passcode.
                </p>
                <ShakeOnKey shakeKey={shakeKey}>
                  <PinPad
                    value={pin}
                    onChange={(v) => { setPin(v); setError(''); }}
                    onComplete={handleEnroll}
                    disabled={busy}
                    length={8}
                    numericOnly
                    submitLabel="Enable Hardware Protection"
                  />
                </ShakeOnKey>
              </>
            )}
          </motion.div>
        )}

        {/* Explicit skip — honestly surfaces the security tradeoff (I4). */}
        <motion.div
          variants={item}
          className="space-y-2 rounded-xl border border-caution/30 bg-caution/5 px-3 py-3"
        >
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
        </motion.div>
      </motion.div>
    </div>
  );
}
