// src/components/NotificationToast.jsx
//
// In-app Notifications v1 (transient, Path A) — PROVISIONAL — independent audit
// complete (ECC 2026-06-23, §24; M-3/M-5/M-6/L-2 found and fixed, PR #340).
// Still BUILT, not 'verified'.
// Build brief §5 (transient toast) + §6 (UI conformance).
//
// Presentational ONLY: renders one notification object (from notify.js) as a
// transient toast that auto-dismisses (~4s) or on tap. No keys, no network, no
// storage. Calm: near-black surface, one token color per level, a quiet fade/slide
// (tailwindcss-animate) — no glow, no flashy motion.
//
// Mono for truth (§6): verifiable values (amount, recipient/spender) render in
// IBM Plex Mono via `.mono-value`, addresses truncated-middle. Prose (the message)
// is the default UI font, sentence case, calm.
//
// I3 (deniability): the toast is structurally identical in real and decoy modes —
// same layout, same copy logic. Nothing here branches on or reveals which set is
// active.

import { useEffect, useRef, useState } from 'react';
import { Info, AlertTriangle, ShieldAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { shortenAddress } from '@/lib/address';

const AUTO_DISMISS_MS = 4000;

// One token color per level (§6) — never stacked.
const LEVEL_STYLES = {
  info: { box: 'border-info/30 bg-info/10', text: 'text-info', Icon: Info },
  caution: { box: 'border-caution/30 bg-caution/10', text: 'text-caution', Icon: AlertTriangle },
  risk: { box: 'border-risk/40 bg-risk/10', text: 'text-risk', Icon: ShieldAlert },
};

export default function NotificationToast({ notification, onDismiss }) {
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  useEffect(() => {
    if (!notification) return undefined;
    if (paused) return undefined;
    const t = setTimeout(() => onDismiss?.(notification.id), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [notification, onDismiss, paused]);

  if (!notification) return null;

  const s = LEVEL_STYLES[notification.level] || LEVEL_STYLES.info;
  const { Icon } = s;
  const ev = notification.evidence || {};
  const isRisk = notification.level === 'risk';

  return (
    <div
      role={isRisk ? 'alert' : 'status'}
      aria-live={isRisk ? 'assertive' : 'polite'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        'flex items-start gap-2.5 rounded-xl border p-3 select-none',
        'bg-card/95 backdrop-blur-sm shadow-lg',
        'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200',
        s.box
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0 mt-0.5', s.text)} />
      <div className="min-w-0 space-y-0.5 flex-1">
        {/* Prose — calm, sentence case. */}
        <p className="text-sm text-foreground">{notification.message}</p>
        {/* Mono for truth — verifiable values only. */}
        {(ev.amount || ev.to || ev.spender) && (
          <p className="mono-value text-xs text-muted-foreground truncate">
            {ev.amount}
            {ev.amount && (ev.to || ev.spender) ? ' · ' : ''}
            {ev.to ? shortenAddress(ev.to) : ''}
            {ev.spender ? shortenAddress(ev.spender) : ''}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss?.(notification.id)}
        aria-label="Dismiss notification"
        className="shrink-0 -mr-1 -mt-1 p-1 rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
