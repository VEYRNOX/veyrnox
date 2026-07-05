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

import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function NotificationBell({ unseenCount = 0, onOpen, className }) {
  const hasUnseen = unseenCount > 0;
  // Bound the displayed glyph so a large in-memory count can't widen the chrome.
  const label = unseenCount > 9 ? '9+' : String(unseenCount);

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
      <Bell className="h-5 w-5" />
      {hasUnseen && (
        <span
          className={cn(
            'absolute -top-0.5 -right-0.5 min-w-[1.05rem] h-[1.05rem] px-1',
            'inline-flex items-center justify-center rounded-full',
            'bg-accent text-accent-foreground text-[0.625rem] font-semibold leading-none',
            'mono-value'
          )}
        >
          {label}
        </span>
      )}
    </button>
  );
}
