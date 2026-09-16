// @ts-nocheck
// src/components/BackupPaywallNudge.jsx
//
// Inline nudge shown after seed backup confirmation, offering Safety Plus
// (hardware binding) as the next step. I3: suppressed in deniability/demo.
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { X } from 'lucide-react';
import Vigil from '@/components/Vigil';
import { Button } from '@/components/ui/button';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { trackEvent, EVENT } from '@/api/trackEvent';
import { isPaidTier } from '@/lib/tier';

const KEY = 'veyrnox-backup-nudge-dismissed';

export function shouldShowBackupNudge(currentTier) {
  try {
    if (isDeniabilityOrDemoActive()) return false;
    if (isPaidTier(currentTier)) return false;
    return !localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export default function BackupPaywallNudge({ currentTier }) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(() => shouldShowBackupNudge(currentTier));
  const trackedRef = useRef(false);

  useEffect(() => {
    if (visible && !trackedRef.current) {
      trackedRef.current = true;
      void trackEvent(EVENT.PAYWALL_SHOWN, { trigger: 'post_backup' }).catch(() => {});
    }
  }, [visible]);

  if (!visible) return null;

  const handleDismiss = () => {
    // I3 second chokepoint. Gating shouldShowBackupNudge is not enough: `visible`
    // is seeded once at mount, so a session that flips to decoy while this nudge
    // is on screen still reaches this handler. Writing here would leave a
    // real-session tell in shared localStorage. Same rule as lib/consent.js.
    if (!isDeniabilityOrDemoActive()) {
      try { localStorage.setItem(KEY, '1'); } catch {}
    }
    setVisible(false);
    void trackEvent(EVENT.PAYWALL_DISMISSED, { trigger: 'post_backup' }).catch(() => {});
  };

  const handleUpgrade = () => {
    void trackEvent(EVENT.PAYWALL_CONVERTED, { trigger: 'post_backup' }).catch(() => {});
    navigate('/plans');
  };

  return (
    <div className="mt-4 p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          {/* Vigil asleep: hardware binding is not protecting this backup yet.
              Self-gates on deniability/demo — no guard needed here. */}
          <Vigil state="asleep" size={36} shadow={false} />
          <p className="text-sm font-medium">Protect this backup</p>
        </div>
        <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Your seed is backed up. Safety Plus adds hardware binding — so even if someone steals
        this backup, they can&rsquo;t use it on another device.
      </p>
      <Button onClick={handleUpgrade} variant="outline" size="sm">
        Learn about Safety Plus
      </Button>
    </div>
  );
}
