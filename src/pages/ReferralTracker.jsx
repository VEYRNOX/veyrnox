import { useState, useEffect, useCallback } from 'react';
import { Gift, Copy, CheckCircle2, ExternalLink, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
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
  EXTERNAL_REWARD_URL,
} from '@/lib/referral';
import { registerCode, redeemCode, fetchStatus } from '@/api/referralApi';

const TIER_LABELS = { none: 'No referrals yet', bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };
const TIER_COLOR = { none: 'text-muted-foreground', bronze: 'text-amber-400', silver: 'text-slate-300', gold: 'text-yellow-400' };
const MILESTONES = [1, 5, 10];

function TierBadge({ tier }) {
  if (tier === 'none') return null;
  return (
    <span className={`text-xs font-semibold uppercase tracking-widest ${TIER_COLOR[tier]}`}>
      {TIER_LABELS[tier]}
    </span>
  );
}

function ProgressBar({ count }) {
  const pct = Math.min((count / 10) * 100, 100);
  return (
    <div className="space-y-1">
      <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        {MILESTONES.map((m) => (
          <span key={m} className={count >= m ? 'text-primary font-medium' : ''}>
            {m} {m === 1 ? 'invite' : 'invites'}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ReferralTracker() {
  const code = generateCode();
  const [inviteCount, setInviteCount] = useState(() => getLocalState().inviteCount || 0);
  const [tier, setTier] = useState(() => getLocalState().tier || 'none');
  const [externalEligible, setExternalEligible] = useState(() => !!getLocalState().externalEligible);
  const [alreadyRedeemed, setAlreadyRedeemed] = useState(() => hasRedeemed());
  const [copied, setCopied] = useState(false);
  const [redeemInput, setRedeemInput] = useState('');
  const [redeemError, setRedeemError] = useState('');
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [syncedAt, setSyncedAt] = useState(null);

  const syncCount = useCallback(async () => {
    const data = await fetchStatus(code);
    if (!data) return;
    const result = applyRedemption(data.count);
    setInviteCount(data.count);
    setTier(result.tier);
    setExternalEligible(result.externalEligible);
    setSyncedAt(new Date());
  }, [code]);

  useEffect(() => {
    // Register this code on first mount (no-op if already registered)
    registerCode(code);
    // Auto-redeem any code stored during onboarding
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
            setExternalEligible(result.externalEligible);
            setAlreadyRedeemed(true);
          })
          .catch(() => {});
      }
    }
    // Sync current count from backend
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

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Gift className="h-6 w-6 text-primary" /> Referral Tracker
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Invite friends to Veyrnox and earn rewards as they join.
          </p>
        </div>
      </div>

      {/* Your code */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Your invite code</p>
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
          Share this code with friends. When they set up their wallet and enter it, you earn credit.
        </p>
      </div>

      {/* Progress */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{inviteCount} {inviteCount === 1 ? 'invite' : 'invites'}</span>
          <TierBadge tier={tier} />
        </div>
        <ProgressBar count={inviteCount} />
        {syncedAt && (
          <p className="text-[10px] text-muted-foreground">
            Last synced {syncedAt.toLocaleTimeString()}
          </p>
        )}
        {!syncedAt && (
          <p className="text-[10px] text-muted-foreground">Syncing…</p>
        )}
      </div>

      {/* Tier rewards */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Rewards</p>
        <ul className="space-y-2 text-sm">
          <li className={`flex items-center gap-2 ${inviteCount >= 1 ? 'text-foreground' : 'text-muted-foreground'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${inviteCount >= 1 ? 'bg-amber-400' : 'bg-secondary'}`} />
            1 invite — Bronze badge
          </li>
          <li className={`flex items-center gap-2 ${inviteCount >= 5 ? 'text-foreground' : 'text-muted-foreground'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${inviteCount >= 5 ? 'bg-slate-300' : 'bg-secondary'}`} />
            5 invites — Silver: unlock Portfolio Snapshots
          </li>
          <li className={`flex items-center gap-2 ${inviteCount >= 10 ? 'text-foreground' : 'text-muted-foreground'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${inviteCount >= 10 ? 'bg-yellow-400' : 'bg-secondary'}`} />
            10 invites — Gold: subscription credit + external reward
          </li>
        </ul>
        {externalEligible && (
          <a
            href={EXTERNAL_REWARD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Claim your external reward <ExternalLink className="h-3.5 w-3.5" />
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
              placeholder="VYX-XXXX"
              maxLength={8}
              autoCapitalize="characters"
              autoCorrect="off"
              className="mono-value tracking-widest"
            />
            <Button onClick={handleRedeem} disabled={!redeemInput.trim() || redeemBusy} variant="outline">
              {redeemBusy ? '…' : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
          {redeemError && <p className="text-xs text-destructive">{redeemError}</p>}
        </div>
      )}
    </div>
  );
}
