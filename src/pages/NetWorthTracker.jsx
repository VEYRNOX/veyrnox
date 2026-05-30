import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const USD_RATES = { BTC: 68000, ETH: 3200, SOL: 165, USDC: 1, USDT: 1 };
const CATEGORY_COLORS = { property: "#f97316", stocks: "#3b82f6", cash: "#22c55e", pension: "#a855f7", crypto: "#eab308", other: "#6b7280" };
const CATEGORY_ICONS = { property: "🏠", stocks: "📈", cash: "💵", pension: "🏛️", crypto: "₿", other: "📦" };

export default function NetWorthTracker() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", category: "crypto", value_usd: "", currency: "", note: "", is_liability: false });

  const { data: wallets = [] } = useQuery({ queryKey: ["wallets"], queryFn: () => base44.entities.Wallet.list() });
  const { data: manualAssets = [] } = useQuery({ queryKey: ["net-worth-assets"], queryFn: () => base44.entities.NetWorthAsset.list() });

  const create = useMutation({
    mutationFn: (d) => base44.entities.NetWorthAsset.create({ ...d, value_usd: parseFloat(d.value_usd) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["net-worth-assets"] }); setOpen(false); setForm({ name: "", category: "crypto", value_usd: "", currency: "", note: "", is_liability: false }); },
  });
  const remove = useMutation({
    mutationFn: (id) => base44.entities.NetWorthAsset.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["net-worth-assets"] }),
  });

  const cryptoValue = wallets.reduce((s, w) => s + (w.balance || 0) * (USD_RATES[w.currency] || 1), 0);
  const assets = manualAssets.filter(a => !a.is_liability);
  const liabilities = manualAssets.filter(a => a.is_liability);
  const totalAssets = cryptoValue + assets.reduce((s, a) => s + a.value_usd, 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.value_usd, 0);
  const netWorth = totalAssets - totalLiabilities;

  const pieData = [
    { name: "Crypto", value: cryptoValue, color: CATEGORY_COLORS.crypto },
    ...Object.entries(
      assets.reduce((acc, a) => { acc[a.category] = (acc[a.category] || 0) + a.value_usd; return acc; }, {})
    ).map(([cat, val]) => ({ name: cat.charAt(0).toUpperCase() + cat.slice(1), value: val, color: CATEGORY_COLORS[cat] }))
  ].filter(d => d.value > 0);

  const fmt = (n) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Net Worth Tracker</h1>
          <p className="text-sm text-muted-foreground">Total financial picture</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Add Asset</Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Assets", value: totalAssets, icon: <TrendingUp className="h-4 w-4 text-green-500" />, color: "text-green-500" },
          { label: "Liabilities", value: totalLiabilities, icon: <TrendingDown className="h-4 w-4 text-destructive" />, color: "text-destructive" },
          { label: "Net Worth", value: netWorth, icon: null, color: netWorth >= 0 ? "text-primary" : "text-destructive" },
        ].map(c => (
          <div key={c.label} className="p-4 rounded-xl border border-border bg-card text-center">
            <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
            <p className={`text-lg font-bold ${c.color}`}>{fmt(c.value)}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      {pieData.length > 0 && (
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-sm font-semibold mb-3">Asset Allocation</p>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={160}>
              <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value">
                {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie><Tooltip formatter={v => fmt(v)} /></PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5">
              {pieData.map(d => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />{d.name}</div>
                  <span className="font-medium">{fmt(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Crypto Wallets Row */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold">Crypto Wallets</p>
          <span className="text-sm font-bold">{fmt(cryptoValue)}</span>
        </div>
        {wallets.map(w => (
          <div key={w.id} className="flex justify-between text-sm py-1 border-b border-border/50 last:border-0">
            <span className="text-muted-foreground">{w.name} ({w.currency})</span>
            <span className="font-medium">{fmt((w.balance || 0) * (USD_RATES[w.currency] || 1))}</span>
          </div>
        ))}
      </div>

      {/* Manual Assets */}
      {[{ title: "Assets", items: assets }, { title: "Liabilities", items: liabilities }].map(({ title, items }) =>
        items.length > 0 && (
          <div key={title} className="p-4 rounded-xl border border-border bg-card">
            <p className="text-sm font-semibold mb-3">{title}</p>
            {items.map(a => (
              <div key={a.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                <span className="text-xl">{CATEGORY_ICONS[a.category] || "📦"}</span>
                <div className="flex-1"><p className="text-sm font-medium">{a.name}</p><p className="text-xs text-muted-foreground capitalize">{a.category}</p></div>
                <span className="font-semibold text-sm">{fmt(a.value_usd)}</span>
                <button onClick={() => remove.mutate(a.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Asset / Liability</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div><Label>Name</Label><Input className="mt-1.5" placeholder="e.g. Primary Residence" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{["property", "stocks", "cash", "pension", "crypto", "other"].map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Value (USD)</Label><Input className="mt-1.5" type="number" placeholder="0" value={form.value_usd} onChange={e => setForm(f => ({ ...f, value_usd: e.target.value }))} /></div>
            <div><Label>Note (optional)</Label><Input className="mt-1.5" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
            <div className="flex items-center gap-3"><Switch checked={form.is_liability} onCheckedChange={v => setForm(f => ({ ...f, is_liability: v }))} /><Label>This is a liability (debt)</Label></div>
            <Button className="w-full" disabled={!form.name || !form.value_usd || create.isPending} onClick={() => create.mutate(form)}>
              {create.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}