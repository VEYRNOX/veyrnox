import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Bell, Plus, Trash2, Zap, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import moment from "moment";

const CONDITIONS = {
  portfolio_drop: { label: "Portfolio Drop", desc: "Alert when portfolio drops by X%", unit: "%" },
  portfolio_gain: { label: "Portfolio Gain", desc: "Alert when portfolio gains X%", unit: "%" },
  daily_spend_limit: { label: "Daily Spend Limit", desc: "Alert when daily spending exceeds $X", unit: "USD" },
  single_tx_large: { label: "Large Single Tx", desc: "Alert when a single tx exceeds $X", unit: "USD" },
  wallet_balance_low: { label: "Low Wallet Balance", desc: "Alert when wallet balance < $X", unit: "USD" },
  pnl_target: { label: "P&L Target", desc: "Alert when P&L reaches $X", unit: "USD" },
};

const EMPTY = { title: "", condition: "portfolio_drop", asset: "", threshold: "", threshold_type: "percent", notify_email: true, notify_push: true };

export default function SmartAlerts() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["smart-alerts"],
    queryFn: () => base44.entities.SmartAlert.list("-created_date"),
  });

  const addAlert = useMutation({
    mutationFn: () => base44.entities.SmartAlert.create({ ...form, threshold: parseFloat(form.threshold), enabled: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smart-alerts"] });
      setShowAdd(false); setForm(EMPTY);
      toast.success("Smart alert created");
    },
  });

  const toggleAlert = useMutation({
    mutationFn: ({ id, enabled }) => base44.entities.SmartAlert.update(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["smart-alerts"] }),
  });

  const deleteAlert = useMutation({
    mutationFn: (id) => base44.entities.SmartAlert.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smart-alerts"] });
      toast.success("Alert deleted");
    },
  });

  const selectedCondition = CONDITIONS[form.condition];

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Smart Alerts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Automated portfolio event notifications</p>
        </div>
        <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1.5" /> New Alert</Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total", value: alerts.length },
          { label: "Active", value: alerts.filter(a => a.enabled).length },
          { label: "Triggered", value: alerts.filter(a => a.last_triggered).length },
        ].map(s => (
          <div key={s.label} className="p-3 rounded-xl border border-border bg-card text-center">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className="text-xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Alert list */}
      {isLoading ? (
        <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-14 text-muted-foreground">
          <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No smart alerts yet</p>
          <p className="text-xs mt-1">Create alerts to monitor your portfolio automatically</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map(a => {
            const cond = CONDITIONS[a.condition];
            return (
              <div key={a.id} className={`p-4 rounded-xl border bg-card transition-colors ${a.enabled ? "border-border" : "border-border/50 opacity-60"}`}>
                <div className="flex items-start gap-3">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${a.enabled ? "bg-primary/10" : "bg-secondary"}`}>
                    {a.enabled ? <Zap className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{cond?.label} · Threshold: {a.threshold}{a.threshold_type === "percent" ? "%" : " USD"}</p>
                    {a.asset && <p className="text-xs text-muted-foreground">Asset: {a.asset}</p>}
                    <div className="flex gap-3 mt-1">
                      {a.notify_email && <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-full">Email</span>}
                      {a.notify_push && <span className="text-[10px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded-full">Push</span>}
                      {a.last_triggered && <span className="text-[10px] text-muted-foreground">Triggered {moment(a.last_triggered).fromNow()}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch checked={a.enabled} onCheckedChange={v => toggleAlert.mutate({ id: a.id, enabled: v })} />
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 h-8 w-8" onClick={() => deleteAlert.mutate(a.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Smart Alert</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Alert Title</Label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. BTC Portfolio Drop" className="mt-1.5" />
            </div>
            <div>
              <Label>Condition</Label>
              <Select value={form.condition} onValueChange={v => setForm(p => ({ ...p, condition: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CONDITIONS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {selectedCondition && <p className="text-xs text-muted-foreground mt-1">{selectedCondition.desc}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Threshold ({selectedCondition?.unit})</Label>
                <Input type="number" value={form.threshold} onChange={e => setForm(p => ({ ...p, threshold: e.target.value }))} placeholder="e.g. 10" className="mt-1.5" />
              </div>
              <div>
                <Label>Asset (optional)</Label>
                <Select value={form.asset || "any"} onValueChange={v => setForm(p => ({ ...p, asset: v === "any" ? "" : v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    {["BTC", "ETH", "USDT", "BNB", "SOL", "USDC", "XRP", "DOGE", "ADA", "TRX"].map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notifications</Label>
              <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                <p className="text-sm">Email notifications</p>
                <Switch checked={form.notify_email} onCheckedChange={v => setForm(p => ({ ...p, notify_email: v }))} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                <p className="text-sm">Push notifications</p>
                <Switch checked={form.notify_push} onCheckedChange={v => setForm(p => ({ ...p, notify_push: v }))} />
              </div>
            </div>
            <Button className="w-full" onClick={() => addAlert.mutate()} disabled={!form.title || !form.threshold || addAlert.isPending}>
              Create Alert
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}