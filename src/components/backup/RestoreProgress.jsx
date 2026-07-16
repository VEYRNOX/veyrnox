// @ts-nocheck
// components/backup/RestoreProgress.jsx
//
// ── ANIMATION SEAM (implemented) ─────────────────────────────────────────────
// The "rebuilding your vault" critical moment, shown while RestoreFromFile's state
// machine is in phase === 'restoring' (the Argon2id decrypt / re-wrap). This is the
// first-run / re-onboarding recovery beat: the user is anxious about whether their
// wallet is really coming back, so we give the moment weight and calm.
//
// Design language (matches #1023 vault-motif + spring physics): reuses the shared
// VaultIllustration and the same easing as LockSealingOverlay's "sealing" beat —
// restore is deliberately the COMPLEMENTARY "opening / rebuilding" beat, so the
// two bookend each other (seal on lock, reconstruct on restore). The vault's
// combination dial turning reads as the decryption doing its work.
//
// PURE PRESENTATION. The only prop is `method` ('password' | 'pin'), used solely to
// pick honest copy. No wallet handle, no crypto, no secrets, no I3 branch on wallet
// identity. The step copy advances on a timer purely for reassurance — it does not
// claim real sub-progress (the restore is one atomic KDF op); the labels are the
// honest phases the single operation runs through.

import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import VaultIllustration from '../VaultIllustration';

const STEPS = {
  password: [
    'Opening your backup file…',
    'Deriving your key — this step is deliberately slow…',
    'Rebuilding your wallet…',
    'Sealing it onto this device…',
  ],
  pin: [
    'Opening your backup file…',
    'Deriving your key — this step is deliberately slow…',
    'Re-encrypting your wallet on this device…',
    'Sealing it onto this device…',
  ],
};

export default function RestoreProgress({ method = 'password' }) {
  const reduce = useReducedMotion();
  const steps = STEPS[method] || STEPS.password;
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduce) return undefined;
    // Advance the reassurance copy every ~2.2s, holding on the final step.
    const id = setInterval(
      () => setI((n) => Math.min(n + 1, steps.length - 1)),
      2200,
    );
    return () => clearInterval(id);
  }, [reduce, steps.length]);

  return (
    <div
      data-testid="restore-progress"
      className="p-6 rounded-2xl border border-border bg-card text-center flex flex-col items-center gap-5"
      role="status"
      aria-live="polite"
    >
      <motion.div
        initial={reduce ? { scale: 1, opacity: 1 } : { scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduce ? { duration: 0 } : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <VaultIllustration size={148} label="Rebuilding your vault" />
      </motion.div>

      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Restoring your wallet</p>
        {/* Staged reassurance copy — cross-fades between the honest phases. */}
        <div className="relative h-5 w-full">
          <AnimatePresence mode="wait">
            <motion.p
              key={i}
              className="text-xs text-muted-foreground absolute inset-x-0"
              initial={reduce ? { opacity: 1 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: reduce ? 0 : 0.25, ease: 'easeOut' }}
            >
              {steps[i]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground/70 max-w-[15rem]">
        Keep the app open. Your keys are rebuilt here and never leave this device.
      </p>
    </div>
  );
}
