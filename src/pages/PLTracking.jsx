import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "@/lib/recharts";
import { toast } from "sonner";
import { format } from "date-fns";

const ASSETS = ["BTC", "ETH", "USDT", "BNB", "SOL", "USDC", "XRP", "DOGE", "ADA", "TRX"];

const EMPTY = { asset: "BTC", entry_price: "", exit_price: "", quantity: "", entry_date: "", exit_date: "", status: "open", note: "" };

export default function PLTracking() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const { data: records = [], isLoading, isError } = useQuery({
    queryKey: ["pl-records"],
    queryFn: () => base44.entities.PLRecord.list("-created_date"),
  });

  const addRecord = useMutation({
    mutationFn: () => {
      const qty = parseFloat(form.quantity);
      const entryP = parseFloat(form.entry_price);
      const exitP = form.status === "closed" && form.exit_price ? parseFloat(form.exit_price) : null;
      const pnl_usd = exitP != null ? (exitP - entryP) * qty : null;
      const pnl_pct = exitP != null ? ((exitP - entryP) / entryP) * 100 : null;
      return base44.entities.PLRecord.create({ ...form, entry_price: entryP, exit_price: exitP, quantity: qty, pnl_usd, pnl_pct });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pl-records"] });
      setShowAdd(false); setForm(EMPTY);
      toast.success("Trade recorded");
    },
  });

  const [closingId, setClosingId] = useState(null);
  const [closePrice, setClosePrice] = useState("");

  const closeRecord = useMutation({
    mutationFn: (/** @type {any} */ vars) => {
      const { id, entry_price, quantity } = vars;
      const exitP = parseFloat(closePrice);
      if (!exitP || exitP <= 0) throw new Error("Enter a valid exit price");
      const pnl_usd = (exitP - entry_price) * quantity;
      const pnl_pct = ((exitP - entry_price) / entry_price) * 100;
      return base44.entities.PLRecord.update(id, { status: "closed", exit_price: exitP, exit_date: new Date().toISOString(), pnl_usd, pnl_pct });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["pl-records"] }); setClosingId(null); setClosePrice(""); },
  });

  const deleteRecord = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.PLRecord.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pl-records"] }),
  });

  const closed = records.filter(r => r.status === "closed");
  const open = records.filter(r => r.status === "open");
  const totalRealised = closed.reduce((s, r) => s + (r.pnl_usd || 0), 0);
  const totalUnrealised = null; // requires live price feed — not available
  const winRate = closed.length ? Math.round((closed.filter(r => r.pnl_usd > 0).length / closed.length) * 100) : 0;

  const chartData = closed.slice(0, 10).reverse().map(r => ({ label: `${r.asset} ${format(new Date(r.exit_date || r.created_date), "MMM d")}`, pnl: parseFloat(r.pnl_usd?.toFixed(2) || 0) }));

  const RecordRow = ({ r }) => {
    const isClosing = closingId === r.id;
    return (
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 p-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">{r.asset}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${r.status === "open" ? "bg-info/10 text-info" : "bg-secondary text-muted-foreground"}`}>{r.status}</span>
            </div>
            <p className="text-xs text-muted-foreground">{r.quantity} units · Entry ${r.entry_price?.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{format(new Date(r.entry_date), "dd MMM yy")}{r.exit_date ? ` → ${format(new Date(r.exit_date), "dd MMM yy")}` : ""}</p>
          </div>
          <div className="text-right shrink-0">
            {r.status === "closed" && r.pnl_usd != null ? (
              <>
                <p className={`text-sm font-bold ${r.pnl_usd >= 0 ? "text-success" : "text-destructive"}`}>
                  {r.pnl_usd >= 0 ? "+" : ""}${r.pnl_usd?.toFixed(2)}
                </p>
                <p className={`text-xs ${r.pnl_pct >= 0 ? "text-success" : "text-destructive"}`}>{r.pnl_pct >= 0 ? "+" : ""}{r.pnl_pct?.toFixed(1)}%</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">P&L: enter exit price</p>
            )}
          </div>
          <div className="flex gap-1">
            {r.status === "open" && (
              <Button variant="outline" size="sm" onClick={() => { setClosingId(isClosing ? null : r.id); setClosePrice(""); }}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Close
              </Button>
            )}
            <Button variant="ghost" size="icon" aria-label="Delete trade" className="text-destructive hover:bg-destructive/10 h-8 w-8" onClick={() => deleteRecord.mutate(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
        {isClosing && (
          <div className="px-4 pb-4 pt-0 flex gap-2 items-end border-t border-border mt-0 pt-3">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">Exit price (USD)</p>
              <Input type="number" placeholder="e.g. 72000" value={closePrice} onChange={e => setClosePrice(e.target.value)} className="h-8 text-xs" autoFocus />
            </div>
            <Button size="sm" className="h-8" disabled={!closePrice || closeRecord.isPending}
              onClick={() => closeRecord.mutate({ id: r.id, entry_price: r.entry_price, quantity: r.quantity })}>
              Confirm
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setClosingId(null)}>Cancel</Button>
          </div>
        )}
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Realised P&L", value: `${totalRealised >= 0 ? "+" : ""}$${totalRealised.toFixed(2)}`, color: totalRealised >= 0 ? "text-success" : "text-destructive" },
          { label: "Unrealised P&L", value: "Enter exit price", color: "text-muted-foreground" },
          { label: "Win Rate", value: `${winRate}%`, color: winRate >= 50 ? "text-success" : "text-destructive" },
          { label: "Total Trades", value: records.length },
        ].map(s => (
          <div key={s.label} className="p-4 rounded-xl border border-border bg-card text-center">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-base font-bold ${s.color || ""}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {isError && (
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Couldn't load trades — figures above may be incomplete. Please try again.</span>
        </div>
      )}

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
            : isError ? <p className="text-center py-10 text-sm text-destructive">Couldn't load trades. Please try again.</p>
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
                <Label id="plt-asset-label">Asset</Label>
                <Select value={form.asset} onValueChange={v => setForm(p => ({ ...p, asset: v }))}>
                  <SelectTrigger className="mt-1" aria-labelledby="plt-asset-label"><SelectValue /></SelectTrigger>
                  <SelectContent>{ASSETS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label id="plt-status-label">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger className="mt-1" aria-labelledby="plt-status-label"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="open">Open</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            {[
              { label: "Entry Price (USD) *", key: "entry_price", placeholder: "50000" },
              { label: "Quantity *", key: "quantity", placeholder: "0.5" },
              ...(form.status === "closed" ? [{ label: "Exit Price (USD)", key: "exit_price", placeholder: "55000" }] : []),
            ].map(f => (
              <div key={f.key}><Label>{f.label}</Label><Input type="number" value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} className="mt-1" /></div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Entry Date *</Label><Input type="date" value={form.entry_date} onChange={e => setForm(p => ({ ...p, entry_date: e.target.value }))} className="mt-1" /></div>
              {form.status === "closed" && <div><Label>Exit Date</Label><Input type="date" value={form.exit_date} onChange={e => setForm(p => ({ ...p, exit_date: e.target.value }))} className="mt-1" /></div>}
            </div>
            <div><Label>Note</Label><Input value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} placeholder="Optional..." className="mt-1" /></div>
            <Button className="w-full" onClick={() => addRecord.mutate()} disabled={!form.entry_price || !form.quantity || !form.entry_date || addRecord.isPending}>Save Trade</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}