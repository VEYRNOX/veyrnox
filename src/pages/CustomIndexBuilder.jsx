import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { TOP_CRYPTOS, TOP_SYMBOLS } from "@/lib/cryptos";

// Top 10 by market cap, from the canonical source. COLORS is index-aligned to ASSETS.
const ASSETS = TOP_SYMBOLS;
const COLORS = TOP_CRYPTOS.map(c => c.color);
const PERF = { BTC: 8.2, ETH: 12.4, USDT: 0, BNB: 9.6, SOL: 23.1, USDC: 0, XRP: -3.4, DOGE: 15.2, ADA: -1.7, TRX: 5.1 };

export default function CustomIndexBuilder() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [freq, setFreq] = useState("monthly");
  const [components, setComponents] = useState([{ asset: "BTC", weight: 50 }, { asset: "ETH", weight: 50 }]);

  const { data: indexes = [] } = useQuery({ queryKey: ["custom-indexes"], queryFn: () => base44.entities.CustomIndex.list() });

  const totalWeight = components.reduce((s, c) => s + (parseFloat(/** @type {any} */ (c.weight)) || 0), 0);

  const addComponent = () => setComponents(c => [...c, { asset: "SOL", weight: 0 }]);
  const removeComponent = (i) => setComponents(c => c.filter((_, idx) => idx !== i));
  const updateComponent = (i, field, val) => setComponents(c => c.map((item, idx) => idx === i ? { ...item, [field]: val } : item));

  const create = useMutation({
    mutationFn: () => base44.entities.CustomIndex.create({ name, description: desc, components, rebalance_frequency: freq, base_value: 1000, status: "active" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["custom-indexes"] }); setOpen(false); setName(""); setDesc(""); setComponents([{ asset: "BTC", weight: 50 }, { asset: "ETH", weight: 50 }]); },
  });

  const remove = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.CustomIndex.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-indexes"] }),
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold">Custom Index Builder</h1><p className="text-sm text-muted-foreground">Build and track your own crypto index baskets</p></div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> New Index</Button>
      </div>

      {indexes.length === 0 ? (
        <div className="text-center py-14 text-muted-foreground">
          <LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No indexes yet</p>
          <p className="text-sm mt-1">Create a custom weighted index to track</p>
        </div>
      ) : (
        <div className="space-y-4">
          {indexes.map(idx => {
            const perf = (idx.components || []).reduce((s, c) => s + (PERF[c.asset] || 0) * ((c.weight || 0) / 100), 0);
            const chartData = (idx.components || []).map(c => ({ name: c.asset, value: parseFloat(c.weight) || 0 }));
            return (
              <div key={idx.id} className="p-4 rounded-xl border border-border bg-card">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold">{idx.name}</p>
                    {idx.description && <p className="text-xs text-muted-foreground">{idx.description}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">Rebalances {idx.rebalance_frequency}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${perf >= 0 ? "text-green-500" : "text-destructive"}`}>{perf >= 0 ? "+" : ""}{perf.toFixed(1)}%</span>
                    <button onClick={() => remove.mutate(idx.id)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="35%" height={100}>
                    <PieChart><Pie data={chartData} cx="50%" cy="50%" innerRadius={28} outerRadius={45} dataKey="value">
                      {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie><Tooltip formatter={v => [`${v}%`]} /></PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1">
                    {(idx.components || []).map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{c.asset}</div>
                        <span className="font-semibold">{c.weight}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create Custom Index</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2 max-h-[70vh] overflow-y-auto pr-1">
            <div><Label>Index Name</Label><Input className="mt-1.5" placeholder="My DeFi Index" value={name} onChange={e => setName(e.target.value)} /></div>
            <div><Label>Description (optional)</Label><Input className="mt-1.5" value={desc} onChange={e => setDesc(e.target.value)} /></div>
            <div><Label>Rebalance Frequency</Label>
              <Select value={freq} onValueChange={setFreq}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{["weekly","monthly","quarterly","manually"].map(f => <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Components</Label>
                <span className={`text-xs font-semibold ${Math.abs(totalWeight - 100) < 1 ? "text-green-500" : "text-yellow-500"}`}>Total: {totalWeight}%</span>
              </div>
              <div className="space-y-2">
                {components.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Select value={c.asset} onValueChange={v => updateComponent(i, "asset", v)}>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>{ASSETS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" min="0" max="100" value={c.weight} onChange={e => updateComponent(i, "weight", parseFloat(e.target.value) || 0)} className="w-20" />
                    <span className="text-xs text-muted-foreground">%</span>
                    <button onClick={() => removeComponent(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="outline" className="mt-2 w-full gap-1" onClick={addComponent}><Plus className="h-3.5 w-3.5" /> Add Asset</Button>
            </div>
            <Button className="w-full" disabled={!name || Math.abs(totalWeight - 100) > 1 || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "Creating..." : "Create Index"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}