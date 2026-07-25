// @ts-nocheck
// One-time post-send referral prompt (growth product changes, Task 5).
//
// Shown once, after the user's first successful send, on the SendDoneView
// confirmation screen. Dismissing (X or sharing) sets a permanent localStorage
// flag so it never reappears. I3: renders nothing in deniability/demo sessions
// — no real referral state is read or displayed under coercion.
import { useState } from 'react';
import { Share2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { getLocalState } from '@/lib/referral';

const DISMISSED_KEY = 'veyrnox-referral-prompt-dismissed';

export function shouldShowReferralPrompt() {
  try {
    if (isDeniabilityOrDemoActive()) return false;
    return !localStorage.getItem(DISMISSED_KEY);
  } catch {
    return false;
  }
}

function dismissPrompt() {
  try {
    localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // localStorage unavailable — nothing to persist, prompt simply won't
    // reappear this session either (in-memory `visible` state still flips).
  }
}

export default function ReferralPrompt() {
  const [visible, setVisible] = useState(shouldShowReferralPrompt);
  if (!visible) return null;

  // I3: re-check at render time, not just at mount — a deniability/demo
  // session must never read or display the real referral code.
  const deniable = isDeniabilityOrDemoActive();
  if (deniable) return null;

  const code = getLocalState().code || '';
  if (!code) return null;

  const handleShare = async () => {
    const shareText = `I use Veyrnox — a crypto wallet with a panic button. Get a discount with my code: ${code}`;
    const shareUrl = `https://veyrnox.com/r/${code}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Veyrnox Referral', text: shareText, url: shareUrl });
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`).catch(() => {});
      toast.success('Code copied!');
    }
    dismissPrompt();
    setVisible(false);
  };

  const handleDismiss = () => {
    dismissPrompt();
    setVisible(false);
  };

  return (
    <div className="mt-4 p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3 text-left">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">Know someone who needs secure crypto?</p>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        You just sent crypto securely. Share Veyrnox and earn commission on every subscriber.
      </p>
      <Button onClick={handleShare} variant="outline" size="sm" className="gap-1.5">
        <Share2 className="h-3.5 w-3.5" /> Share your referral code
      </Button>
    </div>
  );
}
