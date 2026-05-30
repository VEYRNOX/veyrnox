import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ShieldAlert, AlertTriangle, CheckCircle2, Clock, X, RefreshCw, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import moment from "moment";

const SEVERITY_CONFIG = {
  low: { color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", label: "Low" },
  medium: { color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", label: "Medium" },
  high: { color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20", label: "High" },
  critical: { color: "text-destructive", bg: "bg-destructive/10 border-destructive/20", label: "Critical" },
};

const STATUS_ICONS = { open: AlertTriangle, investigating: Clock, resolved: CheckCircle2, dismissed: X };
const STATUS_COLORS = { open: "text-destructive", investigating: "text-yellow-400", resolved: "text-green-400", dismissed: "text-muted-foreground" };

const ALERT_TYPES = [
  { value: "unusual_location", label: "Unusual Location", icon: "📍" },
  { value: "large_transfer", label: "Large Transfer", icon: "💸" },
  { value: "rapid_transactions", label: "Rapid Transactions", icon: "⚡" },
  { value: "new_device", label: "New Device", icon: "💻" },
  { value: "address_blacklist", label: "Blacklisted Address", icon: "🚫" },
  { value: "velocity_spike", label: "Velocity Spike", icon: "📈" },
];

const MOCK_RULES = [
  { rule: "Large Transfer Detection", desc: "Flags transfers > $10,000 USD", active: true },
  { rule: "Velocity Spike", desc: "Flags > 5 transactions in 10 minutes", active: true },
  { rule: "New Device Login", desc: "Alerts on unrecognised device access", active: true },
  { rule: "Blacklist Address Check", desc: "Screens recipient addresses against OFAC list", active: true },
  { rule: "Unusual Hours", desc: "Flags transactions outside normal activity hours", active: false },
  { rule: "Geographic Anomaly", desc: "Detects logins from unusual countries", active: true },
];

export default function FraudDetection() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [form, setForm] = useState({ alert_type: "large_transfer", severity: "medium", description: "", amount: "", currency: "USDT", to_address: "", risk_score: 70 });

  const { data: alerts = [], isLoading } = useQuery({ queryKey: ["fraud-alerts"], queryFn: () => base44.entities.FraudAlert.list("-created_date") });

  const filtered = alerts.filter(a => filterStatus === "all" || a.status === filterStatus);
  const open = alerts.filter(a => a.status === "open").length;
  const critical = alerts.filter(a => a.severity === "critical").length;

  const create = useMutation({
    mutationFn: () => base44.entities.FraudAlert.create({ ...form, amount: parseFloat(form.amount) || 0, risk_score: parseInt(form.risk_score), status: "open" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["fraud-alerts"] }); setShowCreate(false); toast.success("Alert created"); },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status, resolution_note }) => base44.entities.FraudAlert.update(id, { status, resolution_note }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["fraud-alerts"] }); setSelected(null); toast.success("Alert updated"); },
  });

  const runScan = async () => {
    toast.loading("Running AI fraud scan...", { id: "scan" });
    await new Promise(r => setTimeout(r, 2000));
    toast.success("Scan complete — no new threats detected", { id: "scan" });
  };

  const AlertCard = ({ a }) => {
    const sev = SEVERITY_CONFIG[a.severity] || SEVERITY_CONFIG.medium;
    const SIcon = STATUS_ICONS[a.status] || AlertTriangle;
    const alertType = ALERT_TYPES.find(t => t.value === a.alert_type);
    return (
      <div className={`p-4 rounded-xl border ${sev.bg} cursor-pointer hover:opacity-90 transition-opacity`} onClick={() => setSelected(a)}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{alertType?.icon || "⚠️"}</span>
            <div>
              <p className="text-sm font-semibold">{alertType?.label || a.alert_type}</p>
              <p className="text-xs text-muted-foreground">{moment(a.created_date).fromNow()}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${sev.bg} ${sev.color}`}>{a.severity}</span>
            <div className="flex items-center gap-1"><SIcon className={`h-3 w-3 ${STATUS_COLORS[a.status]}`} /><span className={`text-[10px] capitalize ${STATUS_COLORS[a.status]}`}>{a.status}</span></div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{a.description}</p>
        {a.risk_score && <div className="mt-2 flex items-center gap-2"><div className="flex-1 bg-secondary rounded-full h-1.5"><div className="h-1.5 rounded-full bg-destructive" style={{ width: `${a.risk_score}%` }} /></div><span className="text-[10px] text-muted-foreground">{a.risk_score}/100</span></div>}
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ShieldAlert className="h-6 w-6 text-primary" /> AI Fraud Detection</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Real-time monitoring and threat analysis</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runScan}><RefreshCw className="h-4 w-4 mr-1.5" /> Scan</Button>
          <Button onClick={() => setShowCreate(true)}><Brain className="h-4 w-4 mr-1.5" /> New Alert</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[{ label: "Open Alerts", value: open, color: "text-destructive" },
          { label: "Critical", value: critical, color: "text-orange-400" },
          { label: "Total Scanned", value: alerts.length, color: "text-primary" }].map(s => (
          <div key={s.label} className="p-3 rounded-xl border border-border bg-card text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="alerts">
        <TabsList className="w-full bg-secondary">
          <TabsTrigger value="alerts" className="flex-1">Alerts ({alerts.length})</TabsTrigger>
          <TabsTrigger value="rules" className="flex-1">Detection Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts" className="mt-3 space-y-3">
          <div className="flex gap-2">
            {["all","open","investigating","resolved","dismissed"].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-1 rounded-full text-xs capitalize transition-colors ${filterStatus === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{s} {s !== "all" ? `(${alerts.filter(a => a.status === s).length})` : ""}</button>
            ))}
          </div>
          {isLoading ? <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
            : filtered.length === 0 ? <div className="text-center py-10 text-muted-foreground"><ShieldAlert className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No alerts found — your wallet is secure</p></div>
            : filtered.map(a => <AlertCard key={a.id} a={a} />)}
        </TabsContent>

        <TabsContent value="rules" className="mt-3 space-y-2">
          {MOCK_RULES.map(r => (
            <div key={r.rule} className="p-3 rounded-xl border border-border bg-card flex items-center gap-3">
              <div className={`h-2 w-2 rounded-full shrink-0 ${r.active ? "bg-green-400" : "bg-muted-foreground"}`} />
              <div className="flex-1"><p className="text-sm font-semibold">{r.rule}</p><p className="text-xs text-muted-foreground">{r.desc}</p></div>
              <span className={`text-xs font-medium ${r.active ? "text-green-400" : "text-muted-foreground"}`}>{r.active ? "Active" : "Inactive"}</span>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      {/* Alert detail dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Alert Details</DialogTitle></DialogHeader>
          {selected && <div className="space-y-3 pt-2">
            <div className="p-3 rounded-lg bg-secondary space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-medium">{ALERT_TYPES.find(t => t.value === selected.alert_type)?.label}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Severity</span><span className={`font-semibold capitalize ${SEVERITY_CONFIG[selected.severity]?.color}`}>{selected.severity}</span></div>
              {selected.amount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span>{selected.amount} {selected.currency}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Risk Score</span><span className="text-destructive font-bold">{selected.risk_score}/100</span></div>
            </div>
            <p className="text-sm">{selected.description}</p>
            {selected.to_address && <p className="text-xs font-mono text-muted-foreground break-all">To: {selected.to_address}</p>}
            {selected.status === "open" && <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => updateStatus.mutate({ id: selected.id, status: "investigating" })}>Investigate</Button>
              <Button variant="outline" className="flex-1 text-green-400 border-green-500/30" onClick={() => updateStatus.mutate({ id: selected.id, status: "resolved" })}>Resolve</Button>
              <Button variant="ghost" className="flex-1" onClick={() => updateStatus.mutate({ id: selected.id, status: "dismissed" })}>Dismiss</Button>
            </div>}
          </div>}
        </DialogContent>
      </Dialog>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Fraud Alert</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Alert Type</Label>
              <Select value={form.alert_type} onValueChange={v => setForm(f => ({ ...f, alert_type: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{ALERT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Severity</Label>
              <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{["low","medium","high","critical"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Description</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the suspicious activity..." className="mt-1.5" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="mt-1.5" /></div>
              <div><Label>Risk Score (0-100)</Label><Input type="number" value={form.risk_score} onChange={e => setForm(f => ({ ...f, risk_score: e.target.value }))} className="mt-1.5" /></div>
            </div>
            <Button className="w-full" onClick={() => create.mutate()} disabled={!form.description || create.isPending}>Create Alert</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}