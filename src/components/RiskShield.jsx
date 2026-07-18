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

import { memo } from 'react';
import { motion, useReducedMotion } from "motion/react";
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useInfiniteAnimation } from '@/lib/useInfiniteAnimation';
import { easing } from '@/lib/motion-tokens';

const CONFIG = {
  block: {
    Icon: ShieldAlert,
    ring: 'border-risk',
    icon: 'text-risk',
    duration: 1.4,
  },
  warn: {
    Icon: ShieldAlert,
    ring: 'border-caution',
    icon: 'text-caution',
    duration: 2.2,
  },
  clean: {
    Icon: ShieldCheck,
    ring: 'border-primary',
    icon: 'text-primary',
    duration: 0, // static
  },
};

function RiskShieldImpl({ severity = 'warn', size = 28 }) {
  const reduce = useReducedMotion();
  const visible = useInfiniteAnimation();
  const cfg = CONFIG[severity] || CONFIG.warn;
  const { Icon } = cfg;
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
      <Icon className={`h-4 w-4 ${cfg.icon}`} strokeWidth={2} />
    </span>
  );
}

const RiskShield = memo(RiskShieldImpl);
export default RiskShield;
