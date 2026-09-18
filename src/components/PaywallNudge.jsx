// @ts-nocheck
// src/components/PaywallNudge.jsx
//
// Soft paywall: a non-blocking upgrade nudge shown to free-tier users after
// DAY_THRESHOLD distinct calendar days of app usage — currently 1, i.e. the
// first unlock day (see the constant for why, and for what that costs).
// Never shown in deniability/
// demo sessions (I3 — no upsell surface exists in a decoy/hidden session),
// never shown to already-subscribed users, and only shown once (dismissal
// is sticky in localStorage — no re-prompt nagging).
//
// Session-day counting: incrementSessionDayCount() is called once per
// SESSION_START (see WalletProvider.jsx) and only bumps the counter the
// first time it runs on a given calendar day, so multiple unlocks in the
// same day count as one "session day".

import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { X } from 'lucide-react';
import Vigil from '@/components/Vigil';
import { Button } from '@/components/ui/button';
import { useModalA11y } from '@/lib/useModalA11y';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { trackEvent, EVENT } from '@/api/trackEvent';
import { useTier } from '@/lib/TierProvider';
import { isPaidTier } from '@/lib/tier';

const SESSION_COUNT_KEY = 'veyrnox-session-day-count';
const SESSION_LAST_DAY_KEY = 'veyrnox-session-last-day';
const NUDGE_DISMISSED_KEY = 'veyrnox-paywall-nudge-dismissed';
// Measured on production `public.events` 2026-09-17. Re-derive rather than
// trusting these numbers — a measurement written into a file has an expiry
// date and no alarm:
//
//   select count(distinct device_id) as devices, days
//   from (select device_id, count(distinct created_at::date) as days
//         from public.events where event = 'session_start'
//         group by device_id) t
//   group by days order by days;
//
// At the time of writing: of 2,139 devices that have ever emitted
// session_start, 2,114 (98.8%) did so on exactly ONE calendar day, 18 on two,
// and SEVEN have ever reached three. A day-3 threshold put this nudge out of
// reach of the entire install base — paywall_shown had fired twice, ever,
// against 2,304 wallet_ready devices.
//
// SAY WHAT THIS ACTUALLY DOES. An earlier version of this comment claimed "one
// day still means 'came back at least once'". It does not, and the difference
// matters: incrementSessionDayCount() runs on the FIRST unlock and only once
// per calendar day, so `count === 1` is reached at the first unlock — routinely
// the same day as, and minutes after, wallet creation (one auto-lock cycle is
// enough). A return visit would be `>= 2`. So the nudge now fires on the first
// unlock day, NOT on a return.
//
// Two consequences the owner should weigh, neither of them hidden by this
// comment any more:
//   - the full-screen modal can land 2.5s (SETTLE_MS) after a new user's first
//     unlock, which is the window where they are still completing seed backup
//     — and BackupPaywallNudge already upsells that exact moment inline;
//   - the data above says a return-visit nudge is unreachable at ANY threshold
//     >= 2, so this is not "day 3 tuned down", it is a different nudge.
// Raising it back re-breaks reachability; leaving it at 1 accepts a first-day
// upsell. That is an owner call, not a tuning detail.
export const DAY_THRESHOLD = 1;

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

// Routes where an upsell modal must never interrupt. The nudge fires on the
// first render after the tier resolves, and incrementSessionDayCount() runs at
// SESSION_START (i.e. at unlock) — so the full-screen modal could land straight
// on top of whatever the user unlocked the wallet to do, including a send or a
// security screen. Restricted to the dashboard, after a short settle delay, so
// it reads as an interstitial rather than an ambush.
//
// This gating carries MORE weight at DAY_THRESHOLD = 1 than it did at 3: the
// unlock it now fires on can be a new user's first, minutes after wallet
// creation. Do not loosen the route list or SETTLE_MS without re-reading the
// constant's note.
const NUDGE_ROUTES = ['/', '/dashboard'];
const SETTLE_MS = 2500;

export default function PaywallNudge() {
  const { currentTier } = useTier();
  const navigate = useNavigate();
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const containerRef = useModalA11y({ active: visible, onEscape: () => handleDismiss() });

  const trackedRef = useRef(false);
  useEffect(() => {
    if (trackedRef.current) return;
    if (!NUDGE_ROUTES.includes(location.pathname)) return;
    if (!shouldShowPaywallNudge(currentTier)) return;
    const timer = setTimeout(() => {
      if (trackedRef.current) return;
      trackedRef.current = true;
      setVisible(true);
      // 'day_3' is a STABLE SERIES KEY, not a description — it names this
      // nudge in production `public.events` from before DAY_THRESHOLD moved.
      // Renaming it would split the series and silently reset the only
      // measurement that justifies the threshold. Leave it.
      void trackEvent(EVENT.PAYWALL_SHOWN, { trigger: 'day_3' }).catch(() => {});
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [currentTier, location.pathname]);

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
          {/* Vigil, asleep: protection is NOT running on this wallet. The
              sleeping state is the honest one for a paywall (I4) — off duty,
              never sad, never implying cover the user has not paid for.
              Vigil self-gates on deniability/demo, so no guard here. */}
          <h2 className="text-lg font-bold">Upgrade to Safety Plus</h2>
          <button
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex justify-center">
          <Vigil state="asleep" size={84} />
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
