import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, AlertTriangle, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";

const CURRENCIES = ["BTC", "ETH", "USDT", "BNB", "SOL", "USDC", "XRP", "DOGE", "ADA", "TRX"];

export default function BudgetLimits() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ currency: "ETH", period: "monthly", limit_usd: "", alert_at_percent: 80, enabled: true });

  const { data: budgets = [], isError } = useQuery({ queryKey: ["budgets"], queryFn: () => base44.entities.BudgetLimit.list() });
  const { data: transactions = [] } = useQuery({ queryKey: ["transactions"], queryFn: () => base44.entities.Transaction.list("-created_date", 500) });

  const create = useMutation({
    mutationFn: (/** @type {any} */ d) => base44.entities.BudgetLimit.create({ ...d, limit_usd: parseFloat(d.limit_usd) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["budgets"] }); setOpen(false); setForm({ currency: "ETH", period: "monthly", limit_usd: "", alert_at_percent: 80, enabled: true }); },
  });
  const remove = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.BudgetLimit.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["budgets"] }),
  });
  const toggle = useMutation({
    mutationFn: (/** @type {any} */ vars) => base44.entities.BudgetLimit.update(vars.id, { enabled: vars.enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["budgets"] }),
  });

  const getSpent = (budget) => {
    const now = new Date();
    const periodStart = new Date();
    if (budget.period === "daily") periodStart.setDate(now.getDate() - 1);
    else if (budget.period === "weekly") periodStart.setDate(now.getDate() - 7);
    else periodStart.setDate(1);

    return transactions
      .filter(tx => tx.type === "send" && tx.currency === budget.currency && new Date(tx.created_date) >= periodStart)
      .reduce((s, tx) => s + (tx.amount || 0), 0);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Budget &amp; Spending Limits</h1>
          <p className="text-sm text-muted-foreground">Set limits per currency and period</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Add Limit</Button>
      </div>

      <div className="p-4 rounded-xl border border-border bg-card">
        <p className="text-xs text-muted-foreground">Limits track native amounts sent per currency — no USD conversion</p>
      </div>

      {isError && (
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Couldn’t load your budget limits — they may not all be shown.</span>
        </div>
      )}

      {budgets.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-3">💰</p>
          <p className="font-medium">No budget limits set</p>
          <p className="text-sm mt-1">Set spending limits to stay in control of your crypto outflows</p>
        </div>
      ) : (
        <div className="space-y-3">
          {budgets.map(b => {
            const spent = getSpent(b);
            const pct = Math.min((spent / b.limit_usd) * 100, 100);
            const isAlert = pct >= b.alert_at_percent;
            const isOver = pct >= 100;
            return (
              <div key={b.id} className={`p-4 rounded-xl border bg-card transition-colors ${isOver ? "border-destructive/40" : isAlert ? "border-caution/40" : "border-border"}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{b.currency}</span>
                    <span className="text-xs text-muted-foreground capitalize bg-secondary px-1.5 py-0.5 rounded">{b.period}</span>
                    {isOver
                      ? <AlertTriangle className="h-4 w-4 text-destructive" />
                      : isAlert
                      ? <AlertTriangle className="h-4 w-4 text-caution" />
                      : <CheckCircle2 className="h-4 w-4 text-success" />}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={b.enabled} onCheckedChange={v => toggle.mutate({ id: b.id, enabled: v })} />
                    <button onClick={() => remove.mutate(b.id)} aria-label="Delete budget limit" className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <Progress value={pct} className="h-2 mb-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{spent.toLocaleString(undefined, { maximumFractionDigits: 6 })} {b.currency} sent</span>
                  <span className={isOver ? "text-destructive font-semibold" : ""}>{b.limit_usd.toLocaleString()} {b.currency} limit · {pct.toFixed(0)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Set Budget Limit</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Period</Label>
                <Select value={form.period} onValueChange={v => setForm(f => ({ ...f, period: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{["daily", "weekly", "monthly"].map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label htmlFor="budget-limit">Limit (native amount)</Label><Input id="budget-limit" className="mt-1.5" type="number" placeholder="e.g. 0.5 for ETH" value={form.limit_usd} onChange={e => setForm(f => ({ ...f, limit_usd: e.target.value }))} /></div>
            <div><Label htmlFor="budget-alert">Alert at (%)</Label><Input id="budget-alert" className="mt-1.5" type="number" placeholder="80" value={form.alert_at_percent} onChange={e => setForm(f => ({ ...f, alert_at_percent: parseInt(e.target.value) }))} /></div>
            <Button className="w-full" disabled={!form.limit_usd || create.isPending} onClick={() => create.mutate(form)}>
              {create.isPending ? "Saving..." : "Save Limit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}