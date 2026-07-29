// @ts-nocheck
// Persistent banner shown while the browser reports we are offline. Non-
// dismissable — it auto-hides when the browser fires the `online` event.
// Aria live=polite so a screen reader announces the state change once
// without preempting whatever the user is doing.
//
// Purely visual: no backend call, no telemetry. Safe under I2/I3 (no egress,
// no residual state) — the underlying `navigator.onLine` read is local and
// deniability-neutral.
import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/lib/useOnlineStatus";

export default function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center gap-2 border-t border-border bg-muted/95 px-4 py-2 text-sm text-foreground backdrop-blur"
    >
      <WifiOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <span>You appear to be offline. Some features may not work until the connection returns.</span>
    </div>
  );
}
