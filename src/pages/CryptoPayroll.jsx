import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Users, DollarSign, Pause, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

const USD_RATES = { BTC: 68000, ETH: 3200, SOL: 165, USDC: 1, USDT: 1 };
const STATUS_BADGE = { active: "bg-green-500/10 text-green-500", paused: "bg-yellow-500/10 text-yellow-500", cancelled: "bg-destructive/10 text-destructive" };

export default function CryptoPayroll() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ recipient_name: "", recipient_address: "", currency: "USDC", amount: "", frequency: "monthly", role: "", note: "" });

  const { data: payroll = [] } = useQuery({ queryKey: ["payroll"], queryFn: () => base44.entities.CryptoPayroll.list("-created_date") });

  const create = useMutation({
    mutationFn: (d) => base44.entities.CryptoPayroll.create({ ...d, amount: parseFloat(d.amount), next_payment_date: getNextDate(d.frequency) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["payroll"] }); setOpen(false); setForm({ recipient_name: "", recipient_address: "", currency: "USDC", amount: "", frequency: "monthly", role: "", note: "" }); },
  });
  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => base44.entities.CryptoPayroll.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payroll"] }),
  });
  const remove = useMutation({
    mutationFn: (id) => base44.entities.CryptoPayroll.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payroll"] }),
  });

  function getNextDate(freq) {
    const d = new Date();
    if (freq === "weekly") d.setDate(d.getDate() + 7);
    else if (freq === "bi-weekly") d.setDate(d.getDate() + 14);
    else d.setMonth(d.getMonth() + 1);
    return d.toISOString().split("T")[0];
  }

  const activePayroll = payroll.filter(p => p.status === "active");
  const monthlyUSD = activePayroll.reduce((s, p) => {
    const usd = p.amount * (USD_RATES[p.currency] || 1);
    if (p.frequency === "weekly") return s + usd * 4;
    if (p.frequency === "bi-weekly") return s + usd * 2;
    return s + usd;
  }, 0);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Crypto Payroll</h1>
          <p className="text-sm text-muted-foreground">Schedule recurring salary payments in crypto</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Add Employee</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border border-border bg-card text-center">
          <Users className="h-5 w-5 mx-auto mb-1 text-primary" />
          <p className="text-2xl font-bold">{activePayroll.length}</p>
          <p className="text-xs text-muted-foreground">Active Recipients</p>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card text-center">
          <DollarSign className="h-5 w-5 mx-auto mb-1 text-green-500" />
          <p className="text-xl font-bold">${monthlyUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          <p className="text-xs text-muted-foreground">Monthly Total</p>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card text-center">
          <p className="text-2xl font-bold">{payroll.length}</p>
          <p className="text-xs text-muted-foreground">Total Recipients</p>
        </div>
      </div>

      {payroll.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-3">💸</p>
          <p className="font-medium">No payroll set up</p>
          <p className="text-sm mt-1">Add employees or contractors to schedule recurring crypto payments</p>
        </div>
      ) : (
        <div className="space-y-3">
          {payroll.map(p => (
            <div key={p.id} className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary shrink-0">
                    {p.recipient_name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{p.recipient_name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold capitalize ${STATUS_BADGE[p.status]}`}>{p.status}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{p.role || "Contractor"}</p>
                    <p className="text-xs font-mono text-muted-foreground truncate max-w-[200px]">{p.recipient_address}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold">{p.amount} {p.currency}</p>
                  <p className="text-xs text-muted-foreground capitalize">{p.frequency}</p>
                  {p.next_payment_date && <p className="text-[10px] text-muted-foreground">Next: {new Date(p.next_payment_date).toLocaleDateString("en-GB")}</p>}
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-3">
                <button onClick={() => updateStatus.mutate({ id: p.id, status: p.status === "active" ? "paused" : "active" })}
                  className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                  {p.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button onClick={() => remove.mutate(p.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Payroll Recipient</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name</Label><Input className="mt-1.5" placeholder="Alice Smith" value={form.recipient_name} onChange={e => setForm(f => ({ ...f, recipient_name: e.target.value }))} /></div>
              <div><Label>Role</Label><Input className="mt-1.5" placeholder="Developer" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} /></div>
            </div>
            <div><Label>Wallet Address</Label><Input className="mt-1.5 font-mono text-xs" placeholder="0x..." value={form.recipient_address} onChange={e => setForm(f => ({ ...f, recipient_address: e.target.value }))} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Amount</Label><Input className="mt-1.5" type="number" placeholder="500" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
              <div><Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{["BTC", "ETH", "SOL", "USDC", "USDT"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Frequency</Label>
                <Select value={form.frequency} onValueChange={v => setForm(f => ({ ...f, frequency: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{["weekly", "bi-weekly", "monthly"].map(f => <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full" disabled={!form.recipient_name || !form.recipient_address || !form.amount || create.isPending} onClick={() => create.mutate(form)}>
              {create.isPending ? "Saving..." : "Add to Payroll"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}