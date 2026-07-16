// @ts-nocheck
// components/AnimatedFiat.jsx
//
// Count-up wrapper for fiat / numeric values. Animates from the previous
// rendered number to the new target over ~450ms, so the portfolio hero and
// other large-format values change with weight instead of snapping.
//
// - Uses framer-motion `animate()` off the React render loop (no re-render
//   thrash from state updates).
// - Respects prefers-reduced-motion (snaps to target instantly).
// - Renders through the caller-supplied `format(value)` — decoupled from any
//   specific currency formatter.
// - Tabular figures come from the parent's `mono-value` class; digit widths
//   never jitter mid-animation.

import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';

export default function AnimatedFiat({
  value = 0,
  format = (v) => String(v),
  duration = 0.45,
  className = '',
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      from.current = value;
      return undefined;
    }
    const controls = animate(from.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
      onComplete: () => { from.current = value; },
    });
    return () => controls.stop();
  }, [value, duration, reduce]);

  return <span className={className}>{format(display)}</span>;
}
