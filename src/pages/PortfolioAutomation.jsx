import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Bot, Plus, Zap, TrendingDown, TrendingUp, Bell, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import moment from "moment";

const RULE_TYPES = [
  { value: "stop_loss", label: "Stop Loss", icon: TrendingDown, color: "text-destructive", desc: "Sell when price drops" },
  { value: "take_profit", label: "Take Profit", icon: TrendingUp, color: "text-green-400", desc: "Sell when price rises" },
  { value: "rebalance_trigger", label: "Rebalance Trigger", icon: Zap, color: "text-primary", desc: "Rebalance on drift" },
  { value: "dca_boost", label: "DCA Boost", icon: Bot, color: "text-blue-400", desc: "Buy more on dips" },
  { value: "trailing_stop", label: "Trailing Stop", icon: TrendingDown, color: "text-yellow-400", desc: "Dynamic stop loss" },
];

const CONDITIONS = {
  stop_loss: ["price_drops_below"],
  take_profit: ["price_rises_above"],
  rebalance_trigger: ["portfolio_drift_exceeds"],
  dca_boost: ["price_drops_below"],
  trailing_stop: ["price_drops_below"],
};

const ACTIONS = {
  stop_loss: ["sell_all", "sell_percent", "notify_only"],
  take_profit: ["sell_all", "sell_percent", "notify_only"],
  rebalance_trigger: ["rebalance", "notify_only"],
  dca_boost: ["buy_percent", "notify_only"],
  trailing_stop: ["sell_all", "sell_percent", "notify_only"],
};

const ACTION_LABELS = { sell_all: "Sell All", sell_percent: "Sell %", buy_percent: "Buy %", rebalance: "Auto Rebalance", notify_only: "Notify Only" };

export default function PortfolioAutomation() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", rule_type: "stop_loss", asset: "BTC", trigger_condition: "price_drops_below", trigger_value: "", action: "notify_only", action_value: 100, enabled: true, note: "" });

  const { data: rules = [] } = useQuery({ queryKey: ["automation-rules"], queryFn: () => base44.entities.AutomationRule.list("-created_date") });

  const activeRules = rules.filter(r => r.enabled);
  const selectedType = RULE_TYPES.find(t => t.value === form.rule_type);

  const create = useMutation({
    mutationFn: () => base44.entities.AutomationRule.create({ ...form, trigger_value: parseFloat(form.trigger_value), trigger_count: 0 }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["automation-rules"] }); setShowCreate(false); setForm({ name: "", rule_type: "stop_loss", asset: "BTC", trigger_condition: "price_drops_below", trigger_value: "", action: "notify_only", action_value: 100, enabled: true, note: "" }); toast.success("Automation rule created"); },
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }) => base44.entities.AutomationRule.update(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automation-rules"] }),
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.AutomationRule.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["automation-rules"] }); toast.success("Rule deleted"); },
  });

  const RuleCard = ({ r }) => {
    const rt = RULE_TYPES.find(t => t.value === r.rule_type);
    return (
      <div className={`p-4 rounded-xl border bg-card space-y-2 ${r.enabled ? "border-border" : "border-border/40 opacity-60"}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {rt && <rt.icon className={`h-4 w-4 ${rt.color} shrink-0`} />}
            <div>
              <p className="text-sm font-semibold">{r.name}</p>
              <p className="text-xs text-muted-foreground">{rt?.label} · {r.asset}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Switch checked={r.enabled} onCheckedChange={v => toggle.mutate({ id: r.id, enabled: v })} />
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove.mutate(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="bg-secondary px-2 py-0.5 rounded-full text-muted-foreground capitalize">{r.trigger_condition?.replace(/_/g, " ")}: {r.trigger_value}{r.trigger_condition?.includes("drift") ? "%" : " USD"}</span>
          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full">{ACTION_LABELS[r.action]}{r.action_value && r.action !== "notify_only" && r.action !== "rebalance" ? ` ${r.action_value}%` : ""}</span>
        </div>
        {r.last_triggered && <p className="text-[10px] text-muted-foreground">Last triggered: {moment(r.last_triggered).fromNow()} · {r.trigger_count} times</p>}
      </div>
    );
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Bot className="h-6 w-6 text-primary" /> Portfolio Automation</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Set rules to automate your trading strategy</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1.5" /> New Rule</Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[{ label: "Active Rules", value: activeRules.length, icon: Zap, color: "text-primary" },
          { label: "Total Rules", value: rules.length, icon: Bot, color: "text-muted-foreground" }].map(s => (
          <div key={s.label} className="p-3 rounded-xl border border-border bg-card text-center">
            <s.icon className={`h-4 w-4 mx-auto mb-1 ${s.color}`} />
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Rule type quick-select */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Strategy Templates</p>
        <div className="grid grid-cols-2 gap-2">
          {RULE_TYPES.map(t => (
            <button key={t.value} onClick={() => { setForm(f => ({ ...f, rule_type: t.value, trigger_condition: CONDITIONS[t.value][0], action: ACTIONS[t.value][0] })); setShowCreate(true); }}
              className="p-3 rounded-xl border border-border bg-card text-left hover:border-primary/40 transition-colors">
              <t.icon className={`h-4 w-4 mb-1 ${t.color}`} />
              <p className="text-xs font-semibold">{t.label}</p>
              <p className="text-[10px] text-muted-foreground">{t.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {rules.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Your Rules ({rules.length})</p>
          {rules.map(r => <RuleCard key={r.id} r={r} />)}
        </div>
      )}

      {rules.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          <Bot className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No automation rules yet. Click a template above to get started.</p>
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Automation Rule</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Rule Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My stop loss" className="mt-1.5" /></div>
            <div><Label>Rule Type</Label>
              <Select value={form.rule_type} onValueChange={v => setForm(f => ({ ...f, rule_type: v, trigger_condition: CONDITIONS[v][0], action: ACTIONS[v][0] }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{RULE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Asset</Label>
              <Select value={form.asset} onValueChange={v => setForm(f => ({ ...f, asset: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{["BTC", "ETH", "USDT", "BNB", "SOL", "USDC", "XRP", "DOGE", "ADA", "TRX"].map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Condition</Label>
                <Select value={form.trigger_condition} onValueChange={v => setForm(f => ({ ...f, trigger_condition: v }))}>
                  <SelectTrigger className="mt-1.5 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{(CONDITIONS[form.rule_type] || []).map(c => <SelectItem key={c} value={c} className="text-xs capitalize">{c.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Value (USD/%)</Label><Input type="number" value={form.trigger_value} onChange={e => setForm(f => ({ ...f, trigger_value: e.target.value }))} placeholder="e.g. 60000" className="mt-1.5" /></div>
            </div>
            <div><Label>Action</Label>
              <Select value={form.action} onValueChange={v => setForm(f => ({ ...f, action: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{(ACTIONS[form.rule_type] || []).map(a => <SelectItem key={a} value={a}>{ACTION_LABELS[a]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {!["notify_only","rebalance"].includes(form.action) && <div><Label>Action Value (%)</Label><Input type="number" value={form.action_value} onChange={e => setForm(f => ({ ...f, action_value: e.target.value }))} placeholder="100" className="mt-1.5" /></div>}
            <div><Label>Note (optional)</Label><Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} className="mt-1.5" /></div>
            <Button className="w-full" onClick={() => create.mutate()} disabled={!form.name || !form.trigger_value || create.isPending}>Create Rule</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}