// src/components/NotificationBell.jsx
//
// In-app Notifications v1 (transient, Path A) — PROVISIONAL — independent audit
// complete (ECC 2026-06-23, §24; M-3/M-5/M-6/L-2 found and fixed, PR #340).
// Still BUILT, not 'verified'.
// Build brief §5 (bell badge) + §6 (UI conformance) + §2 D-set (no cardinality leak).
//
// Presentational ONLY: a bell with an unseen badge. No keys, no network, no storage.
// The accent token (#4ADAC2) is used sparingly for the badge. Opening the bell
// marks all seen (resets the badge) via onOpen.
//
// §2 (no cardinality leak): the badge shows THIS session's unseen count only — never
// "N wallets", never a per-set tally. The chrome is structurally identical in real
// and decoy modes; nothing here reveals another set exists or how many there are.

import { useEffect, useRef, useState } from 'react';
import { motion, useAnimation, useReducedMotion } from 'framer-motion';
import { springs } from '@/lib/motion-tokens';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

// Attention pulse: when unseenCount rises from 0 → positive, the bell does a
// single 600ms wiggle (skill §7 — motion carries meaning; not perpetual, which
// would violate `excessive-motion`). The badge itself uses a spring scale-in
// so a fresh notification lands with weight instead of a silent number swap.
// Reduced-motion pins both static.
export default function NotificationBell({ unseenCount = 0, onOpen, className }) {
  const hasUnseen = unseenCount > 0;
  const label = unseenCount > 9 ? '9+' : String(unseenCount);
  const reduce = useReducedMotion();
  const controls = useAnimation();
  const prev = useRef(unseenCount);
  const [badgeKey, setBadgeKey] = useState(0);

  useEffect(() => {
    // Fire the pulse only on 0 → N transitions (a fresh notification), not on
    // decrement or count-change while already unseen.
    if (prev.current === 0 && unseenCount > 0 && !reduce) {
      controls.start({
        rotate: [0, -12, 0],
        transition: springs.bouncy,
      });
      setBadgeKey((k) => k + 1);
    }
    prev.current = unseenCount;
  }, [unseenCount, controls, reduce]);

  return (
    <button
      type="button"
      onClick={() => onOpen?.()}
      aria-label={hasUnseen ? `Notifications, ${unseenCount} unseen` : 'Notifications'}
      className={cn(
        'relative inline-flex h-9 w-9 items-center justify-center rounded-full',
        'text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors',
        className
      )}
    >
      <motion.span animate={controls} style={{ transformOrigin: '50% 15%' }} className="inline-flex">
        <Bell className="h-5 w-5" />
      </motion.span>
      {hasUnseen && (
        <motion.span
          key={badgeKey}
          initial={reduce ? { scale: 1, opacity: 1 } : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 20 }}
          className={cn(
            'absolute -top-0.5 -right-0.5 min-w-[1.05rem] h-[1.05rem] px-1',
            'inline-flex items-center justify-center rounded-full',
            'bg-accent text-accent-foreground text-[0.625rem] font-semibold leading-none',
            'mono-value'
          )}
        >
          {label}
        </motion.span>
      )}
    </button>
  );
}
