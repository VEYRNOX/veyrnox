import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ShieldAlert, Info, AlertTriangle, ArrowUpRight, Lock, Settings, Wallet } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import moment from "moment";

const CATEGORY_ICONS = {
  transaction: ArrowUpRight,
  auth: Lock,
  settings: Settings,
  security: ShieldAlert,
  wallet: Wallet,
};

const SEVERITY_STYLES = {
  info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  warning: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  critical: "bg-destructive/10 text-destructive border-destructive/20",
};

const SEVERITY_ICONS = {
  info: Info,
  warning: AlertTriangle,
  critical: ShieldAlert,
};

export default function AuditLogPage() {
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => base44.entities.AuditLog.list("-created_date", 100),
  });

  const filtered = logs.filter(l => {
    if (filterCategory !== "all" && l.category !== filterCategory) return false;
    if (filterSeverity !== "all" && l.severity !== filterSeverity) return false;
    return true;
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Full history of all account actions</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {["transaction", "auth", "settings", "security", "wallet"].map(c => (
              <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severity</SelectItem>
            {["info", "warning", "critical"].map(s => (
              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShieldAlert className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No log entries found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(log => {
            const CategoryIcon = CATEGORY_ICONS[log.category] || Info;
            const SeverityIcon = SEVERITY_ICONS[log.severity || "info"] || Info;
            return (
              <div key={log.id} className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card">
                <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                  <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{log.action}</p>
                    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${SEVERITY_STYLES[log.severity || "info"]}`}>
                      <SeverityIcon className="h-2.5 w-2.5" />
                      {log.severity || "info"}
                    </span>
                    <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded capitalize">{log.category}</span>
                  </div>
                  {log.details && <p className="text-xs text-muted-foreground mt-0.5 truncate">{log.details}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">{moment(log.created_date).format("DD MMM YYYY, HH:mm:ss")}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}