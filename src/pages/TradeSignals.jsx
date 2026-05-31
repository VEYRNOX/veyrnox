import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, TrendingUp, TrendingDown, Star, Users, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const DIR_CFG = { buy: { cls: "bg-green-500/10 text-green-500", icon: <TrendingUp className="h-3.5 w-3.5" /> }, sell: { cls: "bg-destructive/10 text-destructive", icon: <TrendingDown className="h-3.5 w-3.5" /> }, hold: { cls: "bg-yellow-500/10 text-yellow-500", icon: <Target className="h-3.5 w-3.5" /> } };

const MOCK_SIGNALS = [
  { id: "m1", title: "BTC Breakout Setup", asset: "BTC", direction: "buy", entry_price: 67500, target_price: 75000, stop_loss: 64000, confidence: 82, creator_name: "CryptoWhale_99", win_rate: 74, subscribers: 1240, price_usd: 25, timeframe: "1d", status: "open", reasoning: "Double bottom formed at key support. RSI divergence + volume spike signals institutional accumulation." },
  { id: "m2", title: "ETH Resistance Rejection", asset: "ETH", direction: "sell", entry_price: 3180, target_price: 2900, stop_loss: 3300, confidence: 71, creator_name: "ETH_Hodler", win_rate: 68, subscribers: 654, price_usd: 15, timeframe: "4h", status: "open", reasoning: "Price rejected from major resistance 3 times. MACD cross bearish. Short-term pullback expected." },
  { id: "m3", title: "SOL Accumulation Zone", asset: "SOL", direction: "buy", entry_price: 158, target_price: 190, stop_loss: 148, confidence: 67, creator_name: "DeFi_Queen", win_rate: 63, subscribers: 423, price_usd: 10, timeframe: "1w", status: "open", reasoning: "Weekly support holding strong. On-chain metrics show whale accumulation below $160." },
];

export default function TradeSignals() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ title: "", asset: "BTC", direction: "buy", entry_price: "", target_price: "", stop_loss: "", confidence: "", reasoning: "", timeframe: "1d", price_usd: "0" });

  const { data: dbSignals = [] } = useQuery({ queryKey: ["trade-signals"], queryFn: () => base44.entities.TradeSignal.list("-created_date") });

  const create = useMutation({
    mutationFn: (d) => base44.entities.TradeSignal.create({ ...d, entry_price: parseFloat(d.entry_price), target_price: parseFloat(d.target_price), stop_loss: parseFloat(d.stop_loss), confidence: parseFloat(d.confidence), price_usd: parseFloat(d.price_usd), creator_name: "You" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["trade-signals"] }); setOpen(false); },
  });

  const allSignals = dbSignals.length > 0 ? dbSignals : MOCK_SIGNALS;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold">Trade Signals Marketplace</h1><p className="text-sm text-muted-foreground">Buy and follow expert trade setups</p></div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Post Signal</Button>
      </div>

      <div className="space-y-3">
        {allSignals.map(s => {
          const dir = DIR_CFG[s.direction] || DIR_CFG.buy;
          const rr = s.entry_price && s.target_price && s.stop_loss ? ((Math.abs(s.target_price - s.entry_price)) / Math.abs(s.entry_price - s.stop_loss)).toFixed(1) : "—";
          return (
            <div key={s.id} className="p-4 rounded-xl border border-border bg-card cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setSelected(selected === s.id ? null : s.id)}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <span className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${dir.cls}`}>{dir.icon}{s.direction?.toUpperCase()}</span>
                  <div>
                    <p className="font-semibold">{s.title}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{s.asset}</span>
                      <span>{s.timeframe}</span>
                      <span className="flex items-center gap-0.5"><Star className="h-3 w-3 text-yellow-500" />{s.confidence}% confidence</span>
                      <span className="flex items-center gap-0.5"><Users className="h-3 w-3" />{s.subscribers}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-primary">${s.price_usd}</p>
                  <p className="text-[10px] text-muted-foreground">Win rate: {s.win_rate}%</p>
                </div>
              </div>

              {selected === s.id && (
                <div className="mt-4 pt-4 border-t border-border space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-secondary text-center"><p className="text-muted-foreground">Entry</p><p className="font-semibold">${s.entry_price?.toLocaleString()}</p></div>
                    <div className="p-2 rounded-lg bg-green-500/10 text-center"><p className="text-muted-foreground">Target</p><p className="font-semibold text-green-500">${s.target_price?.toLocaleString()}</p></div>
                    <div className="p-2 rounded-lg bg-destructive/10 text-center"><p className="text-muted-foreground">Stop</p><p className="font-semibold text-destructive">${s.stop_loss?.toLocaleString()}</p></div>
                  </div>
                  <div className="text-xs"><p className="text-muted-foreground mb-1">R/R Ratio: <span className="text-foreground font-semibold">{rr}:1</span> · By {s.creator_name}</p><p className="text-muted-foreground">{s.reasoning}</p></div>
                  <Button size="sm" className="w-full gap-1"><Star className="h-3.5 w-3.5" /> Subscribe for ${s.price_usd}/month</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Post Trade Signal</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2 max-h-[70vh] overflow-y-auto pr-1">
            <div><Label>Title</Label><Input className="mt-1.5" placeholder="BTC Breakout Setup" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>Asset</Label>
                <Select value={form.asset} onValueChange={v => setForm(f => ({ ...f, asset: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{["BTC", "ETH", "USDT", "BNB", "SOL", "USDC", "XRP", "DOGE", "ADA", "TRX"].map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Direction</Label>
                <Select value={form.direction} onValueChange={v => setForm(f => ({ ...f, direction: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="buy">Buy</SelectItem><SelectItem value="sell">Sell</SelectItem><SelectItem value="hold">Hold</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Timeframe</Label>
                <Select value={form.timeframe} onValueChange={v => setForm(f => ({ ...f, timeframe: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{["1h","4h","1d","1w"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[["entry_price","Entry ($)"],["target_price","Target ($)"],["stop_loss","Stop ($)"]].map(([k, l]) => (
                <div key={k}><Label>{l}</Label><Input type="number" className="mt-1.5" value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} /></div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Confidence (%)</Label><Input type="number" min="0" max="100" className="mt-1.5" value={form.confidence} onChange={e => setForm(f => ({ ...f, confidence: e.target.value }))} /></div>
              <div><Label>Price ($/mo)</Label><Input type="number" className="mt-1.5" value={form.price_usd} onChange={e => setForm(f => ({ ...f, price_usd: e.target.value }))} /></div>
            </div>
            <div><Label>Analysis</Label><textarea rows={3} className="w-full mt-1.5 rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" value={form.reasoning} onChange={e => setForm(f => ({ ...f, reasoning: e.target.value }))} /></div>
            <Button className="w-full" disabled={!form.title || !form.entry_price || create.isPending} onClick={() => create.mutate(form)}>Post Signal</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}