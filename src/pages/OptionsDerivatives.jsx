import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { TrendingUp, TrendingDown, Plus, Trash2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import moment from "moment";

const TYPE_LABELS = { call: "CALL", put: "PUT", futures_long: "LONG", futures_short: "SHORT" };
const TYPE_COLORS = { call: "text-green-400 bg-green-500/10", put: "text-destructive bg-destructive/10", futures_long: "text-blue-400 bg-blue-500/10", futures_short: "text-orange-400 bg-orange-500/10" };

const EMPTY_FORM = { underlying: "BTC", position_type: "call", strike_price: "", expiry_date: "", contracts: "1", premium_paid: "", entry_price: "", current_price: "", leverage: "1", exchange: "", note: "" };

export default function OptionsDerivatives() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: positions = [], isLoading } = useQuery({
    queryKey: ["options-positions"],
    queryFn: () => base44.entities.OptionsPosition.list("-created_date"),
  });

  const addPosition = useMutation({
    mutationFn: () => {
      const pnl = form.entry_price && form.current_price
        ? (parseFloat(form.current_price) - parseFloat(form.entry_price)) * parseFloat(form.contracts || 1) * (form.position_type === "futures_short" ? -1 : 1)
        : null;
      return base44.entities.OptionsPosition.create({
        ...form,
        strike_price: form.strike_price ? parseFloat(form.strike_price) : null,
        contracts: parseFloat(form.contracts || 1),
        premium_paid: form.premium_paid ? parseFloat(form.premium_paid) : null,
        entry_price: form.entry_price ? parseFloat(form.entry_price) : null,
        current_price: form.current_price ? parseFloat(form.current_price) : null,
        leverage: parseFloat(form.leverage || 1),
        pnl,
        status: "open",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["options-positions"] });
      setShowAdd(false);
      setForm(EMPTY_FORM);
      toast.success("Position added");
    },
  });

  const closePosition = useMutation({
    mutationFn: (id) => base44.entities.OptionsPosition.update(id, { status: "closed" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["options-positions"] }),
  });

  const deletePosition = useMutation({
    mutationFn: (id) => base44.entities.OptionsPosition.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["options-positions"] }),
  });

  const open = positions.filter(p => p.status === "open");
  const closed = positions.filter(p => p.status !== "open");
  const totalPnL = open.reduce((s, p) => s + (p.pnl || 0), 0);

  const PositionCard = ({ p }) => (
    <div className="p-4 rounded-xl border border-border bg-card space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm">{p.underlying}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${TYPE_COLORS[p.position_type]}`}>{TYPE_LABELS[p.position_type]}</span>
          {p.leverage > 1 && <span className="text-[10px] bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded-full">{p.leverage}x</span>}
        </div>
        <span className="text-xs text-muted-foreground">{p.exchange || "—"}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        {p.strike_price && <div><span className="text-muted-foreground">Strike</span><p className="font-medium">${p.strike_price.toLocaleString()}</p></div>}
        {p.entry_price && <div><span className="text-muted-foreground">Entry</span><p className="font-medium">${p.entry_price.toLocaleString()}</p></div>}
        {p.current_price && <div><span className="text-muted-foreground">Current</span><p className="font-medium">${p.current_price.toLocaleString()}</p></div>}
        <div><span className="text-muted-foreground">Contracts</span><p className="font-medium">{p.contracts}</p></div>
        <div><span className="text-muted-foreground">Expiry</span><p className="font-medium">{moment(p.expiry_date).format("DD MMM YY")}</p></div>
        {p.premium_paid && <div><span className="text-muted-foreground">Premium</span><p className="font-medium">${p.premium_paid}</p></div>}
      </div>
      {p.pnl != null && (
        <div className={`flex items-center gap-1 text-sm font-semibold ${p.pnl >= 0 ? "text-green-400" : "text-destructive"}`}>
          {p.pnl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          P&amp;L: {p.pnl >= 0 ? "+" : ""}${p.pnl.toFixed(2)}
        </div>
      )}
      {p.status === "open" && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => closePosition.mutate(p.id)}>Close Position</Button>
          <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10 h-8 w-8" onClick={() => deletePosition.mutate(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Options &amp; Derivatives</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track options, futures and leveraged positions</p>
        </div>
        <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Position</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Open Positions", value: open.length },
          { label: "Closed / Expired", value: closed.length },
          { label: "Total Open P&L", value: `${totalPnL >= 0 ? "+" : ""}$${totalPnL.toFixed(2)}`, color: totalPnL >= 0 ? "text-green-400" : "text-destructive" },
        ].map(s => (
          <div key={s.label} className="p-4 rounded-xl border border-border bg-card text-center">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-lg font-bold ${s.color || ""}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="open">
        <TabsList className="w-full bg-secondary">
          <TabsTrigger value="open" className="flex-1">Open ({open.length})</TabsTrigger>
          <TabsTrigger value="closed" className="flex-1">History ({closed.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="open" className="mt-4 space-y-3">
          {isLoading ? <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
            : open.length === 0 ? <div className="text-center py-12 text-muted-foreground"><BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-sm">No open positions</p></div>
            : open.map(p => <PositionCard key={p.id} p={p} />)}
        </TabsContent>
        <TabsContent value="closed" className="mt-4 space-y-3">
          {closed.length === 0 ? <p className="text-center py-12 text-sm text-muted-foreground">No closed positions</p>
            : closed.map(p => <PositionCard key={p.id} p={p} />)}
        </TabsContent>
      </Tabs>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Position</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Underlying</Label>
                <Select value={form.underlying} onValueChange={v => setForm(p => ({ ...p, underlying: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{["BTC", "ETH", "SOL"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.position_type} onValueChange={v => setForm(p => ({ ...p, position_type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">Call Option</SelectItem>
                    <SelectItem value="put">Put Option</SelectItem>
                    <SelectItem value="futures_long">Futures Long</SelectItem>
                    <SelectItem value="futures_short">Futures Short</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {[
              { label: "Strike Price (USD)", key: "strike_price", placeholder: "50000" },
              { label: "Entry Price (USD)", key: "entry_price", placeholder: "48000" },
              { label: "Current Price (USD)", key: "current_price", placeholder: "52000" },
              { label: "Contracts", key: "contracts", placeholder: "1" },
              { label: "Premium Paid (USD)", key: "premium_paid", placeholder: "500" },
              { label: "Leverage", key: "leverage", placeholder: "1" },
              { label: "Exchange", key: "exchange", placeholder: "Deribit, Binance..." },
            ].map(f => (
              <div key={f.key}>
                <Label>{f.label}</Label>
                <Input type="number" value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} className="mt-1" />
              </div>
            ))}
            <div>
              <Label>Expiry Date *</Label>
              <Input type="date" value={form.expiry_date} onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))} className="mt-1" />
            </div>
            <Button className="w-full" onClick={() => addPosition.mutate()} disabled={!form.expiry_date || addPosition.isPending}>Add Position</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}