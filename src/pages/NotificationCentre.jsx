import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Bell, ShieldAlert, AlertTriangle, TrendingUp, CheckCircle2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { useNotifications } from "@/notify/useNotifications";

const TABS = ["All", "Alerts", "Security", "Fraud"];

// In-app notification display level -> the Centre's severity bucket.
const INAPP_SEVERITY = { risk: "high", caution: "medium", info: "low" };

// One-line body from an in-app notification's evidence (purely cosmetic — the
// evidence object is the same set-blind shape produced by notify.js).
function describeInApp(evidence = {}) {
  const short = (s) => (typeof s === "string" && s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s);
  if (evidence.amount && evidence.to) return `${evidence.amount} → ${short(evidence.to)}`;
  if (evidence.amount) return `${evidence.amount}`;
  if (evidence.reason) return evidence.reason;
  if (evidence.spender) return `Spender ${short(evidence.spender)}`;
  return "";
}

export default function NotificationCentre() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("All");

  // In-app session notifications — the SAME in-memory queue the header bell badge
  // and toast read (lifted into NotificationsProvider). Session-only, never
  // persisted, so the Centre can no longer disagree with the bell. Previously the
  // Centre read only the base44 alert entities and showed nothing for send/price
  // events, which surfaced as "All clear" even with unseen items on the bell.
  const { notifications: inAppNotes = [], dismiss: dismissInApp } = useNotifications();

  const { data: priceAlerts = [] } = useQuery({
    queryKey: ["price-alerts-triggered"],
    queryFn: () => base44.entities.PriceAlert.filter({ status: "triggered" }),
  });

  const { data: fraudAlerts = [] } = useQuery({
    queryKey: ["fraud-alerts-open"],
    queryFn: () => base44.entities.FraudAlert.filter({ status: "open" }),
  });

  const { data: raspEvents = [] } = useQuery({
    queryKey: ["rasp-open"],
    queryFn: () => base44.entities.RASPEvent.filter({ status: "open" }),
  });

  const { data: smartAlerts = [] } = useQuery({
    queryKey: ["smart-alerts"],
    queryFn: () => base44.entities.SmartAlert.list("-created_date", 10),
  });

  const dismissFraud = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.FraudAlert.update(id, { status: "dismissed" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fraud-alerts-open"] }),
  });

  const dismissPrice = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.PriceAlert.update(id, { status: "dismissed" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["price-alerts-triggered"] }),
  });

  const allNotifications = [
    ...inAppNotes.map(n => ({
      id: n.id, type: "inapp", category: (n.level === "caution" || n.level === "risk") ? "Security" : "Alerts",
      title: n.message,
      body: describeInApp(n.evidence),
      severity: INAPP_SEVERITY[n.level] || "low",
      time: n.ts,
      onDismiss: () => dismissInApp(n.id),
    })),
    ...priceAlerts.map(a => ({
      id: a.id, type: "alert", category: "Alerts",
      title: `${a.currency} Price Alert`,
      body: `Hit $${a.triggered_price?.toLocaleString() ?? a.target_price?.toLocaleString()}`,
      severity: "medium", time: a.updated_date || a.created_date,
      onDismiss: () => dismissPrice.mutate(a.id),
    })),
    ...fraudAlerts.map(a => ({
      id: a.id, type: "fraud", category: "Fraud",
      title: `Fraud: ${a.alert_type?.replace(/_/g, " ")}`,
      body: a.description,
      severity: a.severity, time: a.created_date,
      onDismiss: () => dismissFraud.mutate(a.id),
    })),
    ...raspEvents.map(a => ({
      id: a.id, type: "rasp", category: "Security",
      title: `Security: ${a.event_type?.replace(/_/g, " ")}`,
      body: `From ${a.source_ip || "unknown"} — ${a.blocked ? "Blocked" : "Allowed"}`,
      severity: a.severity, time: a.created_date,
      onDismiss: null,
    })),
    ...smartAlerts.map(a => ({
      id: a.id, type: "smart", category: "Alerts",
      title: a.name,
      body: a.description || "Triggered",
      severity: "low", time: a.created_date,
      onDismiss: null,
    })),
  ].sort((a, b) => (b.time ? new Date(b.time).getTime() : 0) - (a.time ? new Date(a.time).getTime() : 0));

  const filtered = tab === "All" ? allNotifications : allNotifications.filter(n => n.category === tab);

  const severityStyle = {
    critical: "text-destructive bg-destructive/10",
    high: "text-caution bg-caution/10",
    medium: "text-caution bg-caution/10",
    low: "text-info bg-info/10",
  };

  const typeIcon = (type) => {
    if (type === "alert") return <TrendingUp className="h-4 w-4 text-caution" />;
    if (type === "fraud") return <AlertTriangle className="h-4 w-4 text-caution" />;
    if (type === "rasp") return <ShieldAlert className="h-4 w-4 text-destructive" />;
    return <Bell className="h-4 w-4 text-info" />;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Notification Centre</h1>
          <p className="text-sm text-muted-foreground">{allNotifications.length} total notifications</p>
        </div>
        <div className="flex items-center gap-2">
          {allNotifications.length > 0 && (
            <Badge variant="destructive">{allNotifications.length}</Badge>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary rounded-xl p-1">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
              tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Notifications */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">All clear — no notifications</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => (
            <div key={n.id + n.type} className="flex items-start gap-3 p-4 rounded-2xl bg-card border border-border">
              <div className="h-8 w-8 rounded-xl bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                {typeIcon(n.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-medium truncate">{n.title}</p>
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${severityStyle[n.severity] || "text-muted-foreground bg-secondary"}`}>
                    {n.severity}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{n.body}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">{n.time && !isNaN(new Date(n.time).getTime()) ? formatDistanceToNow(new Date(n.time), { addSuffix: true }) : '—'}</p>
              </div>
              {n.onDismiss && (
                <button onClick={n.onDismiss} aria-label="Dismiss notification" className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}