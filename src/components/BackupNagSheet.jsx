// BackupNagSheet — gentle in-app Safety Plus nudge. Replaces the former
// post-onboarding Personal Backup push with a soft recommendation card
// that appears on subsequent unlocks (cadence from useBackupNag).
//
// Points to /plans (the paywall) rather than /personal-backup directly,
// letting the user see the full value prop before committing. I3: suppressed
// in decoy/demo (defence-in-depth, matches FirstRunTour/consent pattern).

import { useNavigate } from "react-router";
import { Shield, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBackupNag } from "@/lib/useBackupNag";
import { isDeniabilityOrDemoActive } from "@/wallet-core/deniabilitySession";

export default function BackupNagSheet({ publicAddresses }) {
  const navigate = useNavigate();
  const { shouldShow, dismissForSession, promoteToCompleted } = useBackupNag(publicAddresses);

  if (isDeniabilityOrDemoActive() || !shouldShow) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center p-4 sm:inset-x-auto sm:bottom-6 sm:end-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-background/95 p-4 shadow-2xl backdrop-blur">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-primary/15 text-primary">
              <Shield className="h-[18px] w-[18px]" />
            </div>
            <p className="text-[15px] font-semibold text-foreground">Protect your wallet</p>
          </div>
          <button
            type="button"
            onClick={dismissForSession}
            className="text-muted-foreground hover:text-foreground p-1"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground mb-3">
          Your wallet only lives on this device. Safety Plus adds encrypted backups
          so you can recover it if anything happens.
        </p>
        <div className="grid gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => {
              promoteToCompleted();
              navigate("/plans");
            }}
          >
            Learn about Safety Plus
          </Button>
        </div>
      </div>
    </div>
  );
}
