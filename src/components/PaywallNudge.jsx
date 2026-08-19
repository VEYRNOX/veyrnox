// @ts-nocheck
// src/components/PaywallNudge.jsx
//
// Day-3 soft paywall: a non-blocking upgrade nudge shown to free-tier users
// after 3+ distinct calendar days of app usage. Never shown in deniability/
// demo sessions (I3 — no upsell surface exists in a decoy/hidden session),
// never shown to already-subscribed users, and only shown once (dismissal
// is sticky in localStorage — no re-prompt nagging).
//
// Session-day counting: incrementSessionDayCount() is called once per
// SESSION_START (see WalletProvider.jsx) and only bumps the counter the
// first time it runs on a given calendar day, so multiple unlocks in the
// same day count as one "session day".

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Shield, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useModalA11y } from '@/lib/useModalA11y';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { trackEvent, EVENT } from '@/api/trackEvent';
import { useTier } from '@/lib/TierProvider';
import { isPaidTier } from '@/lib/tier';

const SESSION_COUNT_KEY = 'veyrnox-session-day-count';
const SESSION_LAST_DAY_KEY = 'veyrnox-session-last-day';
const NUDGE_DISMISSED_KEY = 'veyrnox-paywall-nudge-dismissed';
const DAY_THRESHOLD = 3;

// Called once per SESSION_START. No-op in deniability/demo (I3 — must not
// write any state that could distinguish a real session from a decoy one).
export function incrementSessionDayCount() {
  try {
    if (isDeniabilityOrDemoActive()) return;
    const today = new Date().toISOString().slice(0, 10);
    const lastDay = localStorage.getItem(SESSION_LAST_DAY_KEY);
    if (lastDay === today) return;
    localStorage.setItem(SESSION_LAST_DAY_KEY, today);
    const count = parseInt(localStorage.getItem(SESSION_COUNT_KEY) || '0', 10);
    localStorage.setItem(SESSION_COUNT_KEY, String(count + 1));
  } catch {
    // Best-effort: never block session start on a storage failure.
  }
}

// Exported for testing. Pure eligibility check — no side effects.
export function shouldShowPaywallNudge(currentTier) {
  try {
    if (isDeniabilityOrDemoActive()) return false;
    if (isPaidTier(currentTier)) return false;
    if (localStorage.getItem(NUDGE_DISMISSED_KEY)) return false;
    const count = parseInt(localStorage.getItem(SESSION_COUNT_KEY) || '0', 10);
    return count >= DAY_THRESHOLD;
  } catch {
    return false;
  }
}

export default function PaywallNudge() {
  const { currentTier } = useTier();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const containerRef = useModalA11y({ active: visible, onEscape: () => handleDismiss() });

  const trackedRef = useRef(false);
  useEffect(() => {
    if (trackedRef.current) return;
    if (shouldShowPaywallNudge(currentTier)) {
      trackedRef.current = true;
      setVisible(true);
      void trackEvent(EVENT.PAYWALL_SHOWN, { trigger: 'day_3' }).catch(() => {});
    }
  }, [currentTier]);

  // Codex P2 2026-08-16: shouldShowPaywallNudge is only re-evaluated when
  // currentTier changes, so a nudge shown in a primary session stays
  // visible after a mid-session flip into decoy/hidden. The persistent
  // writes below were unconditional, so a deniable-session dismiss (or
  // Upgrade click) would leave veyrnox-paywall-nudge-dismissed in shared
  // localStorage — a K-2 tell that the paywall was interacted with. LIVE
  // deniability re-check at every write site keeps the persistent
  // marker owned exclusively by primary sessions. The one-render nudge
  // itself is fine to close in decoy (setVisible is React state only).
  const handleDismiss = () => {
    if (!isDeniabilityOrDemoActive()) {
      try { localStorage.setItem(NUDGE_DISMISSED_KEY, '1'); } catch {
        // Best-effort: worst case the nudge re-shows next session.
      }
    }
    setVisible(false);
    if (!isDeniabilityOrDemoActive()) {
      void trackEvent(EVENT.PAYWALL_DISMISSED, { trigger: 'day_3' }).catch(() => {});
    }
  };

  const handleUpgrade = () => {
    if (!isDeniabilityOrDemoActive()) {
      try { localStorage.setItem(NUDGE_DISMISSED_KEY, '1'); } catch {
        // Best-effort.
      }
    }
    setVisible(false);
    if (!isDeniabilityOrDemoActive()) {
      void trackEvent(EVENT.PAYWALL_CONVERTED, { trigger: 'day_3' }).catch(() => {});
    }
    navigate('/plans');
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Upgrade to Safety Plus"
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xl"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Upgrade to Safety Plus</h2>
          </div>
          <button
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          You&rsquo;ve been using Veyrnox for a few days. Safety Plus adds hardware-bound
          encryption, tamper detection, and spend limits — so even a stolen device
          can&rsquo;t access your keys.
        </p>
        <div className="flex gap-3">
          <Button onClick={handleUpgrade} className="flex-1">See plans</Button>
          <Button onClick={handleDismiss} variant="outline" className="flex-1">Not now</Button>
        </div>
      </div>
    </div>
  );
}
