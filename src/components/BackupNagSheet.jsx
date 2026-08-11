// BackupNagSheet — post-unlock backup nudge. Slice G+H plan §3.
//
// Wraps <WalletCreatedFlash compact /> in a lightweight fixed-position card
// (no radix Sheet — this is not modal/blocking, just a nudge above dashboard
// content, and the plain-card fallback is explicitly allowed by the plan).
//
// CRITICAL: mount must NOT call markBackupNagShown() (avoids the
// self-unmount race documented in the plan) — only the two user-action
// handlers touch cadence state, via useBackupNag()'s returned functions.
// Parent (WalletEntry) already gates rendering on !isDeniabilityOrDemoActive();
// this component re-checks (I3 defence-in-depth, matches the FirstRunTour/
// consent pattern) so it never renders in decoy/demo even if mis-mounted.

// Import "react-router" to match the rest of the codebase (WalletEntry.jsx etc.)
import { useNavigate } from "react-router";
import WalletCreatedFlash from "@/components/WalletCreatedFlash";
import { useBackupNag } from "@/lib/useBackupNag";
import { isDeniabilityOrDemoActive } from "@/wallet-core/deniabilitySession";

export default function BackupNagSheet({ publicAddresses }) {
  const navigate = useNavigate();
  const { shouldShow, dismissForSession, promoteToCompleted } = useBackupNag(publicAddresses);

  if (isDeniabilityOrDemoActive() || !shouldShow) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center p-4 sm:inset-x-auto sm:bottom-6 sm:end-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-background/95 p-4 shadow-2xl backdrop-blur">
        <WalletCreatedFlash
          compact
          onPrimary={() => {
            promoteToCompleted();
            navigate("/personal-backup");
          }}
          onDismiss={() => {
            dismissForSession();
          }}
        />
      </div>
    </div>
  );
}
