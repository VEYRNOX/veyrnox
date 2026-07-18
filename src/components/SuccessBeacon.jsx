// @ts-nocheck
// components/SuccessBeacon.jsx
//
// Presentation-only "confirmed" beacon for critical success moments — most
// notably the post-broadcast Send screen, where the user has just committed
// funds and the confirmation deserves weight.
//
// Motion (skill rule 7 — motion has meaning, 150–300ms micro, spring physics,
// exit faster than enter):
//   - Central check springs in from scale 0.4 → 1 (stiffness 260, damping 20).
//   - The teal disc behind it grows in the same beat.
//   - Two radiating rings pulse outward once, fading as they expand — reads
//     as a physical "ping" (the moment landed).
//   - After landing, the disc emits a slow, quiet breathing pulse so a
//     lingering user still feels the screen is alive without loud looping.
//   - Everything degrades to a static disc + checkmark under
//     prefers-reduced-motion (no rings, no pulse).
//
// Isolation: memoized; no external dependencies beyond framer-motion + lucide.

import { memo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useInfiniteAnimation } from '@/lib/useInfiniteAnimation';

// Bounded (not Infinity) so a lingering success screen quiets down after ~5s.
const RING_TRANSITION = { duration: 1.4, ease: [0.16, 1, 0.3, 1], repeat: 3, repeatDelay: 0.6 };

function SuccessBeaconImpl({ size = 96, label = 'Success' }) {
  const reduce = useReducedMotion();
  const visible = useInfiniteAnimation();

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      {/* Radiating ring pulses — two, offset in phase, expand from 0.6 → 1.6
          and fade to 0. Kept CSS-cheap: only transform + opacity. */}
      {!reduce && visible && (
        <>
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full border border-primary/40"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: [0.6, 1.6], opacity: [0.6, 0] }}
            transition={RING_TRANSITION}
          />
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full border border-primary/40"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: [0.6, 1.9], opacity: [0.5, 0] }}
            transition={{ ...RING_TRANSITION, delay: 0.5 }}
          />
        </>
      )}

      {/* Solid teal disc — springs in from the trigger point. */}
      <motion.span
        aria-hidden
        className="absolute inset-2 rounded-full bg-primary/15 border border-primary/30"
        initial={reduce ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 220, damping: 20 }}
      />

      {/* Slow breathing pulse on the inner glow after landing. Quiet — this
          screen may be viewed for many seconds while the user reads the tx
          hash. */}
      {!reduce && visible && (
        <motion.span
          aria-hidden
          className="absolute inset-4 rounded-full bg-primary/25 blur-md"
          initial={{ opacity: 0.4 }}
          animate={{ opacity: [0.35, 0.6, 0.35], scale: [1, 1.06, 1] }}
          transition={{ duration: 3.2, ease: 'easeInOut', repeat: Infinity, delay: 0.6 }}
        />
      )}

      {/* The check itself — spring in slightly after the disc for a
          two-beat "land, then confirm" rhythm. */}
      <motion.span
        className="relative flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_30px_-10px_rgba(74,218,194,0.5)]"
        style={{ width: size * 0.5, height: size * 0.5 }}
        initial={reduce ? { scale: 1, opacity: 1 } : { scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
      >
        <Check className="h-1/2 w-1/2" strokeWidth={3} />
      </motion.span>
    </div>
  );
}

const SuccessBeacon = memo(SuccessBeaconImpl);
export default SuccessBeacon;
