// @ts-nocheck
// src/components/BackupPaywallNudge.jsx
//
// Inline nudge shown after seed backup confirmation, offering Safety Plus
// (hardware binding) as the next step. I3: suppressed in deniability/demo.
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Shield, X } from 'lucide-react';
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
    try { localStorage.setItem(KEY, '1'); } catch {}
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
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
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
