import { AlertTriangle } from "lucide-react";
import { PARTIAL_TOTAL_NOTE } from "@/lib/balanceDisplay";

// I4 fail-closed: a portfolio total / derived figure that includes a FAILED
// balance read is incomplete — say so rather than presenting a silently-
// understated number as fact. Session-agnostic (identical copy in decoy and
// real sessions; no isDecoy branch). Render conditionally on the caller's
// `indeterminate` flag. Uses the existing `caution` token — no new colours.
export default function IncompleteBalanceNote({ className = "" }) {
  return (
    <div
      role="status"
      className={`p-3 rounded-xl border border-caution/30 bg-caution/10 flex items-start gap-2 text-xs text-caution ${className}`}
    >
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{PARTIAL_TOTAL_NOTE}</span>
    </div>
  );
}
