// @ts-nocheck
// components/LockSealingOverlay.jsx
//
// Full-viewport overlay shown briefly when the user taps the lock button. Gives
// the "sealing your vault" beat that mirrors the "sealing your wallet into
// hardware" beat at onboarding — bookending the session.
//
// UX contract: this is presentation-only, ~450ms total. The actual lock()
// runs after the animation finishes (see caller in Layout.jsx). Security
// posture is unchanged — the user tapped lock and is committed; the delay
// is imperceptibly short, and the app is not interactive during the
// overlay (pointer-events on, no controls).
//
// Motion:
//   - Backdrop fades in (150ms), then out (100ms) at unmount.
//   - The vault illustration scales down (1 → 0.9) and rotates a tick
//     clockwise as the "sealed" state, with a soft fade on the aura.
//   - Reduced-motion: instant static overlay, still visible so the user
//     gets confirmation the action registered.
//
// Isolation: memoized. No wallet-core imports.

import { memo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Lock } from 'lucide-react';
import VaultIllustration from './VaultIllustration';

function LockSealingOverlayImpl() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.15, ease: 'easeOut' }}
      aria-live="polite"
      role="status"
    >
      <motion.div
        initial={reduce ? { scale: 1, opacity: 1 } : { scale: 1.06, opacity: 0 }}
        animate={reduce ? { scale: 1, opacity: 1 } : { scale: 0.94, opacity: 1 }}
        transition={reduce ? { duration: 0 } : { duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center gap-4"
      >
        <VaultIllustration size={168} label="Sealing your vault" />
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Lock className="h-4 w-4" strokeWidth={2.2} />
          <span>Locking your vault…</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

const LockSealingOverlay = memo(LockSealingOverlayImpl);
export default LockSealingOverlay;
