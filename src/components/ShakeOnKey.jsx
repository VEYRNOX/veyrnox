// @ts-nocheck
// components/ShakeOnKey.jsx
//
// Presentation-only shake wrapper for "wrong input" moments — e.g. wrong PIN.
// Consumers keep a numeric `shakeKey` counter and bump it on every miss; this
// wrapper animates a short horizontal wiggle every time the counter changes.
//
// Motion (skill rule 7 — motion has meaning, 150–300ms micro):
//   - 350ms total shake with a decaying amplitude (12 → 8 → 4 → 0).
//   - Only `transform: translateX` — cheap, GPU-accelerated, no layout impact.
//   - No shake on first mount (initial state skipped).
//   - `useReducedMotion` fully disables the shake (a11y).
//   - Uses `useAnimation` controls so the child subtree (e.g. PinPad) is NOT
//     remounted on shakeKey change — input focus and internal state stay put.
//
// Usage:
//   <ShakeOnKey shakeKey={counter}>
//     <PinPad ... />
//   </ShakeOnKey>

import { useEffect, useRef } from 'react';
import { motion, useAnimation, useReducedMotion } from 'framer-motion';

export default function ShakeOnKey({ shakeKey = 0, children, className = '' }) {
  const controls = useAnimation();
  const reduce = useReducedMotion();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) return;
    controls.start({
      x: [0, -12, 12, -8, 8, -4, 4, 0],
      transition: {
        duration: 0.35,
        ease: 'easeInOut',
        times: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1],
      },
    });
  }, [shakeKey, controls, reduce]);

  return (
    <motion.div animate={controls} className={className}>
      {children}
    </motion.div>
  );
}
