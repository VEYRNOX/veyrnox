import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ScrollText, Plus, Shield, Clock, AlertTriangle, Heart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const TRIGGER_LABELS = {
  inactivity_90d: "90 days inactivity",
  inactivity_180d: "180 days inactivity",
  inactivity_365d: "1 year inactivity",
  manual: "Manual trigger only",
};

const ASSETS = ["BTC", "ETH", "USDT", "BNB", "SOL", "USDC", "XRP", "DOGE", "ADA", "TRX"];

export default function CryptoWillPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ beneficiary_name: "", beneficiary_address: "", beneficiary_email: "", allocation_percent: "", trigger_type: "inactivity_365d", message: "", assets: [] });

  const { data: wills = [] } = useQuery({ queryKey: ["crypto-wills"], queryFn: () => base44.entities.CryptoWill.list("-created_date") });

  const totalAlloc = wills.filter(w => w.status === "active").reduce((a, w) => a + (w.allocation_percent || 0), 0);

  const create = useMutation({
    mutationFn: () => base44.entities.CryptoWill.create({ ...form, allocation_percent: Number(form.allocation_percent), last_activity: new Date().toISOString(), status: "active" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["crypto-wills"] }); setShowCreate(false); setForm({ beneficiary_name: "", beneficiary_address: "", beneficiary_email: "", allocation_percent: "", trigger_type: "inactivity_365d", message: "", assets: [] }); toast.success("Estate plan entry created"); },
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.CryptoWill.update(id, { status: "cancelled" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["crypto-wills"] }); toast.success("Entry cancelled"); },
  });

  const toggleAsset = (asset) => setForm(f => ({ ...f, assets: f.assets.includes(asset) ? f.assets.filter(a => a !== asset) : [...f.assets, asset] }));

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ScrollText className="h-6 w-6 text-primary" /> Crypto Will</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Estate planning and time-locked asset transfers</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Beneficiary</Button>
      </div>

      <div className="flex items-start gap-3 p-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5">
        <Shield className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-400">Your assets will be automatically transferred to your designated beneficiaries based on the trigger conditions you set. Keep your activity up-to-date to prevent accidental triggers.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[{ label: "Beneficiaries", value: wills.filter(w=>w.status==="active").length },
          { label: "Total Allocated", value: `${totalAlloc}%`, color: totalAlloc > 100 ? "text-destructive" : "text-primary" },
          { label: "Unallocated", value: `${Math.max(0, 100 - totalAlloc)}%`, color: "text-green-400" }].map(s => (
          <div key={s.label} className="p-3 rounded-xl border border-border bg-card text-center">
            <p className={`text-xl font-bold ${s.color || "text-primary"}`}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {totalAlloc > 100 && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-destructive/20 bg-destructive/5">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-xs text-destructive">Total allocation exceeds 100%. Please adjust your beneficiary percentages.</p>
        </div>
      )}

      {wills.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-border rounded-2xl">
          <Heart className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground mb-3">No beneficiaries configured yet</p>
          <Button onClick={() => setShowCreate(true)}>Set Up Your Estate Plan</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {wills.map(will => (
            <div key={will.id} className={`p-4 rounded-xl border bg-card space-y-3 ${will.status === "active" ? "border-border" : "border-border opacity-60"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-sm">{will.beneficiary_name}</p>
                  <p className="text-xs font-mono text-muted-foreground truncate max-w-[200px]">{will.beneficiary_address}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-black text-primary">{will.allocation_percent}%</span>
                  <button onClick={() => remove.mutate(will.id)} className="text-muted-foreground hover:text-destructive transition-colors"><X className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Trigger: {TRIGGER_LABELS[will.trigger_type]}</span>
              </div>
              {will.assets?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {will.assets.map(a => <span key={a} className="text-[10px] bg-secondary px-2 py-0.5 rounded-full">{a}</span>)}
                </div>
              )}
              {will.message && <p className="text-xs text-muted-foreground italic border-l-2 border-primary/30 pl-2">"{will.message}"</p>}
            </div>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Beneficiary</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Beneficiary Name</Label><Input value={form.beneficiary_name} onChange={e => setForm(f => ({ ...f, beneficiary_name: e.target.value }))} placeholder="Full name" className="mt-1.5" /></div>
            <div><Label>Wallet Address</Label><Input value={form.beneficiary_address} onChange={e => setForm(f => ({ ...f, beneficiary_address: e.target.value }))} placeholder="0x..." className="mt-1.5 font-mono text-xs" /></div>
            <div><Label>Email (optional)</Label><Input type="email" value={form.beneficiary_email} onChange={e => setForm(f => ({ ...f, beneficiary_email: e.target.value }))} placeholder="alice@email.com" className="mt-1.5" /></div>
            <div><Label>Allocation (%)</Label><Input type="number" value={form.allocation_percent} onChange={e => setForm(f => ({ ...f, allocation_percent: e.target.value }))} placeholder="e.g. 50" min="1" max="100" className="mt-1.5" /></div>
            <div><Label>Transfer Trigger</Label>
              <Select value={form.trigger_type} onValueChange={v => setForm(f => ({ ...f, trigger_type: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TRIGGER_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assets to Transfer</Label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {ASSETS.map(a => (
                  <button key={a} onClick={() => toggleAsset(a)}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${form.assets.includes(a) ? "bg-primary text-primary-foreground border-primary" : "bg-secondary border-border text-muted-foreground"}`}>
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <div><Label>Personal Message</Label><Input value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="A message to your beneficiary..." className="mt-1.5" /></div>
            <Button className="w-full" onClick={() => create.mutate()} disabled={!form.beneficiary_name || !form.beneficiary_address || !form.allocation_percent || create.isPending}>Add Beneficiary</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}