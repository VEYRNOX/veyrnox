// @ts-nocheck
// components/RiskShield.jsx
//
// Small animated shield for the pre-sign RASP / risk verdict banner. Replaces
// the static ShieldAlert icon so severity is legible before the sentence is
// read.
//
// Motion (skill rule 7 — motion has meaning; colour must not be the only signal —
// skill rule 1 `color-not-only`):
//   - BLOCK: red rings pulse every 1.4s (urgent).
//   - WARN:  amber rings pulse every 2.2s (attentive but not panicked).
//   - INFO/CLEAN: static teal shield (calm).
//   - All decorative; the shield glyph carries the semantic (aria hidden on
//     the wrapper — the sentence next to it is the accessible signal).
//   - Fully static under prefers-reduced-motion.
//
// Sized to slot into a text-row header (h-6 w-6) so it doesn't disturb the
// horizontal banner layout.
//
// The centre glyph is Vigil (the mascot). The severity -> expression mapping
// lives in CONFIG below and is pinned by a test: this is a signing chokepoint,
// so a BLOCK verdict drawing a calm owl would be a security-copy regression,
// not a cosmetic one.

import { memo } from 'react';
import { motion, useReducedMotion } from "motion/react";
import Vigil from '@/components/Vigil';
import { useInfiniteAnimation } from '@/lib/useInfiniteAnimation';
import { easing } from '@/lib/motion-tokens';

// `vigil` is the mascot expression for this severity. The mapping is the whole
// contract between the risk model and the character, so it is pinned by a test:
// a BLOCK verdict must never draw a calm owl.
//
// Vigil replaces the lucide glyph at the centre, NOT the pulsing rings. The
// rings are the urgency signal at a pre-sign chokepoint and they stay exactly
// as they were — Vigil itself is static by design (no idle loop), so swapping
// the rings out for a static character would have quietly downgraded a BLOCK
// warning from moving to still. The character says WHICH verdict; the rings say
// how urgently.
const CONFIG = {
  block: {
    vigil: 'block',
    ring: 'border-risk',
    duration: 1.4,
  },
  warn: {
    vigil: 'alert',
    ring: 'border-caution',
    duration: 2.2,
  },
  clean: {
    vigil: 'clean',
    ring: 'border-primary',
    duration: 0, // static
  },
};

function RiskShieldImpl({ severity = 'warn', size = 28 }) {
  const reduce = useReducedMotion();
  const visible = useInfiniteAnimation();
  const cfg = CONFIG[severity] || CONFIG.warn;
  const animate = !reduce && cfg.duration > 0 && visible;
  return (
    <span
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {animate && (
        <>
          <motion.span
            className={`absolute inset-0 rounded-full border ${cfg.ring}/50`}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: [0.7, 1.6], opacity: [0.7, 0] }}
            transition={{ duration: cfg.duration, ease: [0.16, 1, 0.3, 1], repeat: Infinity }}
          />
          <motion.span
            className={`absolute inset-0 rounded-full border ${cfg.ring}/40`}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: [0.7, 1.85], opacity: [0.55, 0] }}
            transition={{ duration: cfg.duration, ease: easing.smooth, repeat: Infinity, delay: cfg.duration * 0.35 }}
          />
        </>
      )}
      {/* Sized to sit inside the rings with room to breathe. Contact shadow
          off: at this size it reads as dirt under the glyph, not as ground. */}
      <Vigil state={cfg.vigil} size={Math.round(size * 0.74)} shadow={false} />
    </span>
  );
}

const RiskShield = memo(RiskShieldImpl);
export default RiskShield;
