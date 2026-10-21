// components/VigilMotion.jsx
//
// Motion wrapper for Vigil on paywall surfaces. Vigil itself stays static
// (Vigil.test.jsx pins that); all movement lives here, transform-only.
//
// Owner request 2026-10-21: the mascot moves around the paywalls. Motion is
// bounded so it does not become the battery-burning idle loop Vigil.jsx warns
// about:
//   1. hop-in on mount (one shot)
//   2. slow "breathing" bob for BREATH_CYCLES cycles, then it settles
//   3. tap/click reacts with a small wiggle (one shot, user-caused)
//
// Vigil stays `asleep` on paywalls (I4): the breathing is a sleeper's, never
// a pleading or sad gesture. Reduced motion renders the static owl.
// No persistence, no network, nothing disclosed across sessions (I3).

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Vigil from '@/components/Vigil';

const BREATH_CYCLES = 6;
const BREATH_SECONDS = 3.2;

/**
 * @param {{ state?: 'clean'|'alert'|'block'|'asleep', size?: number }} props
 */
export default function VigilMotion({ state = 'asleep', size = 84 }) {
  const reduce = useReducedMotion();
  const [wiggle, setWiggle] = useState(0);

  if (reduce) return <Vigil state={state} size={size} />;

  return (
    <motion.div
      data-vigil-motion
      className="inline-block"
      initial={{ y: 18, scale: 0.85, opacity: 0 }}
      animate={{ y: 0, scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 14 }}
      onTap={() => setWiggle((n) => n + 1)}
    >
      <motion.div
        key={wiggle}
        animate={
          wiggle > 0
            ? { rotate: [0, -9, 8, -5, 0], y: [0, -8, 0] }
            : { y: [0, -3, 0], scale: [1, 1.025, 1] }
        }
        transition={
          wiggle > 0
            ? { duration: 0.55, ease: 'easeInOut' }
            : { duration: BREATH_SECONDS, ease: 'easeInOut', repeat: BREATH_CYCLES, delay: 0.6 }
        }
        style={{ transformOrigin: '50% 90%' }}
      >
        <Vigil state={state} size={size} />
      </motion.div>
    </motion.div>
  );
}
