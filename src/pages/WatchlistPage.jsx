import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, TrendingUp, TrendingDown, Star, Edit2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { TOP_CRYPTOS, TOP_SYMBOLS } from "@/lib/cryptos";
import CoinLogo from "@/components/CoinLogo";

// Top 10 by market cap, from the canonical source. 24h high/low are synthesized
// around the reference price for the mock display.
const MOCK_PRICES = Object.fromEntries(
  TOP_CRYPTOS.map(c => [c.symbol, {
    price: c.usd,
    change: c.change24h,
    high: +(c.usd * 1.04).toPrecision(6),
    low: +(c.usd * 0.96).toPrecision(6),
  }])
);

const POPULAR = TOP_SYMBOLS;

export default function WatchlistPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ symbol: "", name: "", note: "", target_buy: "", target_sell: "" });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => base44.entities.PersonalWatchlist.list(),
  });

  const add = useMutation({
    mutationFn: (/** @type {any} */ d) => base44.entities.PersonalWatchlist.create(d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["watchlist"] }); setOpen(false); setForm({ symbol: "", name: "", note: "", target_buy: "", target_sell: "" }); },
  });

  const update = useMutation({
    mutationFn: (/** @type {any} */ vars) => { const { id, ...d } = vars; return base44.entities.PersonalWatchlist.update(id, d); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["watchlist"] }); setEditId(null); },
  });

  const remove = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.PersonalWatchlist.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  function addQuick(symbol) {
    if (items.find(i => i.symbol === symbol)) return;
    add.mutate({ symbol, name: symbol });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Star className="h-5 w-5 text-yellow-400 fill-yellow-400" /> Watchlist</h1>
          <p className="text-sm text-muted-foreground">{items.length} assets tracked</p>
        </div>
        <Button onClick={() => setOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> Add Asset</Button>
      </div>

      {/* Quick Add Popular */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">Quick Add Popular</p>
        <div className="flex flex-wrap gap-2">
          {POPULAR.map(s => {
            const has = items.find(i => i.symbol === s);
            return (
              <button key={s} onClick={() => addQuick(s)} disabled={!!has}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${has ? "border-primary/50 text-primary bg-primary/10 cursor-default" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}>
                {has ? <Check className="inline h-3 w-3 mr-1" /> : null}{s}
              </button>
            );
          })}
        </div>
      </div>

      {/* Watchlist Table */}
      {isLoading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <Star className="h-10 w-10 text-yellow-400/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Add assets to track their prices</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const data = MOCK_PRICES[item.symbol] || { price: 0, change: 0, high: 0, low: 0 };
            const up = data.change >= 0;
            const atBuy = item.target_buy && data.price <= item.target_buy;
            const atSell = item.target_sell && data.price >= item.target_sell;

            return (
              <div key={item.id} className={`bg-card border rounded-2xl p-4 transition-colors ${atBuy ? "border-green-500/50" : atSell ? "border-red-500/50" : "border-border"}`}>
                <div className="flex items-center gap-3">
                  <CoinLogo symbol={item.symbol} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{item.symbol}</p>
                      {atBuy && <Badge className="text-[9px] bg-green-500/20 text-green-500 border-green-500/30">Buy Target</Badge>}
                      {atSell && <Badge className="text-[9px] bg-red-500/20 text-red-500 border-red-500/30">Sell Target</Badge>}
                    </div>
                    {item.note && <p className="text-xs text-muted-foreground truncate">{item.note}</p>}
                    <p className="text-[10px] text-muted-foreground">H: ${data.high?.toLocaleString()} · L: ${data.low?.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">${data.price.toLocaleString()}</p>
                    <p className={`text-xs flex items-center gap-0.5 justify-end ${up ? "text-green-500" : "text-red-500"}`}>
                      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {up ? "+" : ""}{data.change}%
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditId(item.id); setForm({ symbol: item.symbol, name: item.name || "", note: item.note || "", target_buy: item.target_buy || "", target_sell: item.target_sell || "" }); }}
                      className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => remove.mutate(item.id)}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {editId === item.id && (
                  <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px]">Buy below ($)</Label>
                      <Input value={form.target_buy} onChange={e => setForm(f => ({ ...f, target_buy: e.target.value }))} placeholder="65000" type="number" className="h-7 text-xs mt-0.5" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Sell above ($)</Label>
                      <Input value={form.target_sell} onChange={e => setForm(f => ({ ...f, target_sell: e.target.value }))} placeholder="75000" type="number" className="h-7 text-xs mt-0.5" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[10px]">Note</Label>
                      <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Your note..." className="h-7 text-xs mt-0.5" />
                    </div>
                    <Button size="sm" className="h-7 text-xs" onClick={() => update.mutate({ id: item.id, ...form, target_buy: form.target_buy ? parseFloat(form.target_buy) : undefined, target_sell: form.target_sell ? parseFloat(form.target_sell) : undefined })}>
                      <Check className="h-3 w-3 mr-1" /> Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditId(null)}>Cancel</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add to Watchlist</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Symbol</Label>
              <Input value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))} placeholder="BTC, ETH, SOL..." className="mt-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Buy Below (USD)</Label>
                <Input value={form.target_buy} onChange={e => setForm(f => ({ ...f, target_buy: e.target.value }))} placeholder="Optional" type="number" className="mt-1.5" />
              </div>
              <div>
                <Label>Sell Above (USD)</Label>
                <Input value={form.target_sell} onChange={e => setForm(f => ({ ...f, target_sell: e.target.value }))} placeholder="Optional" type="number" className="mt-1.5" />
              </div>
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Your note..." className="mt-1.5" />
            </div>
            <Button className="w-full" disabled={!form.symbol || add.isPending} onClick={() => add.mutate({ ...form, target_buy: form.target_buy ? parseFloat(form.target_buy) : undefined, target_sell: form.target_sell ? parseFloat(form.target_sell) : undefined })}>
              {add.isPending ? "Adding..." : "Add to Watchlist"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}