import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Leaf, Plus, TreePine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const CHAINS_FOOTPRINT = [
  { chain: "ethereum", label: "Ethereum", kg_per_tx: 0.03 },
  { chain: "solana", label: "Solana", kg_per_tx: 0.00066 },
  { chain: "polygon", label: "Polygon", kg_per_tx: 0.00052 },
  { chain: "base", label: "Base", kg_per_tx: 0.01 },
];

const OFFSET_PROJECTS = [
  { name: "Amazon Rainforest Protection", provider: "KlimaDAO", cost_per_tonne: 8, icon: "🌳" },
  { name: "Solar Farm Development", provider: "Toucan Protocol", cost_per_tonne: 12, icon: "☀️" },
  { name: "Ocean Plastic Removal", provider: "Moss.Earth", cost_per_tonne: 25, icon: "🌊" },
  { name: "Wind Energy Credits", provider: "Verra", cost_per_tonne: 6, icon: "💨" },
];

export default function CarbonTracker() {
  const queryClient = useQueryClient();
  const [showOffset, setShowOffset] = useState(false);
  const [txCount, setTxCount] = useState({ ethereum: 10, solana: 50, polygon: 20, base: 5 });
  const [form, setForm] = useState({ project_name: "", provider: "", tonnes_offset: "", cost_usd: "", chain: "ethereum" });

  const { data: offsets = [] } = useQuery({ queryKey: ["carbon-offsets"], queryFn: () => base44.entities.CarbonOffset.list("-created_date") });

  const totalOffset = offsets.filter(o => o.status === "active").reduce((a, o) => a + (o.tonnes_offset || 0), 0);
  const totalSpent = offsets.reduce((a, o) => a + (o.cost_usd || 0), 0);

  const totalEmissions = CHAINS_FOOTPRINT.reduce((acc, c) => {
    const count = txCount[c.chain] || 0;
    return acc + (count * c.kg_per_tx) / 1000;
  }, 0);

  const netFootprint = Math.max(0, totalEmissions - totalOffset);

  const purchase = useMutation({
    mutationFn: () => base44.entities.CarbonOffset.create({ ...form, tonnes_offset: Number(form.tonnes_offset), cost_usd: Number(form.cost_usd), status: "active" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["carbon-offsets"] }); setShowOffset(false); toast.success("Carbon offset purchased!"); },
  });

  const quickOffset = (project) => {
    base44.entities.CarbonOffset.create({
      project_name: project.name, provider: project.provider,
      tonnes_offset: 1, cost_usd: project.cost_per_tonne, chain: "ethereum", status: "active",
    }).then(() => { queryClient.invalidateQueries({ queryKey: ["carbon-offsets"] }); toast.success(`Offset purchased from ${project.name}`); });
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Leaf className="h-6 w-6 text-green-400" /> Carbon Tracker</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track and offset your blockchain carbon footprint</p>
        </div>
        <Button onClick={() => setShowOffset(true)}><Plus className="h-4 w-4 mr-1.5" /> Buy Offset</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border border-border bg-card text-center">
          <p className="text-xl font-bold text-orange-400">{totalEmissions.toFixed(4)}</p>
          <p className="text-[10px] text-muted-foreground">Tonnes Emitted</p>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card text-center">
          <p className="text-xl font-bold text-green-400">{totalOffset.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground">Tonnes Offset</p>
        </div>
        <div className={`p-4 rounded-xl border text-center ${netFootprint === 0 ? "border-green-500/20 bg-green-500/5" : "border-border bg-card"}`}>
          <p className={`text-xl font-bold ${netFootprint === 0 ? "text-green-400" : "text-destructive"}`}>{netFootprint.toFixed(4)}</p>
          <p className="text-[10px] text-muted-foreground">Net Footprint</p>
        </div>
      </div>

      {netFootprint === 0 && totalOffset > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
          <TreePine className="h-4 w-4 text-green-400" />
          <p className="text-sm text-green-400 font-medium">Carbon neutral! Your blockchain activity is fully offset.</p>
        </div>
      )}

      <div>
        <p className="text-sm font-semibold mb-3">Estimated Emissions by Chain</p>
        <div className="space-y-2">
          {CHAINS_FOOTPRINT.map(c => {
            const count = txCount[c.chain] || 0;
            const kg = ((count * c.kg_per_tx) / 1000).toFixed(6);
            return (
              <div key={c.chain} className="p-3 rounded-xl border border-border bg-card flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex justify-between text-sm"><span className="font-medium">{c.label}</span><span className="text-muted-foreground">{kg} tCO2</span></div>
                </div>
                <div className="flex items-center gap-1">
                  <button className="text-muted-foreground px-1 text-sm" onClick={() => setTxCount(t => ({ ...t, [c.chain]: Math.max(0, (t[c.chain]||0) - 10) }))}>−</button>
                  <span className="text-xs w-8 text-center">{count} tx</span>
                  <button className="text-muted-foreground px-1 text-sm" onClick={() => setTxCount(t => ({ ...t, [c.chain]: (t[c.chain]||0) + 10 }))}>+</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold mb-3">Offset Projects</p>
        <div className="space-y-2">
          {OFFSET_PROJECTS.map(p => (
            <div key={p.name} className="p-3 rounded-xl border border-border bg-card flex items-center gap-3">
              <span className="text-2xl">{p.icon}</span>
              <div className="flex-1">
                <p className="text-sm font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.provider} · ${p.cost_per_tonne}/tonne</p>
              </div>
              <Button size="sm" className="h-7 text-xs" onClick={() => quickOffset(p)}>Buy 1t</Button>
            </div>
          ))}
        </div>
      </div>

      {offsets.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-3">My Offsets (${totalSpent.toFixed(2)} spent)</p>
          <div className="space-y-2">
            {offsets.map(o => (
              <div key={o.id} className="p-3 rounded-xl border border-green-500/20 bg-green-500/5 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium">{o.project_name}</p>
                  <p className="text-xs text-muted-foreground">{o.provider}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-green-400">{o.tonnes_offset}t</p>
                  <p className="text-xs text-muted-foreground">${o.cost_usd}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={showOffset} onOpenChange={setShowOffset}>
        <DialogContent>
          <DialogHeader><DialogTitle>Purchase Carbon Offset</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Project Name</Label><Input value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))} placeholder="e.g. Rainforest Protection" className="mt-1.5" /></div>
            <div><Label>Provider</Label><Input value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} placeholder="e.g. KlimaDAO" className="mt-1.5" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tonnes CO2</Label><Input type="number" value={form.tonnes_offset} onChange={e => setForm(f => ({ ...f, tonnes_offset: e.target.value }))} placeholder="1" className="mt-1.5" /></div>
              <div><Label>Cost (USD)</Label><Input type="number" value={form.cost_usd} onChange={e => setForm(f => ({ ...f, cost_usd: e.target.value }))} placeholder="12.00" className="mt-1.5" /></div>
            </div>
            <Button className="w-full" onClick={() => purchase.mutate()} disabled={!form.project_name || !form.tonnes_offset || purchase.isPending}>Purchase Offset</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}