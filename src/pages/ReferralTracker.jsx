// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { Gift, Copy, CheckCircle2, ExternalLink, ChevronRight, TrendingUp, DollarSign, Mail } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import {
  generateCode,
  getEphemeralCode,
  getLocalState,
  applyRedemption,
  markRedeemed,
  hasRedeemed,
  getTierInfo,
  calculateEarnings,
  calculateDiscountCents,
  TIERS,
  EXTERNAL_REWARD_URL,
  PLAN_FULL_PRICE_CENTS,
} from '@/lib/referral';
import { registerCode, redeemCode, fetchStatus, fetchPaidCount, fetchEarnings } from '@/api/referralApi';

const TIER_COLOR = {
  none:     'text-muted-foreground',
  bronze:   'text-amber-600',
  silver:   'text-slate-400',
  gold:     'text-yellow-400',
  platinum: 'text-primary',
};
const TIER_BG = {
  none:     'bg-secondary',
  bronze:   'bg-amber-600/20',
  silver:   'bg-slate-400/20',
  gold:     'bg-yellow-400/20',
  platinum: 'bg-primary/20',
};

function TierBadge({ tier, commission }) {
  if (tier === 'none') return null;
  const info = TIERS.find(t => t.key === tier);
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest ${TIER_COLOR[tier]}`}>
      {info?.label || tier}
      <span className={`px-1.5 py-0.5 rounded text-[10px] ${TIER_BG[tier]}`}>{commission}%</span>
    </span>
  );
}

// F-progressbar (2026-07-20 branch review): this was a plain <div> pair (an
// outer track + an inner width-percentage bar) with no progressbar semantics
// — no role, no aria-valuenow/min/max, no accessible name. Adjacent prose
// already carries the numbers so the impact was limited, but the graphical
// affordance itself said nothing to AT.
//
// Every value fed to the new ARIA attributes comes from `paidCount`, the SAME
// argument the visible prose already renders — it is the caller's already
// I3-gated `dPaid` display variable (never the raw, ungated state), so a
// decoy/demo session (paidCount === 0) exposes nothing beyond what the
// existing on-screen text already shows.
function ProgressBar({ paidCount }) {
  const info = getTierInfo(paidCount);
  if (!info.next) {
    return (
      <div className="space-y-1">
        <div
          role="progressbar"
          aria-label="Referral tier progress"
          aria-valuenow={100}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext="Maximum tier reached"
          className="h-2 w-full rounded-full bg-primary/20 overflow-hidden"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: '100%' }} />
        </div>
        <p className="text-[10px] text-primary font-medium">Maximum tier reached</p>
      </div>
    );
  }
  const rangeStart = info.key === 'none' ? 0 : info.min;
  const rangeEnd = info.next.min;
  const progress = Math.min(((paidCount - rangeStart) / (rangeEnd - rangeStart)) * 100, 100);
  // Defensive only: `rangeEnd === rangeStart` (the 'none' tier's next is
  // bronze, whose own min is 0) is a pre-existing 0/0 edge case in the width
  // calculation above, left untouched here (out of scope for an a11y pass —
  // see the PR notes). This guard exists solely so the NEW aria-valuenow
  // itself is never NaN, which would be an invalid ARIA value.
  const ariaNow = Number.isFinite(progress) ? Math.round(Math.max(0, Math.min(100, progress))) : 0;
  return (
    <div className="space-y-1">
      <div
        role="progressbar"
        aria-label="Referral tier progress"
        aria-valuenow={ariaNow}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${paidCount.toLocaleString()} of ${rangeEnd.toLocaleString()} paid subscribers toward ${info.next.label}`}
        className="h-2 w-full rounded-full bg-secondary overflow-hidden"
      >
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{paidCount.toLocaleString()} paid subscribers</span>
        <span>{rangeEnd.toLocaleString()} for {info.next.label}</span>
      </div>
    </div>
  );
}

function TierCard({ tier, isActive, isFuture }) {
  return (
    <div className={`flex items-center justify-between rounded-lg border p-3 transition-all ${
      isActive
        ? `border-primary/40 ${TIER_BG[tier.key]}`
        : isFuture
          ? 'border-border bg-card opacity-60'
          : 'border-border/50 bg-card/50 opacity-40'
    }`}>
      <div className="flex items-center gap-3">
        <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-primary' : isFuture ? 'bg-secondary' : 'bg-secondary/50'}`} />
        <div>
          <span className={`text-sm font-medium ${isActive ? TIER_COLOR[tier.key] : ''}`}>{tier.label}</span>
          <p className="text-[10px] text-muted-foreground">
            {tier.min.toLocaleString()}–{tier.max.toLocaleString()} paid subscribers
          </p>
        </div>
      </div>
      <div className="text-right">
        <span className={`text-lg font-bold ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
          {tier.commission}%
        </span>
        <p className="text-[10px] text-muted-foreground">
          ${(calculateDiscountCents(PLAN_FULL_PRICE_CENTS.annual, tier.commission) / 100).toFixed(2)}/yr per sub
        </p>
      </div>
    </div>
  );
}

/**
 * P1 (I3) — live, FAIL-CLOSED deniability check. Any throw is treated as
 * "deniability active": show nothing real, write nothing.
 */
function deniabilityActive() {
  try {
    return isDeniabilityOrDemoActive() === true;
  } catch {
    return true;
  }
}

export default function ReferralTracker() {
  // P1: evaluated on EVERY render (not just mount) so a decoy/hidden session that
  // opens while this page stays mounted is suppressed immediately.
  const deniable = deniabilityActive();

  // The real code is resolved once, and ONLY for a genuine session. Two harms it
  // avoids in a deniability session: getLocalState().code would render the real
  // influencer's code on screen, and generateCode() WRITES the shared
  // `veyrnox-referral` key — so merely opening this page under coercion mutated
  // real persisted state. The decoy substitute is an ephemeral, never-persisted
  // code that is stable for the life of the tab (see lib/referral.js).
  const [realCode] = useState(() =>
    deniabilityActive() ? null : (getLocalState().code || generateCode()),
  );
  const code = deniable || !realCode ? getEphemeralCode() : realCode;

  // Every stat is seeded from the SHARED localStorage key, so each initialiser is
  // gated too — real figures must never enter component state in a decoy session.
  const [inviteCount, setInviteCount] = useState(() => (deniabilityActive() ? 0 : getLocalState().inviteCount || 0));
  const [paidCount, setPaidCount] = useState(() => (deniabilityActive() ? 0 : getLocalState().paidCount || 0));
  const [tier, setTier] = useState(() => (deniabilityActive() ? 'none' : getLocalState().tier || 'none'));
  const [commission, setCommission] = useState(() => (deniabilityActive() ? 0 : getLocalState().commission || 0));
  const [externalEligible, setExternalEligible] = useState(() => (deniabilityActive() ? false : !!getLocalState().externalEligible));
  const [alreadyRedeemed, setAlreadyRedeemed] = useState(() => (deniabilityActive() ? false : hasRedeemed()));
  const [copied, setCopied] = useState(false);
  const [redeemInput, setRedeemInput] = useState('');
  const [redeemError, setRedeemError] = useState('');
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [syncedAt, setSyncedAt] = useState(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const [earnings, setEarnings] = useState(null);

  // K-2: fetchStatus / fetchPaidCount / fetchEarnings each return `null` on THREE
  // distinct conditions — supabase unconfigured, isDeniabilityOrDemoActive() true
  // (the I3 guard), and any thrown error. `null` is therefore NOT distinguishable
  // from a genuine zero, and must never be coerced to 0: applyRedemption() writes
  // unconditionally into the shared `veyrnox-referral` localStorage key, so a
  // transient outage — or merely opening this page in a decoy/demo session —
  // would permanently wipe the user's real cached tier/count and present the wipe
  // as a successful sync.
  //
  // Fail-closed on the PARTIAL case too (one read ok, the other null): the two
  // counts are written together as one state object, so applying a fresh
  // rawCount alongside a stale/absent paidCount (or vice versa) would persist a
  // mismatched pair and derive the wrong tier from it. Bailing leaves the last
  // known-good state intact, which is the honest fallback (I4).
  //
  // The on-screen message is deliberately identical for every cause. A
  // decoy/demo session hits the same bail; a message that distinguished
  // "deniability session" from "service unreachable" would be a deniability tell.
  // It also must not imply that figures are being WITHHELD — the earlier wording
  // ("showing your last known figures") told a coercer looking at an empty decoy
  // screen that real data existed behind it. See the render below.
  //
  // P2-3: a REJECTED read must land in the SAME generic fail-closed state as a
  // null read. Without this catch the rejection escaped the effect entirely and
  // the card sat on "Syncing…" forever — a permanent, mute dead end (I4), and one
  // more state a coercer could distinguish. syncCount never rejects.
  const syncCount = useCallback(async () => {
    try {
      const [statusData, paid, earningsData] = await Promise.all([
        fetchStatus(code),
        fetchPaidCount(code),
        fetchEarnings(code),
      ]);
      const rawCount = statusData?.count;
      if (typeof rawCount !== 'number' || typeof paid !== 'number') {
        setSyncFailed(true);
        return;
      }
      // P1 belt-and-braces: applyRedemption() writes the shared localStorage key.
      // The API guards already return null in a deniability session so this is
      // unreachable there, but re-check LIVE before any persistence.
      if (deniabilityActive()) {
        setSyncFailed(true);
        return;
      }
      const result = applyRedemption(rawCount, paid);
      setInviteCount(rawCount);
      setPaidCount(result.paidCount);
      setTier(result.tier);
      setCommission(result.commission);
      setExternalEligible(result.externalEligible);
      setSyncFailed(false);
      setSyncedAt(new Date());
      if (earningsData && earningsData.length > 0) {
        setEarnings(calculateEarnings(earningsData));
      }
    } catch {
      setSyncFailed(true);
    }
  }, [code]);

  useEffect(() => {
    // registerCode() is itself I3-gated, but a deniability session has no real
    // code to register and must not touch the shared key at all.
    if (!deniabilityActive() && !getLocalState().serverGenerated) {
      registerCode(code);
    }
    // Deliberately NOT skipped in a deniability session: the reads are gated at
    // the API layer (zero egress) and running the same code path keeps the
    // "Syncing… → couldn't reach the service" sequence and its timing identical
    // to a genuine session whose backend is unreachable. Skipping it would show
    // the failure line instantly — an observable timing tell.
    syncCount();
  }, [code, syncCount]);

  const copyCode = async () => {
    await navigator.clipboard.writeText(code).catch(() => {
      toast.error('Copy failed — select the code manually.');
      return;
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Code copied!');
  };

  const handleRedeem = async () => {
    const input = redeemInput.trim().toUpperCase();
    setRedeemError('');
    if (!input) return;
    if (input === code) { setRedeemError("That's your own code."); return; }
    // P1: hasRedeemed() reads the real key — surfacing "you've already used a
    // referral code" in a decoy session would betray real prior activity.
    if (!deniable && hasRedeemed()) { setRedeemError("You've already used a referral code."); return; }
    setRedeemBusy(true);
    try {
      const { newCount } = await redeemCode(input);
      // P1 belt-and-braces: markRedeemed()/applyRedemption() both WRITE the shared
      // key. redeemCode() throws 503 in a deniability session so this is
      // unreachable there; re-check LIVE and fail closed anyway.
      if (deniabilityActive()) {
        setRedeemError('Could not apply code right now. Try again later.');
        return;
      }
      markRedeemed(input);
      const result = applyRedemption(newCount, paidCount);
      setInviteCount(newCount);
      setTier(result.tier);
      setCommission(result.commission);
      setExternalEligible(result.externalEligible);
      setAlreadyRedeemed(true);
      setRedeemInput('');
      toast.success('Referral code applied!');
    } catch (err) {
      if (err.status === 404) setRedeemError('Code not found. Check it and try again.');
      else setRedeemError('Could not apply code right now. Try again later.');
    } finally {
      setRedeemBusy(false);
    }
  };

  // P1: display-time gate. The state initialisers already cover the mount case;
  // this covers a decoy/hidden session opening while the page stays mounted, and
  // is the single place the rendered figures are decided.
  //
  // The decoy presentation is a neutral EMPTY state — ephemeral code, zero
  // counts, tier 'none', no commission line, no earnings card, no reward link,
  // redeem card visible — i.e. byte-for-byte what a genuine brand-new user sees.
  // There is deliberately NO message hinting that anything is being withheld.
  const dInvite = deniable ? 0 : inviteCount;
  const dPaid = deniable ? 0 : paidCount;
  const dTier = deniable ? 'none' : tier;
  const dCommission = deniable ? 0 : commission;
  const dExternalEligible = deniable ? false : externalEligible;
  const dEarnings = deniable ? null : earnings;
  const dRedeemed = deniable ? false : alreadyRedeemed;
  const dSyncedAt = deniable ? null : syncedAt;

  const tierInfo = getTierInfo(dPaid);
  const displayTiers = [...TIERS].reverse();

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Gift className="h-6 w-6 text-primary" /> Referral Program
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Share VEYRNOX and earn commission on every paid subscriber.
          </p>
        </div>
      </div>

      {/* Your code */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Your referral code</p>
        <div className="flex items-center gap-3">
          <span className="mono-value text-2xl font-bold tracking-widest text-foreground">{code}</span>
          <button
            onClick={copyCode}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Share this code with your audience. When they subscribe to Safety Plus using it, your paid subscriber count grows and your tier goes up.
        </p>
      </div>

      {/* Stats */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-2xl font-bold">{dPaid.toLocaleString()}</span>
            <span className="text-sm text-muted-foreground ml-1.5">paid subscribers</span>
          </div>
          <TierBadge tier={dTier} commission={dCommission} />
        </div>
        {dInvite > 0 && (
          <p className="text-xs text-muted-foreground">
            {dInvite.toLocaleString()} total referrals · {dPaid.toLocaleString()} converted to paid
          </p>
        )}
        <ProgressBar paidCount={dPaid} />
        {dCommission > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span>
              Your followers get <span className="font-semibold text-foreground">{dCommission}% off</span>
              {' — '}you earn <span className="font-semibold text-foreground">${(calculateDiscountCents(PLAN_FULL_PRICE_CENTS.annual, dCommission) / 100).toFixed(2)}</span>/yr subscriber
            </span>
          </div>
        )}
        {/* P1: one generic sentence for EVERY cause — service down, backend
            unconfigured, or a deniability session. It must not imply that
            figures are being withheld ("showing your last known figures" told a
            coercer real data existed behind the empty screen). */}
        {syncFailed && (
          <p className="text-[10px] text-caution" role="status">
            Couldn&rsquo;t reach the referral service. Figures may be out of date.
          </p>
        )}
        {!syncFailed && dSyncedAt && (
          <p className="text-[10px] text-muted-foreground">
            Last synced {dSyncedAt.toLocaleTimeString()}
          </p>
        )}
        {!syncFailed && !dSyncedAt && (
          <p className="text-[10px] text-muted-foreground">Syncing…</p>
        )}
      </div>

      {/* Earnings */}
      {dEarnings && dEarnings.count > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Earnings from referrals</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">${(dEarnings.totalDiscountCents / 100).toFixed(2)}</span>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">{dEarnings.count} paid {dEarnings.count === 1 ? 'subscriber' : 'subscribers'}</p>
              <p className="text-[10px] text-muted-foreground">${(dEarnings.totalRevenueCents / 100).toFixed(2)} total revenue generated</p>
            </div>
          </div>
        </div>
      )}

      {/* Commission tiers */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Commission tiers</p>
        <div className="space-y-2">
          {displayTiers.map((t) => (
            <TierCard
              key={t.key}
              tier={t}
              isActive={dTier === t.key}
              isFuture={tierInfo.key === 'none' || TIERS.indexOf(TIERS.find(x => x.key === dTier)) < TIERS.indexOf(t)}
            />
          ))}
        </div>
        {dExternalEligible && (
          <a
            href={EXTERNAL_REWARD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Claim your reward <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {/* Enter a code */}
      {!dRedeemed && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          {/* F-redeem-label (2026-07-20 branch review): the input had only a
              placeholder as its "label" — fails WCAG 3.3.2, and the name
              vanishes the moment the user types over it. The visible "Got a
              referral code?" line stays byte-identical (design system: no
              restyle); a separate sr-only Label supplies the real
              programmatic association without touching visible styling. */}
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Got a referral code?</p>
          <Label htmlFor="referral-redeem-code" className="sr-only">Referral code</Label>
          <div className="flex gap-2">
            <Input
              id="referral-redeem-code"
              value={redeemInput}
              onChange={(e) => { setRedeemInput(e.target.value.toUpperCase()); setRedeemError(''); }}
              placeholder="VYX-XXXXXX"
              maxLength={10}
              autoCapitalize="characters"
              autoCorrect="off"
              aria-invalid={!!redeemError}
              aria-describedby={redeemError ? 'referral-redeem-error' : undefined}
              className="mono-value tracking-widest"
            />
            <Button onClick={handleRedeem} disabled={!redeemInput.trim() || redeemBusy} variant="outline" aria-label="Apply referral code">
              {redeemBusy ? '…' : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
          {redeemError && (
            <p id="referral-redeem-error" role="alert" className="text-xs text-destructive">
              {redeemError}
            </p>
          )}
        </div>
      )}

      {/* How tiers work */}
      <div className="rounded-xl border border-border bg-muted/30 p-5 space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">How tiers work</p>
        <p className="text-sm text-muted-foreground">
          Your tier is determined by the number of people who <span className="font-semibold text-foreground">actually paid</span> for
          Safety Plus using your code — not the total number of people who entered it.
        </p>
        <p className="text-sm text-muted-foreground">
          For example, if 11,500 people enter your code but only 1,480 subscribe, your tier is based on the 1,480 paid subscribers (Gold), not the 11,500 total referrals.
        </p>
        <p className="text-sm text-muted-foreground">
          Commission is earned only on confirmed paid subscriptions verified by our payment provider.
        </p>
      </div>

      {/* Rewards & payouts */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Rewards &amp; payouts</p>
        <p className="text-sm text-muted-foreground">
          Earned commissions are paid out monthly.
        </p>
        <a
          href={`mailto:rewards@veyrnox.com?subject=${encodeURIComponent(`Referral Reward Claim — ${code}`)}&body=${encodeURIComponent(
            `REFERRAL REWARD CLAIM\n` +
            `${'─'.repeat(30)}\n\n` +
            `Referral Code: ${code}\n` +
            `Current Tier: ${(dTier || 'none').charAt(0).toUpperCase() + (dTier || 'none').slice(1)}\n` +
            `Commission Rate: ${dCommission}%\n\n` +
            `Total Referrals (code entries): ${dInvite.toLocaleString()}\n` +
            `Paid Subscribers (verified): ${dPaid.toLocaleString()}\n` +
            (dEarnings ? `Total Earnings: $${(dEarnings.totalDiscountCents / 100).toFixed(2)}\n` : '') +
            (dEarnings ? `Revenue Generated: $${(dEarnings.totalRevenueCents / 100).toFixed(2)}\n` : '') +
            `\n${'─'.repeat(30)}\n\n` +
            `Payment details:\n` +
            `Name: \n` +
            `Payment method (PayPal / bank transfer / crypto): \n` +
            `PayPal email or bank details: \n` +
            `Crypto address (ETH/BTC/SOL): \n\n` +
            `Notes: \n`
          )}`}
          className="flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <Mail className="h-4 w-4" />
          Claim compensation
        </a>
        <p className="text-[10px] text-muted-foreground">
          Opens your email client with your dashboard stats pre-filled for verification.
        </p>
      </div>
    </div>
  );
}
