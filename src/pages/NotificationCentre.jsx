import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Bell, ShieldAlert, AlertTriangle, TrendingUp, CheckCircle2, X, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import moment from "moment";

const TABS = ["All", "Alerts", "Security", "Fraud"];

export default function NotificationCentre() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("All");

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
    mutationFn: (id) => base44.entities.FraudAlert.update(id, { status: "dismissed" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fraud-alerts-open"] }),
  });

  const dismissPrice = useMutation({
    mutationFn: (id) => base44.entities.PriceAlert.update(id, { status: "dismissed" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["price-alerts-triggered"] }),
  });

  const allNotifications = [
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
  ].sort((a, b) => new Date(b.time) - new Date(a.time));

  const filtered = tab === "All" ? allNotifications : allNotifications.filter(n => n.category === tab);

  const severityStyle = {
    critical: "text-red-500 bg-red-500/10",
    high: "text-orange-500 bg-orange-500/10",
    medium: "text-yellow-500 bg-yellow-500/10",
    low: "text-blue-500 bg-blue-500/10",
  };

  const typeIcon = (type) => {
    if (type === "alert") return <TrendingUp className="h-4 w-4 text-yellow-400" />;
    if (type === "fraud") return <AlertTriangle className="h-4 w-4 text-orange-400" />;
    if (type === "rasp") return <ShieldAlert className="h-4 w-4 text-red-400" />;
    return <Bell className="h-4 w-4 text-blue-400" />;
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
          <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
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
                <p className="text-[10px] text-muted-foreground/60 mt-1">{moment(n.time).fromNow()}</p>
              </div>
              {n.onDismiss && (
                <button onClick={n.onDismiss} className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors shrink-0">
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