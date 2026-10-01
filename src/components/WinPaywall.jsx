// @ts-nocheck
// src/components/WinPaywall.jsx
//
// WIN paywall — an upsell shown every time the user lands a success moment
// ("a WIN"): a wallet imported, seed backup confirmed, a send that confirmed,
// and the first inbound transfer. Wallet CREATION is deliberately not one —
// see the note in lib/winPaywall.js.
//
// Owner decision 2026-09-20: this fires on EVERY win, with no sticky
// dismissal key. That is deliberate and it is the one thing in this file not
// to "tune down" without being asked — PaywallNudge is the once-only surface,
// this one is the recurring one.
//
// Owner decision 2026-09-21: the recurring modal is for FREE users only. A
// Safety Plus subscriber is already paying, so AI Security Protection reaches
// them once, as a dismissible nudge (PaywallNudge), never on every win.
//
// upsellFor() is the shared catalogue of what each tier can still be sold:
//   free        → Safety Plus       → /plans   (this modal + the nudge)
//   safety_plus → AI Security Protection → /ai-security-protection (nudge only)
//   ai_security_protection → nothing to sell
//
// I4 honesty: the AI Security upsell must NOT imply the wallet itself gets
// more secure. The core controls (KEK, RASP, vault, threat screening) are the
// same on both paid tiers — AI Security adds the ONLINE Vigil answer path.
// Same sentence SecurityAdvisor.jsx:578 already pins for the advisor.
//
// I3: two chokepoints, matching lib/consent.js. recordWin() refuses to
// dispatch from a decoy/demo session, and the listener re-checks live at
// render — a session can flip to decoy between the two.
//
// Vigil is ALWAYS `asleep` here, on both offers — including the AI Security
// upsell to a Safety Plus subscriber whose Safety Plus protection genuinely IS
// running. `asleep` is the paywall/locked-feature state (Vigil.jsx), not a
// claim about the whole wallet, and TierLockedPage already renders it for the
// ai_security_protection variant. Pinned in Vigil.placement.test.jsx.
//
// No localStorage. Nothing here persists, so nothing joins ALL_RESIDUE_KEYS.

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import Vigil from '@/components/Vigil';
import { Button } from '@/components/ui/button';
import { useModalA11y } from '@/lib/useModalA11y';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { trackEvent, EVENT } from '@/api/trackEvent';
import { useTier } from '@/lib/TierProvider';
import { TIER } from '@/lib/tier';
import { WIN_EVENT } from '@/lib/winPaywall';
import { Capacitor } from '@capacitor/core';
import { hasRedeemed } from '@/lib/referral';
import { loadSafetyPlusTrialWithin, TRIAL_LOOKUP_BUDGET_MS } from '@/lib/safetyPlusTrial';
import { trialHeadline, trialRenewalLine } from '@/lib/freeTrial';

export { WIN, recordWin } from '@/lib/winPaywall';


// Which product, if any, this tier can still be sold. Also read by
// PaywallNudge for the Safety Plus → AI Security Protection copy.
export function upsellFor(tier) {
  if (tier === TIER.AI_SECURITY_PROTECTION) return null;
  if (tier === TIER.SAFETY_PLUS) {
    return {
      id: TIER.AI_SECURITY_PROTECTION,
      title: 'Add AI Security Protection',
      body: 'Safety Plus is protecting this wallet. AI Security Protection adds live online Vigil answers backed by the TIP threat-intelligence platform, on top of everything you already have.',
      cta: 'See AI Security Protection',
      to: '/ai-security-protection',
    };
  }
  return {
    id: TIER.SAFETY_PLUS,
    title: 'Upgrade to Safety Plus',
    // I4: name ONLY capabilities Safety Plus actually gates (SAFETY_PLUS_ROUTES
    // in lib/safetyPlusRoutes.js). Hardware-bound encryption (KEK) and tamper
    // detection (RASP) are on every tier, and spend limits work on Free, so
    // selling them here sold free controls as paid. No absolute guarantee
    // either — the independent audit is still outstanding.
    body: 'Safety Plus adds a duress PIN that opens a decoy wallet, hidden wallets, panic wipe, and an encrypted backup you can keep off this device.',
    cta: 'See plans',
    to: '/plans',
  };
}

export default function WinPaywall() {
  const { currentTier } = useTier();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [win, setWin] = useState(null);
  // Free-trial wording. undefined = still asking the store for THIS win, null =
  // no confirmed trial (today's copy), object = a store-confirmed, eligible
  // trial. The modal renders nothing until it settles, at most
  // TRIAL_LOOKUP_BUDGET_MS, so the copy never changes under the user's eyes. A
  // new win starts a fresh lookup and never reuses the last answer.
  const [trial, setTrial] = useState(undefined);
  // Free only — see the 2026-09-21 note above.
  const offer = currentTier === TIER.FREE ? upsellFor(currentTier) : null;
  // upsellFor returns a new object every render, so effects key on the id.
  const offerId = offer?.id ?? null;

  const close = useCallback(() => setWin(null), []);
  const containerRef = useModalA11y({ active: !!win, onEscape: close });

  useEffect(() => {
    const onWin = (e) => {
      if (isDeniabilityOrDemoActive()) return;
      setTrial(undefined);
      setWin(e?.detail?.trigger || 'win');
    };
    window.addEventListener(WIN_EVENT, onWin);
    return () => window.removeEventListener(WIN_EVENT, onWin);
  }, []);

  // Ask the store only for a win that will actually show: a free user, outside a
  // decoy/demo session (I3). One lookup per win.
  useEffect(() => {
    if (!win || !offerId || isDeniabilityOrDemoActive()) return undefined;
    let cancelled = false;
    loadSafetyPlusTrialWithin(TRIAL_LOOKUP_BUDGET_MS, {
      platform: Capacitor.getPlatform(),
      hasReferral: hasRedeemed(),
    }).then((confirmed) => {
      if (!cancelled) setTrial(confirmed);
    });
    return () => { cancelled = true; };
  }, [win, offerId]);

  // Counted as shown once the modal is actually on screen, once per win. It used
  // to depend on `offer`, a fresh object each render, so any re-render re-fired it.
  const settled = trial !== undefined;
  useEffect(() => {
    if (!win || !offerId || !settled) return;
    void trackEvent(EVENT.PAYWALL_SHOWN, { trigger: win, offer: offerId }).catch(() => {});
  }, [win, offerId, settled]);

  // Live re-check: a session that flipped to decoy while this was open must
  // not keep an upsell — its mere presence discloses the primary tier.
  if (!win || !offer || isDeniabilityOrDemoActive()) return null;
  if (trial === undefined) return null;

  // Same funnel offer id either way; only the words change.
  const shown = trial
    ? {
        ...offer,
        title: `Try Safety Plus — ${trialHeadline(trial.days)}`,
        body: `${offer.body} ${trialRenewalLine({ days: trial.days, priceString: trial.priceString, billing: 'annual' })}`,
        cta: 'See free trial',
      }
    : offer;

  const dismiss = () => {
    close();
    void trackEvent(EVENT.PAYWALL_DISMISSED, { trigger: win, offer: offer.id }).catch(() => {});
  };

  const upgrade = () => {
    close();
    void trackEvent(EVENT.PAYWALL_CONVERTED, { trigger: win, offer: offer.id }).catch(() => {});
    navigate(offer.to);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={shown.title}
        data-testid="win-paywall"
        data-win={win}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xl"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-bold">{shown.title}</h2>
          <button onClick={dismiss} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex justify-center">
          {/* One-shot entrance, not an idle loop (Vigil.jsx: NO IDLE MOTION).
              The win is the state change that earns it. */}
          <motion.div
            initial={reduce ? false : { scale: 0.86, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 220, damping: 16 }}
          >
            <Vigil state="asleep" size={84} />
          </motion.div>
        </div>
        <p className="text-sm text-muted-foreground">{shown.body}</p>
        <div className="flex gap-3">
          <Button onClick={upgrade} className="flex-1">{shown.cta}</Button>
          <Button onClick={dismiss} variant="outline" className="flex-1">Not now</Button>
        </div>
      </div>
    </div>
  );
}
