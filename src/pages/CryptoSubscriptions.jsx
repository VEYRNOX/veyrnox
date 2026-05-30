import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, RefreshCw, Pause, X, DollarSign, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const USD_RATES = { BTC: 68000, ETH: 3200, SOL: 165, USDC: 1, USDT: 1 };
const CAT_COLORS = { DeFi: "bg-blue-500/10 text-blue-500", SaaS: "bg-purple-500/10 text-purple-500", Media: "bg-pink-500/10 text-pink-500", Gaming: "bg-green-500/10 text-green-500", Storage: "bg-yellow-500/10 text-yellow-500", Other: "bg-secondary text-muted-foreground" };
const FREQ_MULT = { daily: 30, weekly: 4.33, monthly: 1, yearly: 1 / 12 };

export default function CryptoSubscriptions() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ service_name: "", amount: "", currency: "USDC", frequency: "monthly", category: "Other", to_address: "", description: "" });

  const { data: subs = [] } = useQuery({ queryKey: ["crypto-subscriptions"], queryFn: () => base44.entities.CryptoSubscription.list() });

  const create = useMutation({
    mutationFn: (d) => base44.entities.CryptoSubscription.create({ ...d, amount: parseFloat(d.amount) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crypto-subscriptions"] }); setOpen(false); setForm({ service_name: "", amount: "", currency: "USDC", frequency: "monthly", category: "Other", to_address: "", description: "" }); },
  });

  const togglePause = useMutation({
    mutationFn: ({ id, status }) => base44.entities.CryptoSubscription.update(id, { status: status === "active" ? "paused" : "active" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crypto-subscriptions"] }),
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.CryptoSubscription.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crypto-subscriptions"] }),
  });

  const activeSubs = subs.filter(s => s.status === "active");
  const monthlyTotal = activeSubs.reduce((sum, s) => sum + (s.amount || 0) * (USD_RATES[s.currency] || 1) * (FREQ_MULT[s.frequency] || 1), 0);
  const yearlyTotal = monthlyTotal * 12;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold">Crypto Subscriptions</h1><p className="text-sm text-muted-foreground">Track recurring on-chain payments and protocol fees</p></div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Add</Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Monthly Spend", value: `$${monthlyTotal.toFixed(2)}`, icon: <Calendar className="h-4 w-4 text-primary" /> },
          { label: "Annual Spend", value: `$${yearlyTotal.toFixed(2)}`, icon: <DollarSign className="h-4 w-4 text-orange-500" /> },
        ].map(s => (
          <div key={s.label} className="p-4 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 mb-1">{s.icon}<p className="text-xs text-muted-foreground">{s.label}</p></div>
            <p className="font-bold text-lg">{s.value}</p>
          </div>
        ))}
      </div>

      {subs.length === 0 ? (
        <div className="text-center py-14 text-muted-foreground">
          <RefreshCw className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No subscriptions tracked</p>
          <p className="text-sm mt-1">Add your DeFi protocol fees, SaaS tools, and recurring payments</p>
        </div>
      ) : (
        <div className="space-y-2">
          {subs.map(s => {
            const monthlyUSD = (s.amount || 0) * (USD_RATES[s.currency] || 1) * (FREQ_MULT[s.frequency] || 1);
            return (
              <div key={s.id} className={`p-4 rounded-xl border bg-card ${s.status === "paused" ? "opacity-60" : "border-border"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">{s.service_name?.charAt(0)}</div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{s.service_name}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${CAT_COLORS[s.category]}`}>{s.category}</span>
                        {s.status === "paused" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">Paused</span>}
                      </div>
                      <p className="text-xs text-muted-foreground capitalize">{s.amount} {s.currency} / {s.frequency} · ~${monthlyUSD.toFixed(2)}/mo</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => togglePause.mutate({ id: s.id, status: s.status })} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                      <Pause className="h-4 w-4" />
                    </button>
                    <button onClick={() => remove.mutate(s.id)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"><X className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Subscription</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div><Label>Service Name</Label><Input className="mt-1.5" placeholder="Aave Protocol, Netflix..." value={form.service_name} onChange={e => setForm(f => ({ ...f, service_name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount</Label><Input type="number" className="mt-1.5" placeholder="10" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
              <div><Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{["BTC","ETH","SOL","USDC","USDT"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Frequency</Label>
                <Select value={form.frequency} onValueChange={v => setForm(f => ({ ...f, frequency: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{["daily","weekly","monthly","yearly"].map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{["DeFi","SaaS","Media","Gaming","Storage","Other"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Recipient Address (optional)</Label><Input className="mt-1.5 font-mono text-xs" placeholder="0x..." value={form.to_address} onChange={e => setForm(f => ({ ...f, to_address: e.target.value }))} /></div>
            <Button className="w-full" disabled={!form.service_name || !form.amount || create.isPending} onClick={() => create.mutate(form)}>Add Subscription</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}