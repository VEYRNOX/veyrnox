import { USD_RATES } from "@/lib/cryptos";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, UserPlus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const CURRENCIES = ["BTC", "ETH", "USDT", "BNB", "SOL", "USDC", "XRP", "DOGE", "ADA", "TRX"];

export default function SplitBill() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", total_amount_usd: "", currency: "USDC", note: "" });
  const [participants, setParticipants] = useState([{ name: "", address: "", share: "" }]);

  const { data: bills = [] } = useQuery({ queryKey: ["split-bills"], queryFn: () => base44.entities.SplitBill.list("-created_date") });

  const create = useMutation({
    mutationFn: (d) => base44.entities.SplitBill.create(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["split-bills"] });
      setOpen(false);
      setForm({ title: "", total_amount_usd: "", currency: "USDC", note: "" });
      setParticipants([{ name: "", address: "", share: "" }]);
    },
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.SplitBill.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["split-bills"] }),
  });

  const markDone = useMutation({
    mutationFn: (id) => base44.entities.SplitBill.update(id, { status: "completed" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["split-bills"] }),
  });

  const addParticipant = () => setParticipants(p => [...p, { name: "", address: "", share: "" }]);
  const updateParticipant = (i, field, val) => setParticipants(p => p.map((x, idx) => idx === i ? { ...x, [field]: val } : x));
  const removeParticipant = (i) => setParticipants(p => p.filter((_, idx) => idx !== i));

  const totalShares = participants.reduce((s, p) => s + (parseFloat(p.share) || 0), 0);
  const total = parseFloat(form.total_amount_usd) || 0;
  const cryptoRate = USD_RATES[form.currency] || 1;

  const handleCreate = () => {
    const enriched = participants.map(p => ({
      ...p,
      share: parseFloat(p.share) || 0,
      amount_usd: (parseFloat(p.share) || 0) / 100 * total,
      amount_crypto: (parseFloat(p.share) || 0) / 100 * total / cryptoRate,
      paid: false,
    }));
    create.mutate({ ...form, total_amount_usd: total, participants: enriched });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Split Bill</h1>
          <p className="text-sm text-muted-foreground">Divide expenses among multiple wallet addresses</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> New Split</Button>
      </div>

      {bills.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-3">🤝</p>
          <p className="font-medium">No bills split yet</p>
          <p className="text-sm mt-1">Create a split bill to divide a shared expense in crypto</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bills.map(b => (
            <div key={b.id} className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{b.title}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${b.status === "completed" ? "bg-green-500/10 text-green-500" : "bg-yellow-500/10 text-yellow-500"}`}>
                      {b.status === "completed" ? "Done" : "Pending"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{b.note}</p>
                </div>
                <p className="font-bold text-lg">${(b.total_amount_usd || 0).toLocaleString()}</p>
              </div>
              {(b.participants || []).map((p, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-t border-border/50 first:border-0 text-sm">
                  <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center text-xs font-bold shrink-0">{p.name?.charAt(0) || "?"}</div>
                  <span className="flex-1 font-medium">{p.name}</span>
                  <span className="text-muted-foreground">{p.share}%</span>
                  <span className="font-semibold">{(p.amount_crypto || 0).toFixed(6)} {b.currency}</span>
                </div>
              ))}
              <div className="flex justify-end gap-2 mt-3">
                {b.status !== "completed" && (
                  <Button size="sm" variant="outline" onClick={() => markDone.mutate(b.id)} className="gap-1.5 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Mark Done
                  </Button>
                )}
                <button onClick={() => remove.mutate(b.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Split Bill</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div><Label>Bill Title</Label><Input className="mt-1.5" placeholder="Dinner at Nobu" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Total Amount (USD)</Label><Input className="mt-1.5" type="number" placeholder="200" value={form.total_amount_usd} onChange={e => setForm(f => ({ ...f, total_amount_usd: e.target.value }))} /></div>
              <div><Label>Pay In</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Participants</Label>
                <button onClick={addParticipant} className="text-xs text-primary flex items-center gap-1"><UserPlus className="h-3 w-3" /> Add</button>
              </div>
              {participants.map((p, i) => (
                <div key={i} className="flex gap-2 mb-2 items-center">
                  <Input placeholder="Name" className="flex-1 text-xs" value={p.name} onChange={e => updateParticipant(i, "name", e.target.value)} />
                  <Input placeholder="0x..." className="flex-1 font-mono text-xs" value={p.address} onChange={e => updateParticipant(i, "address", e.target.value)} />
                  <Input placeholder="%" className="w-16 text-xs" type="number" value={p.share} onChange={e => updateParticipant(i, "share", e.target.value)} />
                  {participants.length > 1 && <button onClick={() => removeParticipant(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              ))}
              <p className={`text-xs mt-1 ${Math.abs(totalShares - 100) > 0.5 ? "text-yellow-500" : "text-green-500"}`}>
                Total shares: {totalShares.toFixed(0)}% {Math.abs(totalShares - 100) > 0.5 ? "(must equal 100%)" : "✓"}
              </p>
            </div>
            {total > 0 && participants.some(p => p.share) && (
              <div className="p-3 rounded-lg bg-secondary/50 border border-border text-xs space-y-1">
                {participants.map((p, i) => {
                  const share = parseFloat(p.share) || 0;
                  const usd = share / 100 * total;
                  const crypto = usd / cryptoRate;
                  return share > 0 ? (
                    <div key={i} className="flex justify-between">
                      <span>{p.name || `Person ${i + 1}`}</span>
                      <span className="font-semibold">{crypto.toFixed(6)} {form.currency} (${usd.toFixed(2)})</span>
                    </div>
                  ) : null;
                })}
              </div>
            )}
            <Button className="w-full" disabled={!form.title || !form.total_amount_usd || Math.abs(totalShares - 100) > 0.5 || create.isPending} onClick={handleCreate}>
              {create.isPending ? "Creating..." : "Create Split"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}