// BackupNagSheet — gentle in-app Safety Plus nudge. Replaces the former
// post-onboarding Personal Backup push with a soft recommendation card
// that appears on subsequent unlocks (cadence from useBackupNag).
//
// Points to /plans (the paywall) rather than /personal-backup directly,
// letting the user see the full value prop before committing. I3: suppressed
// in decoy/demo (defence-in-depth, matches FirstRunTour/consent pattern).

import { useNavigate } from "react-router";
import { X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import Vigil from "@/components/Vigil";
import { Button } from "@/components/ui/button";
import { useBackupNag } from "@/lib/useBackupNag";
import { isDeniabilityOrDemoActive } from "@/wallet-core/deniabilitySession";

export default function BackupNagSheet({ publicAddresses }) {
  const navigate = useNavigate();
  const { shouldShow, dismissForSession, promoteToCompleted } = useBackupNag(publicAddresses);
  const reduce = useReducedMotion();

  if (isDeniabilityOrDemoActive() || !shouldShow) return null;

  return (
    // Below md the Layout bottom nav is on screen (md:hidden, ~4rem tall plus
    // the home-indicator inset), so sit above it rather than on top of it —
    // the TestFlight screenshot showed this card covering the nav.
    // md and up: SecurityAdvisor's Vigil launcher button also docks bottom-6
    // right-4 (h-14 = 3.5rem tall), so bottom-6 here sat the whole card on
    // top of it. bottom-24 (6rem) clears Vigil's top edge with headroom, and
    // max-w-xs (down from max-w-sm) trims the footprint over dashboard/list
    // content behind it (RSP-02, RTE-04).
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 flex justify-center p-4 md:inset-x-auto md:bottom-24 md:end-6">
      <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-background/95 p-4 shadow-2xl backdrop-blur">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2.5">
            {/* Vigil asleep — encrypted backup is NOT running on this wallet
                yet. A shield here claimed protection the user has not got (I4).
                Animated on entrance only: the sheet appearing is the state
                change, and Vigil.jsx forbids an idle decorative loop. */}
            <motion.div
              className="shrink-0"
              initial={reduce ? false : { scale: 0.7, opacity: 0, rotate: -6 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 15 }}
            >
              <Vigil state="asleep" size={44} shadow={false} />
            </motion.div>
            <p className="text-[15px] font-semibold text-foreground">Protect your wallet</p>
          </div>
          <button
            type="button"
            onClick={dismissForSession}
            className="-me-3 -mt-3 inline-flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
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
