// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { Gift, Copy, CheckCircle2, ExternalLink, ChevronRight, TrendingUp, DollarSign } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  generateCode,
  getLocalState,
  applyRedemption,
  markRedeemed,
  hasRedeemed,
  getPendingReferral,
  clearPendingReferral,
  getTierInfo,
  calculateEarnings,
  TIERS,
  EXTERNAL_REWARD_URL,
} from '@/lib/referral';
import { registerCode, redeemCode, fetchStatus, fetchEarnings } from '@/api/referralApi';

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

function ProgressBar({ count, currentTier }) {
  const info = getTierInfo(count);
  if (!info.next) {
    return (
      <div className="space-y-1">
        <div className="h-2 w-full rounded-full bg-primary/20 overflow-hidden">
          <div className="h-full rounded-full bg-primary" style={{ width: '100%' }} />
        </div>
        <p className="text-[10px] text-primary font-medium">Maximum tier reached</p>
      </div>
    );
  }
  const rangeStart = info.key === 'none' ? 0 : info.min;
  const rangeEnd = info.next.min;
  const progress = Math.min(((count - rangeStart) / (rangeEnd - rangeStart)) * 100, 100);
  return (
    <div className="space-y-1">
      <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{count.toLocaleString()} referrals</span>
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
            {tier.min.toLocaleString()}–{tier.max.toLocaleString()} referrals
          </p>
        </div>
      </div>
      <div className="text-right">
        <span className={`text-lg font-bold ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
          {tier.commission}%
        </span>
        <p className="text-[10px] text-muted-foreground">commission</p>
      </div>
    </div>
  );
}

export default function ReferralTracker() {
  const code = generateCode();
  const [inviteCount, setInviteCount] = useState(() => getLocalState().inviteCount || 0);
  const [tier, setTier] = useState(() => getLocalState().tier || 'none');
  const [commission, setCommission] = useState(() => getLocalState().commission || 0);
  const [externalEligible, setExternalEligible] = useState(() => !!getLocalState().externalEligible);
  const [alreadyRedeemed, setAlreadyRedeemed] = useState(() => hasRedeemed());
  const [copied, setCopied] = useState(false);
  const [redeemInput, setRedeemInput] = useState('');
  const [redeemError, setRedeemError] = useState('');
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [syncedAt, setSyncedAt] = useState(null);
  const [earnings, setEarnings] = useState(null);

  const syncCount = useCallback(async () => {
    const data = await fetchStatus(code);
    if (!data) return;
    const result = applyRedemption(data.count);
    setInviteCount(data.count);
    setTier(result.tier);
    setCommission(result.commission);
    setExternalEligible(result.externalEligible);
    setSyncedAt(new Date());
    const earningsData = await fetchEarnings(code);
    if (earningsData && earningsData.length > 0) {
      setEarnings(calculateEarnings(earningsData, result.commission));
    }
  }, [code]);

  useEffect(() => {
    registerCode(code);
    const pending = getPendingReferral();
    if (pending) {
      clearPendingReferral();
      if (!hasRedeemed() && pending !== code) {
        redeemCode(pending)
          .then(({ newCount }) => {
            markRedeemed(pending);
            const result = applyRedemption(newCount);
            setInviteCount(newCount);
            setTier(result.tier);
            setCommission(result.commission);
            setExternalEligible(result.externalEligible);
            setAlreadyRedeemed(true);
          })
          .catch(() => {});
      }
    }
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
    if (hasRedeemed()) { setRedeemError("You've already used a referral code."); return; }
    setRedeemBusy(true);
    try {
      const { newCount } = await redeemCode(input);
      markRedeemed(input);
      const result = applyRedemption(newCount);
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

  const tierInfo = getTierInfo(inviteCount);
  const displayTiers = [...TIERS].reverse();

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Gift className="h-6 w-6 text-primary" /> Referral Program
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Share Veyrnox and earn commission on every referral.
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
          Share this code with your audience. When they set up their wallet and enter it, your referral count grows.
        </p>
      </div>

      {/* Stats */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-2xl font-bold">{inviteCount.toLocaleString()}</span>
            <span className="text-sm text-muted-foreground ml-1.5">referrals</span>
          </div>
          <TierBadge tier={tier} commission={commission} />
        </div>
        <ProgressBar count={inviteCount} currentTier={tier} />
        {commission > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span>Earning <span className="font-semibold text-foreground">{commission}%</span> commission on revenue</span>
          </div>
        )}
        {syncedAt && (
          <p className="text-[10px] text-muted-foreground">
            Last synced {syncedAt.toLocaleTimeString()}
          </p>
        )}
        {!syncedAt && (
          <p className="text-[10px] text-muted-foreground">Syncing…</p>
        )}
      </div>

      {/* Earnings */}
      {earnings && earnings.count > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Commission earned</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">${(earnings.commissionCents / 100).toFixed(2)}</span>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">{earnings.count} paid {earnings.count === 1 ? 'subscriber' : 'subscribers'}</p>
              <p className="text-[10px] text-muted-foreground">${(earnings.totalRevenueCents / 100).toFixed(2)} total revenue</p>
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
              isActive={tier === t.key}
              isFuture={tierInfo.key === 'none' || TIERS.indexOf(TIERS.find(x => x.key === tier)) < TIERS.indexOf(t)}
            />
          ))}
        </div>
        {externalEligible && (
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
      {!alreadyRedeemed && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Got a referral code?</p>
          <div className="flex gap-2">
            <Input
              value={redeemInput}
              onChange={(e) => { setRedeemInput(e.target.value.toUpperCase()); setRedeemError(''); }}
              placeholder="VYX-XXXXXX"
              maxLength={10}
              autoCapitalize="characters"
              autoCorrect="off"
              className="mono-value tracking-widest"
            />
            <Button onClick={handleRedeem} disabled={!redeemInput.trim() || redeemBusy} variant="outline" aria-label="Apply referral code">
              {redeemBusy ? '…' : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
          {redeemError && <p className="text-xs text-destructive">{redeemError}</p>}
        </div>
      )}
    </div>
  );
}
