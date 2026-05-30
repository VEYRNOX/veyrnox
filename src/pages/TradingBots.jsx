import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Bot, Plus, Play, Pause, Square, TrendingUp, TrendingDown, Zap, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import moment from "moment";

const STRATEGIES = [
  { value: "grid", label: "Grid Trading", icon: "⊞", desc: "Buy low, sell high in a price range with a grid of orders" },
  { value: "dca", label: "DCA Bot", icon: "📅", desc: "Dollar-cost average by buying at set intervals" },
  { value: "momentum", label: "Momentum", icon: "🚀", desc: "Follow price trends and ride momentum moves" },
  { value: "mean_reversion", label: "Mean Reversion", icon: "↩", desc: "Trade price deviations back to the mean" },
  { value: "arbitrage", label: "Arbitrage", icon: "⚖", desc: "Exploit price differences across exchanges" },
];

const STATUS_CONFIG = {
  active: { color: "text-green-400", bg: "bg-green-500/10 border-green-500/20", dot: "bg-green-400" },
  paused: { color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", dot: "bg-yellow-400" },
  stopped: { color: "text-muted-foreground", bg: "bg-secondary border-border", dot: "bg-muted-foreground" },
};

export default function TradingBots() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", strategy: "grid", asset: "BTC", base_currency: "USDC", investment_amount: "", grid_levels: 10, lower_price: "", upper_price: "", take_profit: "", stop_loss: "" });

  const { data: bots = [] } = useQuery({ queryKey: ["trading-bots"], queryFn: () => base44.entities.TradingBot.list("-created_date") });

  const activeBots = bots.filter(b => b.status === "active").length;
  const totalPnL = bots.reduce((s, b) => s + (b.total_pnl || 0), 0);

  const create = useMutation({
    mutationFn: () => base44.entities.TradingBot.create({
      ...form, investment_amount: parseFloat(form.investment_amount),
      grid_levels: parseInt(form.grid_levels),
      lower_price: parseFloat(form.lower_price) || 0,
      upper_price: parseFloat(form.upper_price) || 0,
      take_profit: parseFloat(form.take_profit) || 0,
      stop_loss: parseFloat(form.stop_loss) || 0,
      status: "paused", total_pnl: 0, trades_executed: 0,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["trading-bots"] }); setShowCreate(false); setStep(1); setForm({ name: "", strategy: "grid", asset: "BTC", base_currency: "USDC", investment_amount: "", grid_levels: 10, lower_price: "", upper_price: "", take_profit: "", stop_loss: "" }); toast.success("Bot created"); },
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }) => base44.entities.TradingBot.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["trading-bots"] }),
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.TradingBot.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["trading-bots"] }); toast.success("Bot deleted"); },
  });

  const BotCard = ({ b }) => {
    const st = STATUS_CONFIG[b.status] || STATUS_CONFIG.stopped;
    const strat = STRATEGIES.find(s => s.value === b.strategy);
    return (
      <div className={`p-4 rounded-xl border ${st.bg} space-y-3`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{strat?.icon}</span>
            <div>
              <div className="flex items-center gap-2"><p className="text-sm font-semibold">{b.name}</p><div className={`h-2 w-2 rounded-full ${st.dot} ${b.status === "active" ? "animate-pulse" : ""}`} /></div>
              <p className="text-xs text-muted-foreground">{strat?.label} · {b.asset}/{b.base_currency}</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`text-sm font-bold ${(b.total_pnl || 0) >= 0 ? "text-green-400" : "text-destructive"}`}>{(b.total_pnl || 0) >= 0 ? "+" : ""}${(b.total_pnl || 0).toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">{b.trades_executed} trades</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="text-center p-2 rounded-lg bg-background/50"><p className="text-muted-foreground">Invested</p><p className="font-semibold">${b.investment_amount}</p></div>
          {b.take_profit > 0 && <div className="text-center p-2 rounded-lg bg-background/50"><p className="text-muted-foreground">Take Profit</p><p className="font-semibold text-green-400">+{b.take_profit}%</p></div>}
          {b.stop_loss > 0 && <div className="text-center p-2 rounded-lg bg-background/50"><p className="text-muted-foreground">Stop Loss</p><p className="font-semibold text-destructive">-{b.stop_loss}%</p></div>}
        </div>
        <div className="flex gap-2">
          {b.status !== "active" && <Button size="sm" className="flex-1 h-7 text-xs gap-1" onClick={() => setStatus.mutate({ id: b.id, status: "active" })}><Play className="h-3 w-3" /> Start</Button>}
          {b.status === "active" && <Button size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1" onClick={() => setStatus.mutate({ id: b.id, status: "paused" })}><Pause className="h-3 w-3" /> Pause</Button>}
          {b.status !== "stopped" && <Button size="sm" variant="outline" className="h-7 text-xs px-2 gap-1" onClick={() => setStatus.mutate({ id: b.id, status: "stopped" })}><Square className="h-3 w-3" /></Button>}
          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-destructive" onClick={() => remove.mutate(b.id)}>Delete</Button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Bot className="h-6 w-6 text-primary" /> Trading Bots</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Automate your trading with AI-powered bots</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1.5" /> New Bot</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[{ label: "Active Bots", value: activeBots, color: "text-green-400", icon: Bot },
          { label: "Total P&L", value: `${totalPnL >= 0 ? "+" : ""}$${totalPnL.toFixed(2)}`, color: totalPnL >= 0 ? "text-green-400" : "text-destructive", icon: TrendingUp },
          { label: "Total Bots", value: bots.length, color: "text-primary", icon: BarChart2 }].map(s => (
          <div key={s.label} className="p-3 rounded-xl border border-border bg-card text-center">
            <s.icon className={`h-4 w-4 mx-auto mb-1 ${s.color}`} />
            <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {bots.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Bot className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm mb-3">No trading bots yet. Create your first bot.</p>
          <Button onClick={() => setShowCreate(true)}>Create Bot</Button>
        </div>
      ) : <div className="space-y-3">{bots.map(b => <BotCard key={b.id} b={b} />)}</div>}

      <Dialog open={showCreate} onOpenChange={v => { setShowCreate(v); if (!v) setStep(1); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Trading Bot — Step {step}/2</DialogTitle></DialogHeader>
          {step === 1 ? (
            <div className="space-y-3 pt-2">
              <div><Label>Bot Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My Grid Bot" className="mt-1.5" /></div>
              <div><Label>Strategy</Label>
                <div className="mt-1.5 space-y-2">
                  {STRATEGIES.map(s => (
                    <button key={s.value} onClick={() => setForm(f => ({ ...f, strategy: s.value }))}
                      className={`w-full p-3 rounded-xl border text-left transition-colors ${form.strategy === s.value ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{s.icon}</span>
                        <div><p className="text-sm font-semibold">{s.label}</p><p className="text-xs text-muted-foreground">{s.desc}</p></div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <Button className="w-full" onClick={() => setStep(2)} disabled={!form.name}>Next</Button>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Asset</Label>
                  <Select value={form.asset} onValueChange={v => setForm(f => ({ ...f, asset: v }))}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>{["BTC","ETH","SOL","USDC","USDT"].map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Investment (USD)</Label><Input type="number" value={form.investment_amount} onChange={e => setForm(f => ({ ...f, investment_amount: e.target.value }))} placeholder="1000" className="mt-1.5" /></div>
              </div>
              {form.strategy === "grid" && (
                <div className="grid grid-cols-3 gap-2">
                  <div><Label className="text-xs">Lower $</Label><Input type="number" value={form.lower_price} onChange={e => setForm(f => ({ ...f, lower_price: e.target.value }))} className="mt-1" /></div>
                  <div><Label className="text-xs">Upper $</Label><Input type="number" value={form.upper_price} onChange={e => setForm(f => ({ ...f, upper_price: e.target.value }))} className="mt-1" /></div>
                  <div><Label className="text-xs">Levels</Label><Input type="number" value={form.grid_levels} onChange={e => setForm(f => ({ ...f, grid_levels: e.target.value }))} className="mt-1" /></div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Take Profit (%)</Label><Input type="number" value={form.take_profit} onChange={e => setForm(f => ({ ...f, take_profit: e.target.value }))} placeholder="10" className="mt-1.5" /></div>
                <div><Label>Stop Loss (%)</Label><Input type="number" value={form.stop_loss} onChange={e => setForm(f => ({ ...f, stop_loss: e.target.value }))} placeholder="5" className="mt-1.5" /></div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Back</Button>
                <Button className="flex-1" onClick={() => create.mutate()} disabled={!form.investment_amount || create.isPending}>Create Bot</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}