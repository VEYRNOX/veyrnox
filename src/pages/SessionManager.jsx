import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Monitor, Smartphone, Globe, ShieldX, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

function getDeviceIcon(ua) {
  if (!ua) return <Globe className="h-4 w-4" />;
  if (/iPhone|Android|Mobile/i.test(ua)) return <Smartphone className="h-4 w-4" />;
  return <Monitor className="h-4 w-4" />;
}

function parseUA(ua) {
  if (!ua) return "Unknown Device";
  if (/Chrome/i.test(ua) && /Windows/i.test(ua)) return "Chrome on Windows";
  if (/Chrome/i.test(ua) && /Mac/i.test(ua)) return "Chrome on Mac";
  if (/Safari/i.test(ua) && /iPhone/i.test(ua)) return "Safari on iPhone";
  if (/Firefox/i.test(ua)) return "Firefox";
  if (/Android/i.test(ua)) return "Chrome on Android";
  return ua.slice(0, 40);
}

export default function SessionManager() {
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["user-sessions"],
    queryFn: () => base44.entities.UserSession.list("-created_date", 20),
  });

  const revoke = useMutation({
    mutationFn: (id) => base44.entities.UserSession.update(id, { status: "revoked" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-sessions"] }),
  });

  const revokeAll = useMutation({
    mutationFn: async () => {
      const active = sessions.filter(s => s.status !== "revoked");
      await Promise.all(active.map(s => base44.entities.UserSession.update(s.id, { status: "revoked" })));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-sessions"] }),
  });

  const activeSessions = sessions.filter(s => s.status !== "revoked");
  const revokedSessions = sessions.filter(s => s.status === "revoked");

  if (isLoading) return <div className="flex justify-center py-20"><div className="h-8 w-8 rounded-full border-4 border-border border-t-primary animate-spin" /></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Session Manager</h1>
          <p className="text-sm text-muted-foreground">View and revoke all active login sessions</p>
        </div>
        {activeSessions.length > 0 && (
          <Button variant="destructive" size="sm" disabled={revokeAll.isPending} onClick={() => revokeAll.mutate()}>
            Revoke All
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border border-border bg-card text-center">
          <p className="text-2xl font-bold text-green-500">{activeSessions.length}</p>
          <p className="text-xs text-muted-foreground">Active Sessions</p>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card text-center">
          <p className="text-2xl font-bold">{sessions.length}</p>
          <p className="text-xs text-muted-foreground">Total Sessions</p>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card text-center">
          <p className="text-2xl font-bold text-muted-foreground">{revokedSessions.length}</p>
          <p className="text-xs text-muted-foreground">Revoked</p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Monitor className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No sessions recorded</p>
          <p className="text-sm mt-1">Session history will appear here as you log in from different devices</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Active Sessions</p>
          {activeSessions.length === 0 && <p className="text-sm text-muted-foreground p-3">No active sessions</p>}
          {activeSessions.map(s => (
            <div key={s.id} className="flex items-center gap-3 p-4 rounded-xl border border-green-500/20 bg-card">
              <div className="h-9 w-9 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center shrink-0">
                {getDeviceIcon(s.user_agent)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{parseUA(s.user_agent)}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-muted-foreground">{s.geo_country || "Unknown Location"}</p>
                  {s.ip_address && <span className="text-xs font-mono text-muted-foreground">{s.ip_address}</span>}
                </div>
                <p className="text-[10px] text-muted-foreground">{new Date(s.created_date).toLocaleString("en-GB")}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <button onClick={() => revoke.mutate(s.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                  <ShieldX className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}

          {revokedSessions.length > 0 && (
            <>
              <p className="text-sm font-semibold pt-2">Revoked Sessions</p>
              {revokedSessions.map(s => (
                <div key={s.id} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card opacity-60">
                  <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-muted-foreground shrink-0">
                    {getDeviceIcon(s.user_agent)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-through text-muted-foreground">{parseUA(s.user_agent)}</p>
                    <p className="text-xs text-muted-foreground">{s.geo_country || "Unknown"} · {new Date(s.created_date).toLocaleDateString("en-GB")}</p>
                  </div>
                  <span className="text-xs text-destructive font-semibold">Revoked</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}