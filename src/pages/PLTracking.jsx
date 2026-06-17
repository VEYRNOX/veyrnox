import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { toast } from "sonner";
import moment from "moment";
import { isLivePricesEnabled, useLivePrices } from "@/lib/priceFeed";

const ASSETS = ["BTC", "ETH", "USDT", "BNB", "SOL", "USDC", "XRP", "DOGE", "ADA", "TRX"];

const EMPTY = { asset: "BTC", entry_price: "", exit_price: "", quantity: "", entry_date: "", exit_date: "", status: "open", note: "" };

export default function PLTracking() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const liveOn = isLivePricesEnabled();
  const { prices } = useLivePrices();
  const livePrice = (asset) => (liveOn ? (prices?.[asset] ?? null) : null);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["pl-records"],
    queryFn: () => base44.entities.PLRecord.list("-created_date"),
  });

  const addRecord = useMutation({
    mutationFn: () => {
      const qty = parseFloat(form.quantity);
      const entryP = parseFloat(form.entry_price);
      if (form.status === "closed") {
        const exitP = parseFloat(form.exit_price);
        const pnl_usd = (exitP - entryP) * qty;
        const pnl_pct = ((exitP - entryP) / entryP) * 100;
        return base44.entities.PLRecord.create({ ...form, entry_price: entryP, exit_price: exitP, quantity: qty, pnl_usd, pnl_pct });
      }
      return base44.entities.PLRecord.create({ ...form, entry_price: entryP, quantity: qty, exit_price: null, pnl_usd: null, pnl_pct: null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pl-records"] });
      setShowAdd(false); setForm(EMPTY);
      toast.success("Trade recorded");
    },
  });

  const closeRecord = useMutation({
    mutationFn: ({ id, entry_price, quantity, exitP }) => {
      const pnl_usd = (exitP - entry_price) * quantity;
      const pnl_pct = ((exitP - entry_price) / entry_price) * 100;
      return base44.entities.PLRecord.update(id, { status: "closed", exit_price: exitP, exit_date: new Date().toISOString(), pnl_usd, pnl_pct });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pl-records"] }),
  });

  const deleteRecord = useMutation({
    mutationFn: (id) => base44.entities.PLRecord.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pl-records"] }),
  });

  const closed = records.filter(r => r.status === "closed");
  const open = records.filter(r => r.status === "open");
  const totalRealised = closed.reduce((s, r) => s + (r.pnl_usd || 0), 0);

  // Unrealised P&L — only from open positions where we have a live price.
  const openWithPrice = open.filter(r => livePrice(r.asset) != null);
  const totalUnrealised = openWithPrice.reduce((s, r) => s + (livePrice(r.asset) - r.entry_price) * r.quantity, 0);
  const showUnrealised = openWithPrice.length > 0;

  const winRate = closed.length ? Math.round((closed.filter(r => r.pnl_usd > 0).length / closed.length) * 100) : 0;

  const chartData = closed.slice(0, 10).reverse().map(r => ({ label: `${r.asset} ${moment(r.exit_date || r.created_date).format("MMM D")}`, pnl: parseFloat(r.pnl_usd?.toFixed(2) || 0) }));

  const RecordRow = ({ r }) => {
    const curP = r.status === "open" ? livePrice(r.asset) : null;
    const unrealisedPnl = curP != null ? (curP - r.entry_price) * r.quantity : null;
    const displayPnl = r.status === "closed" ? r.pnl_usd : unrealisedPnl;
    const displayPct = r.status === "closed" ? r.pnl_pct : (curP != null && r.entry_price ? ((curP - r.entry_price) / r.entry_price) * 100 : null);
    const pnlColor = displayPnl != null ? (displayPnl >= 0 ? "text-green-400" : "text-destructive") : "text-muted-foreground";
    const pctColor = displayPct != null ? (displayPct >= 0 ? "text-green-400" : "text-destructive") : "text-muted-foreground";
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">{r.asset}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${r.status === "open" ? "bg-blue-500/10 text-blue-400" : "bg-secondary text-muted-foreground"}`}>{r.status}</span>
          </div>
          <p className="text-xs text-muted-foreground">{r.quantity} units · Entry ${r.entry_price?.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">{moment(r.entry_date).format("DD MMM YY")}{r.exit_date ? ` → ${moment(r.exit_date).format("DD MMM YY")}` : ""}</p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-sm font-bold ${pnlColor}`}>
            {displayPnl != null ? `${displayPnl >= 0 ? "+" : ""}$${displayPnl.toFixed(2)}` : "—"}
          </p>
          <p className={`text-xs ${pctColor}`}>
            {displayPct != null ? `${displayPct >= 0 ? "+" : ""}${displayPct.toFixed(1)}%` : ""}
          </p>
        </div>
        <div className="flex gap-1">
          {r.status === "open" && (() => {
            const exitP = livePrice(r.asset);
            return (
              <Button
                variant="outline" size="sm"
                disabled={exitP == null}
                title={exitP == null ? "Enable live prices to close at market" : undefined}
                onClick={() => exitP != null && closeRecord.mutate({ id: r.id, asset: r.asset, entry_price: r.entry_price, quantity: r.quantity, exitP })}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Close
              </Button>
            );
          })()}
          <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 h-8 w-8" onClick={() => deleteRecord.mutate(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">P&amp;L Tracking</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track realised and unrealised profit/loss</p>
        </div>
        <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Trade</Button>
      </div>

      {!liveOn && open.length > 0 && (
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Live prices are off — unrealised P&L and Close Position require real-time prices. Turn them on in <span className="font-medium text-foreground">Settings → Live Prices</span>.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Realised P&L", value: `${totalRealised >= 0 ? "+" : ""}$${totalRealised.toFixed(2)}`, color: totalRealised >= 0 ? "text-green-400" : "text-destructive" },
          { label: "Unrealised P&L", value: showUnrealised ? `${totalUnrealised >= 0 ? "+" : ""}$${totalUnrealised.toFixed(2)}` : "—", color: showUnrealised ? (totalUnrealised >= 0 ? "text-green-400" : "text-destructive") : "" },
          { label: "Win Rate", value: `${winRate}%`, color: winRate >= 50 ? "text-green-400" : "text-destructive" },
          { label: "Total Trades", value: records.length },
        ].map(s => (
          <div key={s.label} className="p-4 rounded-xl border border-border bg-card text-center">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-base font-bold ${s.color || ""}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {chartData.length > 1 && (
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">Recent Closed Trades P&amp;L</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData}>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} />
              <Tooltip formatter={v => [`$${v}`, "P&L"]} />
              <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                {chartData.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? "#4ade80" : "#f87171"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <Tabs defaultValue="open">
        <TabsList className="w-full bg-secondary">
          <TabsTrigger value="open" className="flex-1">Open ({open.length})</TabsTrigger>
          <TabsTrigger value="closed" className="flex-1">Closed ({closed.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="open" className="mt-3 space-y-2">
          {isLoading ? <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
            : open.length === 0 ? <p className="text-center py-10 text-sm text-muted-foreground">No open trades</p>
            : open.map(r => <RecordRow key={r.id} r={r} />)}
        </TabsContent>
        <TabsContent value="closed" className="mt-3 space-y-2">
          {closed.length === 0 ? <p className="text-center py-10 text-sm text-muted-foreground">No closed trades</p>
            : closed.map(r => <RecordRow key={r.id} r={r} />)}
        </TabsContent>
      </Tabs>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Trade</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Asset</Label>
                <Select value={form.asset} onValueChange={v => setForm(p => ({ ...p, asset: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{ASSETS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="open">Open</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            {[
              { label: "Entry Price (USD) *", key: "entry_price", placeholder: "50000" },
              { label: "Quantity *", key: "quantity", placeholder: "0.5" },
              ...(form.status === "closed" ? [{ label: "Exit Price (USD) *", key: "exit_price", placeholder: "55000" }] : []),
            ].map(f => (
              <div key={f.key}><Label>{f.label}</Label><Input type="number" value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} className="mt-1" /></div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Entry Date *</Label><Input type="date" value={form.entry_date} onChange={e => setForm(p => ({ ...p, entry_date: e.target.value }))} className="mt-1" /></div>
              {form.status === "closed" && <div><Label>Exit Date</Label><Input type="date" value={form.exit_date} onChange={e => setForm(p => ({ ...p, exit_date: e.target.value }))} className="mt-1" /></div>}
            </div>
            <div><Label>Note</Label><Input value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} placeholder="Optional..." className="mt-1" /></div>
            <Button
              className="w-full"
              onClick={() => addRecord.mutate()}
              disabled={!form.entry_price || !form.quantity || !form.entry_date || (form.status === "closed" && !form.exit_price) || addRecord.isPending}
            >
              Save Trade
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
