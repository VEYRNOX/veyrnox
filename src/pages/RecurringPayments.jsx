import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import CoinLogo from "@/components/CoinLogo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import moment from "moment";

const FREQ_LABELS = { daily: "Daily", weekly: "Weekly", biweekly: "Every 2 Weeks", monthly: "Monthly" };
const FREQ_DAYS = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };

const EMPTY = { label: "", wallet_id: "", currency: "USDT", to_address: "", amount: "", frequency: "monthly", note: "" };

export default function RecurringPayments() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["recurring-payments"],
    queryFn: () => base44.entities.RecurringPayment.list("-created_date"),
  });

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });

  const addPayment = useMutation({
    mutationFn: () => {
      const nextRun = moment().add(FREQ_DAYS[form.frequency], "days").toISOString();
      const wallet = wallets.find(w => w.id === form.wallet_id);
      return base44.entities.RecurringPayment.create({ ...form, amount: parseFloat(form.amount), currency: wallet?.currency || form.currency, next_run_at: nextRun, status: "active" });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["recurring-payments"] }); setShowAdd(false); setForm(EMPTY); toast.success("Recurring payment created"); },
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }) => base44.entities.RecurringPayment.update(id, { status: status === "active" ? "paused" : "active" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recurring-payments"] }),
  });

  const deletePayment = useMutation({
    mutationFn: (id) => base44.entities.RecurringPayment.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["recurring-payments"] }); toast.success("Payment deleted"); },
  });

  // Simulate running a due payment
  const runNow = useMutation({
    mutationFn: async (p) => {
      const wallet = wallets.find(w => w.id === p.wallet_id);
      if (!wallet || wallet.balance < p.amount) throw new Error("Insufficient balance");
      const txHash = "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
      await base44.entities.Transaction.create({ wallet_id: p.wallet_id, type: "send", amount: p.amount, currency: p.currency, to_address: p.to_address, from_address: wallet.address, status: "confirmed", tx_hash: txHash, note: `Recurring: ${p.label}` });
      await base44.entities.Wallet.update(p.wallet_id, { balance: wallet.balance - p.amount });
      const nextRun = moment().add(FREQ_DAYS[p.frequency], "days").toISOString();
      return base44.entities.RecurringPayment.update(p.id, { last_run_at: new Date().toISOString(), next_run_at: nextRun, total_sent: (p.total_sent || 0) + p.amount, run_count: (p.run_count || 0) + 1 });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["recurring-payments"] }); queryClient.invalidateQueries({ queryKey: ["wallets"] }); toast.success("Payment executed"); },
    onError: (e) => toast.error(e.message),
  });

  const totalMonthly = payments.filter(p => p.status === "active").reduce((s, p) => {
    const mult = { daily: 30, weekly: 4.3, biweekly: 2.15, monthly: 1 }[p.frequency] || 1;
    return s + p.amount * mult;
  }, 0);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Recurring Payments</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Automate regular crypto transfers</p>
        </div>
        <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1.5" /> New</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Active", value: payments.filter(p => p.status === "active").length },
          { label: "Paused", value: payments.filter(p => p.status === "paused").length },
          { label: "Monthly Est.", value: `${totalMonthly.toFixed(2)}` },
        ].map(s => (
          <div key={s.label} className="p-3 rounded-xl border border-border bg-card text-center">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className="text-lg font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {isLoading ? <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        : payments.length === 0 ? (
          <div className="text-center py-14 text-muted-foreground">
            <Repeat className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No recurring payments set up</p>
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map(p => {
              const wallet = wallets.find(w => w.id === p.wallet_id);
              const isDue = p.next_run_at && moment(p.next_run_at).isBefore(moment());
              return (
                <div key={p.id} className={`p-4 rounded-xl border bg-card ${p.status === "active" ? "border-border" : "border-border/40 opacity-60"}`}>
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Repeat className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{p.label}</p>
                        {isDue && p.status === "active" && <span className="text-[10px] bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded-full">Due</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">{p.amount} {p.currency} · {FREQ_LABELS[p.frequency]}</p>
                      <p className="text-xs font-mono text-muted-foreground truncate">{p.to_address}</p>
                      {wallet && <p className="text-xs text-muted-foreground">From: {wallet.name}</p>}
                      <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                        {p.next_run_at && <span>Next: {moment(p.next_run_at).fromNow()}</span>}
                        {p.run_count > 0 && <span>· {p.run_count} runs · {p.total_sent?.toFixed(4)} sent</span>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Switch checked={p.status === "active"} onCheckedChange={() => toggleStatus.mutate({ id: p.id, status: p.status })} />
                      {p.status === "active" && (
                        <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={() => runNow.mutate(p)} disabled={runNow.isPending}>Run</Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => deletePayment.mutate(p.id)}>
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
          <DialogHeader><DialogTitle>New Recurring Payment</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Label</Label><Input value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} placeholder="e.g. Rent" className="mt-1.5" /></div>
            <div>
              <Label>From Wallet</Label>
              <Select value={form.wallet_id} onValueChange={v => { const w = wallets.find(x => x.id === v); setForm(p => ({ ...p, wallet_id: v, currency: w?.currency || p.currency })); }}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select wallet" /></SelectTrigger>
                <SelectContent>{wallets.map(w => <SelectItem key={w.id} value={w.id}><span className="flex items-center gap-2"><CoinLogo symbol={w.currency} size={18} />{w.name} — {w.balance} {w.currency}</span></SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Recipient Address</Label><Input value={form.to_address} onChange={e => setForm(p => ({ ...p, to_address: e.target.value }))} placeholder="0x..." className="mt-1.5 font-mono text-sm" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount</Label><Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" className="mt-1.5" /></div>
              <div>
                <Label>Frequency</Label>
                <Select value={form.frequency} onValueChange={v => setForm(p => ({ ...p, frequency: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(FREQ_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Note (optional)</Label><Input value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} className="mt-1.5" /></div>
            <Button className="w-full" onClick={() => addPayment.mutate()} disabled={!form.label || !form.wallet_id || !form.to_address || !form.amount || addPayment.isPending}>Create Payment</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}