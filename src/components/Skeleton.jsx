// @ts-nocheck
// components/Skeleton.jsx
//
// Skeletal loader with a subtle shimmer sweep. Preferred over a spinning icon
// whenever we know roughly what the loaded content will look like (a text row,
// a card, a list) — skill Rule 3 `progressive-loading` says skeletons feel
// faster than spinners at identical load time because they preview shape.
//
// Motion:
//   - A linear shimmer highlight sweeps left→right every 1.6s.
//   - Runs on transform+opacity only (GPU-cheap).
//   - Reduced-motion: static tinted block, no shimmer.
//
// Usage:
//   <Skeleton className="h-4 w-32" />
//   <SkeletonList rows={5} />

import { motion, useReducedMotion } from 'framer-motion';

export function Skeleton({ className = '', rounded = 'rounded-md' }) {
  const reduce = useReducedMotion();
  return (
    <span
      aria-hidden
      className={`relative inline-block overflow-hidden bg-secondary ${rounded} ${className}`}
    >
      {!reduce && (
        <motion.span
          className="absolute inset-y-0 -inset-x-1/2 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent"
          initial={{ x: '-40%' }}
          animate={{ x: '140%' }}
          transition={{ duration: 1.6, ease: 'linear', repeat: Infinity }}
        />
      )}
    </span>
  );
}

// Convenience: a stack of skeleton rows matching a typical list layout.
export function SkeletonList({ rows = 3, className = '' }) {
  return (
    <div className={`space-y-3 ${className}`} role="status" aria-live="polite" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9" rounded="rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-3 w-14" />
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
