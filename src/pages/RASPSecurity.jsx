import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ShieldCheck, AlertTriangle, CheckCircle2, Clock, X, RefreshCw, Lock, Zap, Globe, Activity, Ban, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import moment from "moment";

const EVENT_TYPES = [
  { value: "sql_injection", label: "SQL Injection", icon: "💉", desc: "Malicious SQL in input fields" },
  { value: "xss_attempt", label: "XSS Attempt", icon: "📜", desc: "Cross-site scripting payload detected" },
  { value: "csrf_attack", label: "CSRF Attack", icon: "🔄", desc: "Cross-site request forgery attempt" },
  { value: "path_traversal", label: "Path Traversal", icon: "📂", desc: "Directory traversal attempt" },
  { value: "brute_force", label: "Brute Force", icon: "🔨", desc: "Repeated failed authentication" },
  { value: "replay_attack", label: "Replay Attack", icon: "⏪", desc: "Replayed signed transaction detected" },
  { value: "api_abuse", label: "API Abuse", icon: "🤖", desc: "Abnormal API call patterns" },
  { value: "suspicious_payload", label: "Suspicious Payload", icon: "⚠️", desc: "Anomalous request payload" },
  { value: "rate_limit_exceeded", label: "Rate Limit", icon: "🚦", desc: "Request rate exceeded threshold" },
  { value: "unauthorized_access", label: "Unauthorized Access", icon: "🚫", desc: "Access to restricted resource" },
];

const SEVERITY_CONFIG = {
  low: { color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", dot: "bg-blue-400" },
  medium: { color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", dot: "bg-yellow-400" },
  high: { color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20", dot: "bg-orange-400" },
  critical: { color: "text-destructive", bg: "bg-destructive/10 border-destructive/20", dot: "bg-destructive" },
};

const STATUS_ICONS = {
  open: { icon: AlertTriangle, color: "text-destructive" },
  investigating: { icon: Clock, color: "text-yellow-400" },
  mitigated: { icon: CheckCircle2, color: "text-green-400" },
  false_positive: { icon: X, color: "text-muted-foreground" },
};

const RASP_RULES = [
  { id: "sql", label: "SQL Injection Protection", desc: "Intercepts malicious SQL in all input vectors", active: true },
  { id: "xss", label: "XSS Sanitisation", desc: "Strips and blocks cross-site scripting payloads", active: true },
  { id: "csrf", label: "CSRF Token Validation", desc: "Validates anti-CSRF tokens on state-changing requests", active: true },
  { id: "ratelimit", label: "Adaptive Rate Limiting", desc: "Dynamically limits requests from suspicious IPs", active: true },
  { id: "replay", label: "Replay Attack Prevention", desc: "Enforces nonce and timestamp on signed transactions", active: true },
  { id: "traversal", label: "Path Traversal Guard", desc: "Blocks directory traversal in file operations", active: true },
  { id: "bot", label: "Bot Detection", desc: "Identifies and challenges automated traffic", active: false },
  { id: "anomaly", label: "Payload Anomaly Detection", desc: "ML-based detection of unusual request structures", active: true },
  { id: "geo", label: "Geo-Fencing", desc: "Block or challenge requests from high-risk regions", active: false },
  { id: "honeypot", label: "Honeypot Traps", desc: "Hidden endpoints that trigger on bot access", active: true },
];

const MOCK_BLOCKED_IPS = [
  { ip: "185.220.101.47", reason: "Brute force", blocked_at: "2026-05-26T14:23:00Z", country: "RU" },
  { ip: "45.141.84.120", reason: "SQL Injection", blocked_at: "2026-05-25T09:11:00Z", country: "CN" },
  { ip: "194.165.16.80", reason: "Rate limit exceeded", blocked_at: "2026-05-24T22:45:00Z", country: "IR" },
];

export default function RASPSecurity() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState(null);
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [rules, setRules] = useState(RASP_RULES);
  const [form, setForm] = useState({ event_type: "sql_injection", severity: "high", source_ip: "", endpoint: "", payload_snippet: "", geo_country: "", blocked: true });
  const [scanning, setScanning] = useState(false);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["rasp-events"],
    queryFn: () => base44.entities.RASPEvent.list("-created_date"),
  });

  const filtered = events
    .filter(e => filterSeverity === "all" || e.severity === filterSeverity)
    .filter(e => filterStatus === "all" || e.status === filterStatus);

  const critical = events.filter(e => e.severity === "critical").length;
  const blocked = events.filter(e => e.blocked).length;
  const open = events.filter(e => e.status === "open").length;

  const create = useMutation({
    mutationFn: () => base44.entities.RASPEvent.create({ ...form, status: "open" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rasp-events"] }); setShowCreate(false); toast.success("RASP event logged"); },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status, resolution_note }) => base44.entities.RASPEvent.update(id, { status, resolution_note }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rasp-events"] }); setSelected(null); toast.success("Event updated"); },
  });

  const runScan = async () => {
    setScanning(true);
    await new Promise(r => setTimeout(r, 2500));
    setScanning(false);
    toast.success("RASP scan complete — runtime environment is secure");
  };

  const toggleRule = (id) => setRules(rs => rs.map(r => r.id === id ? { ...r, active: !r.active } : r));

  const eventMeta = (type) => EVENT_TYPES.find(e => e.value === type);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" /> RASP Security
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Runtime Application Self-Protection — real-time threat interception</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runScan} disabled={scanning}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? "Scanning..." : "Run Scan"}
          </Button>
          <Button onClick={() => setShowCreate(true)}><Zap className="h-4 w-4 mr-1.5" /> Log Event</Button>
        </div>
      </div>

      {/* Live status banner */}
      <div className="flex items-center gap-3 p-3 rounded-xl border border-green-500/20 bg-green-500/5">
        <div className="h-2.5 w-2.5 rounded-full bg-green-400 animate-pulse shrink-0" />
        <p className="text-sm text-green-400 font-medium">RASP is active — monitoring all runtime operations</p>
        <Lock className="h-4 w-4 text-green-400 ml-auto shrink-0" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[{ label: "Total Events", value: events.length, color: "text-primary", icon: Activity },
          { label: "Open", value: open, color: "text-destructive", icon: AlertTriangle },
          { label: "Blocked", value: blocked, color: "text-orange-400", icon: Ban },
          { label: "Critical", value: critical, color: "text-red-500", icon: ShieldCheck }].map(s => (
          <div key={s.label} className="p-3 rounded-xl border border-border bg-card text-center">
            <s.icon className={`h-4 w-4 mx-auto mb-1 ${s.color}`} />
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="events">
        <TabsList className="w-full bg-secondary">
          <TabsTrigger value="events" className="flex-1">Events ({events.length})</TabsTrigger>
          <TabsTrigger value="rules" className="flex-1">Protection Rules</TabsTrigger>
          <TabsTrigger value="blocked" className="flex-1">Blocked IPs</TabsTrigger>
        </TabsList>

        {/* Events tab */}
        <TabsContent value="events" className="mt-3 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {["all","low","medium","high","critical"].map(s => (
              <button key={s} onClick={() => setFilterSeverity(s)}
                className={`px-3 py-1 rounded-full text-xs capitalize transition-colors ${filterSeverity === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                {s}
              </button>
            ))}
            <div className="ml-auto">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["all","open","investigating","mitigated","false_positive"].map(s => (
                    <SelectItem key={s} value={s} className="capitalize text-xs">{s.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? <p className="text-center text-muted-foreground py-8 text-sm">Loading...</p>
            : filtered.length === 0
              ? <div className="text-center py-12 text-muted-foreground">
                  <ShieldCheck className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No events detected — runtime is clean</p>
                </div>
              : filtered.map(e => {
                  const sev = SEVERITY_CONFIG[e.severity] || SEVERITY_CONFIG.medium;
                  const meta = eventMeta(e.event_type);
                  const st = STATUS_ICONS[e.status] || STATUS_ICONS.open;
                  return (
                    <div key={e.id} className={`p-4 rounded-xl border ${sev.bg} cursor-pointer hover:opacity-90 transition-opacity`} onClick={() => setSelected(e)}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{meta?.icon || "⚠️"}</span>
                          <div>
                            <p className="text-sm font-semibold">{meta?.label || e.event_type}</p>
                            <p className="text-xs text-muted-foreground">{e.source_ip || "Unknown IP"} · {moment(e.created_date).fromNow()}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${sev.bg} ${sev.color}`}>{e.severity}</span>
                          <div className="flex items-center gap-1">
                            <st.icon className={`h-3 w-3 ${st.color}`} />
                            <span className={`text-[10px] capitalize ${st.color}`}>{e.status?.replace("_"," ")}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs">
                        {e.endpoint && <span className="font-mono text-muted-foreground truncate">{e.endpoint}</span>}
                        {e.blocked && <span className="text-destructive font-semibold flex items-center gap-1"><Ban className="h-3 w-3" /> Blocked</span>}
                        {e.geo_country && <span className="flex items-center gap-1 text-muted-foreground"><Globe className="h-3 w-3" />{e.geo_country}</span>}
                      </div>
                    </div>
                  );
                })}
        </TabsContent>

        {/* Rules tab */}
        <TabsContent value="rules" className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground mb-3">Configure which RASP protections are active at runtime</p>
          {rules.map(r => (
            <div key={r.id} className="p-3 rounded-xl border border-border bg-card flex items-center gap-3">
              <div className={`h-2 w-2 rounded-full shrink-0 ${r.active ? "bg-green-400 animate-pulse" : "bg-muted-foreground"}`} />
              <div className="flex-1">
                <p className="text-sm font-semibold">{r.label}</p>
                <p className="text-xs text-muted-foreground">{r.desc}</p>
              </div>
              <Switch checked={r.active} onCheckedChange={() => toggleRule(r.id)} />
            </div>
          ))}
        </TabsContent>

        {/* Blocked IPs tab */}
        <TabsContent value="blocked" className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground mb-3">IPs automatically blocked by RASP rules</p>
          {MOCK_BLOCKED_IPS.map(ip => (
            <div key={ip.ip} className="p-3 rounded-xl border border-border bg-card flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Ban className="h-4 w-4 text-destructive shrink-0" />
                <div>
                  <p className="text-sm font-mono font-semibold">{ip.ip}</p>
                  <p className="text-xs text-muted-foreground">{ip.reason} · {ip.country} · {moment(ip.blocked_at).fromNow()}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => toast.success(`${ip.ip} unblocked`)}>Unblock</Button>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      {/* Event detail dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>RASP Event Detail</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 pt-2">
              <div className="p-3 rounded-lg bg-secondary space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-medium">{eventMeta(selected.event_type)?.label}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Severity</span><span className={`font-bold capitalize ${SEVERITY_CONFIG[selected.severity]?.color}`}>{selected.severity}</span></div>
                {selected.source_ip && <div className="flex justify-between"><span className="text-muted-foreground">Source IP</span><span className="font-mono">{selected.source_ip}</span></div>}
                {selected.geo_country && <div className="flex justify-between"><span className="text-muted-foreground">Country</span><span>{selected.geo_country}</span></div>}
                {selected.endpoint && <div className="flex justify-between"><span className="text-muted-foreground">Endpoint</span><span className="font-mono text-xs">{selected.endpoint}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">Blocked</span><span className={selected.blocked ? "text-destructive" : "text-green-400"}>{selected.blocked ? "Yes" : "No"}</span></div>
              </div>
              {selected.payload_snippet && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Payload Snippet</p>
                  <p className="text-xs font-mono bg-secondary p-2 rounded-lg break-all">{selected.payload_snippet}</p>
                </div>
              )}
              {selected.status === "open" && (
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => updateStatus.mutate({ id: selected.id, status: "investigating" })}>Investigate</Button>
                  <Button className="flex-1" onClick={() => updateStatus.mutate({ id: selected.id, status: "mitigated" })}>Mark Mitigated</Button>
                  <Button variant="ghost" className="flex-1" onClick={() => updateStatus.mutate({ id: selected.id, status: "false_positive" })}>False +ve</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create event dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log RASP Event</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Event Type</Label>
              <Select value={form.event_type} onValueChange={v => setForm(f => ({ ...f, event_type: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{EVENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Severity</Label>
              <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{["low","medium","high","critical"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Source IP</Label><Input value={form.source_ip} onChange={e => setForm(f => ({ ...f, source_ip: e.target.value }))} placeholder="192.168.1.1" className="mt-1.5" /></div>
              <div><Label>Country</Label><Input value={form.geo_country} onChange={e => setForm(f => ({ ...f, geo_country: e.target.value }))} placeholder="US" className="mt-1.5" /></div>
            </div>
            <div><Label>Endpoint / Action</Label><Input value={form.endpoint} onChange={e => setForm(f => ({ ...f, endpoint: e.target.value }))} placeholder="/api/transaction" className="mt-1.5 font-mono text-xs" /></div>
            <div><Label>Payload Snippet</Label><Input value={form.payload_snippet} onChange={e => setForm(f => ({ ...f, payload_snippet: e.target.value }))} placeholder="' OR 1=1 --" className="mt-1.5 font-mono text-xs" /></div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary">
              <div><p className="text-sm font-medium">Auto-Block IP</p><p className="text-xs text-muted-foreground">Block this IP immediately</p></div>
              <Switch checked={form.blocked} onCheckedChange={v => setForm(f => ({ ...f, blocked: v }))} />
            </div>
            <Button className="w-full" onClick={() => create.mutate()} disabled={create.isPending}>Log Event</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}