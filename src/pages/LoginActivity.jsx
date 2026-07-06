// src/pages/LoginActivity.jsx
//
// Login Activity — read-only view of device access records. PROVISIONAL.
//
// AUDIT STATUS. The internal audit (2026-06-17, the mainnet gate) and the
// independent ECC third-party audit (2026-06-23) are both complete, but this
// page was not an individually named ECC scope item (see
// docs/audit-triage/ecc-independent-audit-2026-06-23.md) — so no per-feature
// independent audit claim is made here. Remains PROVISIONAL / BUILT.
//
// HONEST SCOPE. This page shows two things that already exist on-device:
//   1. lastUnlockAt — the previous session's unlock timestamp, stored in the
//      encrypted vault container at unlock time. A single value; not a per-unlock
//      history.
//   2. UserSession entity records — created/updated by SecurityCenter when the
//      wallet is opened on a new device. One record per device, not one per unlock.
//
// WHAT THIS IS NOT. Per the deniability design decision
// (docs/audit-log-login-activity-deniability-decision.md):
//   - No per-unlock event log — that would violate I3 (deniability) by creating
//     a metadata trail that can distinguish real vs. decoy wallet sessions.
//   - No credential-type recording — which credential was used is never stored.
//   - No new logging is introduced by this page. All data was already on-device
//     before this page existed.
//
// DENIABILITY (I3). UserSession records are not vault-scoped — they are shared
// device identifiers created at the browser/storage level, not per-set. They do
// not reveal which wallet-set is active. lastUnlockAt is read from the active
// set's container; it is not cross-set and does not leak set identity.
//
// For revocation actions, see /session-manager.

import { useQuery } from "@tanstack/react-query";
import { Activity, Monitor, Smartphone, Globe, Clock, Info } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useWallet } from "@/lib/WalletProvider";

function getDeviceIcon(ua) {
  if (!ua) return <Globe className="h-4 w-4" />;
  if (/iPhone|Android|Mobile/i.test(ua)) return <Smartphone className="h-4 w-4" />;
  return <Monitor className="h-4 w-4" />;
}

function parseUA(ua) {
  if (!ua) return "Unknown device";
  if (/Chrome/i.test(ua) && /Windows/i.test(ua)) return "Chrome on Windows";
  if (/Chrome/i.test(ua) && /Mac/i.test(ua)) return "Chrome on Mac";
  if (/Safari/i.test(ua) && /iPhone/i.test(ua)) return "Safari on iPhone";
  if (/Firefox/i.test(ua)) return "Firefox";
  if (/Android/i.test(ua)) return "Chrome on Android";
  return ua.slice(0, 40);
}

function formatTs(ts) {
  if (!ts) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ts));
  } catch {
    return String(ts);
  }
}

function relativeTime(ts) {
  if (!ts) return null;
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 2) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return null;
  }
}

export default function LoginActivity() {
  const { lastUnlockAt, isDecoy, isHidden } = useWallet();

  // I3 (deniability): decoy/hidden sessions must make zero backend calls.
  // Gate the query so base44.entities.UserSession.list is never invoked, and
  // render the same neutral empty/loading state — no UI tell that confirms a
  // decoy/hidden session.
  const sessionQueryEnabled = !isDecoy && !isHidden;
  const { data: sessions = [], isLoading, isError } = useQuery({
    queryKey: ["user-sessions-activity"],
    queryFn: () => base44.entities.UserSession.list("-last_active", 20),
    enabled: sessionQueryEnabled,
  });

  const activeSessions = sessions.filter((s) => s.status !== "revoked");
  const revokedSessions = sessions.filter((s) => s.status === "revoked");

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6" data-testid="login-activity">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl border border-border bg-card">
            <Activity className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Login Activity</h1>
            <p className="text-sm text-muted-foreground">
              Device access records — not a per-unlock event log
            </p>
          </div>
        </div>
      </div>

      {/* Honest scope note */}
      <div className="flex gap-2.5 p-4 rounded-xl border border-border bg-secondary/30 text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
        <p>
          This shows one record per device (not one per unlock) and the previous
          session&apos;s unlock time from the active vault. No unlock-event history
          is stored — see{" "}
          <a href="/session-manager" className="underline underline-offset-2 text-foreground">
            Session Manager
          </a>{" "}
          to revoke device access.
        </p>
      </div>

      {/* Last unlock on this device */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Previous session — this device</span>
        </div>
        {lastUnlockAt ? (
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-lg font-mono">{formatTs(lastUnlockAt)}</p>
            {relativeTime(lastUnlockAt) && (
              <span className="text-xs text-muted-foreground">
                ({relativeTime(lastUnlockAt)})
              </span>
            )}
          </div>
        ) : (isDecoy || isHidden) ? (
          <p className="text-sm text-muted-foreground mt-1">Not available in this session.</p>
        ) : (
          <p className="text-sm text-muted-foreground mt-1">
            No prior session recorded on this device.
          </p>
        )}
      </div>

      {/* Device session list */}
      <div className="space-y-3">
        <p className="text-sm font-semibold">Registered devices</p>

        {isLoading && (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 rounded-full border-2 border-border border-t-primary animate-spin" />
          </div>
        )}

        {!isLoading && isError && (
          <div className="text-center py-12 text-muted-foreground">
            <Monitor className="h-9 w-9 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Couldn't load device records</p>
            <p className="text-xs mt-1">Please try again.</p>
          </div>
        )}

        {!isLoading && !isError && sessions.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Monitor className="h-9 w-9 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No devices recorded yet</p>
            <p className="text-xs mt-1">
              A record is created when you open the wallet from a new browser or device.
            </p>
          </div>
        )}

        {activeSessions.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card"
          >
            <div className="h-9 w-9 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0">
              {getDeviceIcon(s.user_agent)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{parseUA(s.user_agent)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Last active: {formatTs(s.last_active)}
                {s.geo_country && s.geo_country !== "Unknown Location" && (
                  <span className="ml-2">· {s.geo_country}</span>
                )}
              </p>
            </div>
            <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent">
              active
            </span>
          </div>
        ))}

        {revokedSessions.length > 0 && (
          <>
            <p className="text-sm font-semibold text-muted-foreground pt-1">Revoked devices</p>
            {revokedSessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card opacity-60"
              >
                <div className="h-9 w-9 rounded-full bg-muted/30 text-muted-foreground flex items-center justify-center shrink-0">
                  {getDeviceIcon(s.user_agent)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate line-through text-muted-foreground">
                    {parseUA(s.user_agent)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Last active: {formatTs(s.last_active)}
                  </p>
                </div>
                <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-muted/20 text-muted-foreground">
                  revoked
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      <p className="text-xs text-muted-foreground border-t border-border pt-4">
        Per-unlock event history is not stored — doing so would create a metadata trail
        that could violate deniability guarantees (I3). This view shows device records
        and the vault-stored previous-session timestamp only.
      </p>
    </div>
  );
}
