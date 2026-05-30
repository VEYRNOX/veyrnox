import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, GitBranch, Zap, Clock, CheckCircle, XCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const USD_RATES = { BTC: 68000, ETH: 3200, SOL: 165, USDC: 1, USDT: 1 };

const CONDITION_LABELS = {
  price_drops_below: "Price drops below $",
  price_rises_above: "Price rises above $",
  price_drops_percent: "Price drops by %",
  price_rises_percent: "Price rises by %",
  time_based: "At scheduled time",
};

const STATUS_CFG = {
  active: { cls: "bg-green-500/10 text-green-500", icon: <Zap className="h-3 w-3" /> },
  triggered: { cls: "bg-blue-500/10 text-blue-500", icon: <CheckCircle className="h-3 w-3" /> },
  expired: { cls: "bg-secondary text-muted-foreground", icon: <Clock className="h-3 w-3" /> },
  cancelled: { cls: "bg-destructive/10 text-destructive", icon: <XCircle className="h-3 w-3" /> },
};

export default function ConditionalSwapPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", from_asset: "BTC", to_asset: "USDC", amount: "", amount_type: "fixed", condition_type: "price_drops_below", condition_value: "", reference_asset: "BTC", note: "" });

  const { data: rules = [] } = useQuery({ queryKey: ["conditional-swaps"], queryFn: () => base44.entities.ConditionalSwap.list() });

  const create = useMutation({
    mutationFn: (d) => base44.entities.ConditionalSwap.create({ ...d, amount: parseFloat(d.amount), condition_value: parseFloat(d.condition_value) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["conditional-swaps"] }); setOpen(false); setForm({ name: "", from_asset: "BTC", to_asset: "USDC", amount: "", amount_type: "fixed", condition_type: "price_drops_below", condition_value: "", reference_asset: "BTC", note: "" }); },
  });

  const cancel = useMutation({
    mutationFn: (id) => base44.entities.ConditionalSwap.update(id, { status: "cancelled" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conditional-swaps"] }),
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.ConditionalSwap.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conditional-swaps"] }),
  });

  const conditionText = (r) => {
    const prefix = CONDITION_LABELS[r.condition_type] || r.condition_type;
    const suffix = r.condition_type?.includes("percent") ? `${r.condition_value}% (${r.reference_asset})` : r.condition_type === "time_based" ? r.condition_value : `$${r.condition_value?.toLocaleString()} (${r.reference_asset})`;
    return prefix + suffix;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold">Conditional Swap Engine</h1><p className="text-sm text-muted-foreground">Automate swaps when price or time conditions are met</p></div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> New Rule</Button>
      </div>

      <div className="p-3 rounded-xl bg-secondary/30 border border-border text-xs text-muted-foreground">
        <GitBranch className="h-3.5 w-3.5 inline mr-1.5 text-primary" />
        Create "if this, then swap" rules. E.g. "If BTC drops below $60,000, swap 50% BTC → USDC automatically."
      </div>

      {rules.length === 0 ? (
        <div className="text-center py-14 text-muted-foreground"><GitBranch className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="font-medium">No rules yet</p><p className="text-sm mt-1">Create conditional swaps to automate your strategy</p></div>
      ) : (
        <div className="space-y-3">
          {rules.map(r => {
            const cfg = STATUS_CFG[r.status] || STATUS_CFG.active;
            return (
              <div key={r.id} className="p-4 rounded-xl border border-border bg-card">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-medium">{r.name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5 ${cfg.cls}`}>{cfg.icon}{r.status}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{r.from_asset} → {r.to_asset}</span>
                      <span>·</span>
                      <span>{r.amount} {r.amount_type === "percent_of_balance" ? "% of balance" : r.from_asset}</span>
                    </div>
                    <div className="mt-1.5 p-2 rounded-lg bg-secondary text-xs">
                      <span className="text-muted-foreground">IF </span>
                      <span className="font-medium">{conditionText(r)}</span>
                    </div>
                    {r.note && <p className="text-xs text-muted-foreground mt-1">{r.note}</p>}
                    <p className="text-[10px] text-muted-foreground mt-1">Triggered {r.times_triggered || 0}× {r.expiry ? `· Expires ${new Date(r.expiry).toLocaleDateString("en-GB")}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-1 ml-3 shrink-0">
                    {r.status === "active" && <button onClick={() => cancel.mutate(r.id)} className="text-xs px-2 py-1 rounded-lg bg-secondary text-muted-foreground hover:text-foreground">Cancel</button>}
                    <button onClick={() => remove.mutate(r.id)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Conditional Swap Rule</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div><Label>Rule Name</Label><Input className="mt-1.5" placeholder="BTC Crash Protection" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>From Asset</Label>
                <Select value={form.from_asset} onValueChange={v => setForm(f => ({ ...f, from_asset: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{["BTC","ETH","SOL","USDC","USDT"].map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>To Asset</Label>
                <Select value={form.to_asset} onValueChange={v => setForm(f => ({ ...f, to_asset: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{["BTC","ETH","SOL","USDC","USDT"].map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount</Label><Input type="number" className="mt-1.5" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
              <div><Label>Amount Type</Label>
                <Select value={form.amount_type} onValueChange={v => setForm(f => ({ ...f, amount_type: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="fixed">Fixed</SelectItem><SelectItem value="percent_of_balance">% of Balance</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Condition</Label>
                <Select value={form.condition_type} onValueChange={v => setForm(f => ({ ...f, condition_type: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(CONDITION_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Reference Asset</Label>
                <Select value={form.reference_asset} onValueChange={v => setForm(f => ({ ...f, reference_asset: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{["BTC","ETH","SOL"].map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Trigger Value</Label><Input type="number" className="mt-1.5" placeholder={form.condition_type?.includes("percent") ? "10" : "60000"} value={form.condition_value} onChange={e => setForm(f => ({ ...f, condition_value: e.target.value }))} /></div>
            <div><Label>Note (optional)</Label><Input className="mt-1.5" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
            <Button className="w-full" disabled={!form.name || !form.amount || !form.condition_value || create.isPending} onClick={() => create.mutate(form)}>Create Rule</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}