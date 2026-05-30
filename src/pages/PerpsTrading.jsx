import { useState } from "react";
import { TrendingUp, TrendingDown, Zap, AlertTriangle, ChevronUp, ChevronDown, X, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const MARKETS = [
  { symbol: "BTC-PERP", price: 67420, change: 1.24, fundingRate: 0.0103, oi: "2.1B" },
  { symbol: "ETH-PERP", price: 2418, change: -0.87, fundingRate: 0.0081, oi: "890M" },
  { symbol: "SOL-PERP", price: 148.2, change: 3.11, fundingRate: 0.0142, oi: "320M" },
  { symbol: "BNB-PERP", price: 612, change: 0.55, fundingRate: 0.0065, oi: "180M" },
  { symbol: "ARB-PERP", price: 0.84, change: -1.2, fundingRate: -0.0021, oi: "95M" },
];
const LEVERAGES = [1, 2, 3, 5, 10, 20, 50, 100];

export default function PerpsTrading() {
  const qc = useQueryClient();
  const [market, setMarket] = useState(MARKETS[0]);
  const [side, setSide] = useState("long");
  const [leverage, setLeverage] = useState(10);
  const [margin, setMargin] = useState("100");
  const [placing, setPlacing] = useState(false);
  const [positions, setPositions] = useState([]);
  const [tab, setTab] = useState("trade");

  const size = (parseFloat(margin) || 0) * leverage;
  const liqPrice = side === "long"
    ? (market.price * (1 - 1 / leverage * 0.9)).toFixed(2)
    : (market.price * (1 + 1 / leverage * 0.9)).toFixed(2);

  const handlePlace = async () => {
    setPlacing(true);
    await new Promise(r => setTimeout(r, 1200));
    const pos = {
      id: Date.now(),
      market: market.symbol,
      side,
      leverage,
      margin: parseFloat(margin),
      size,
      entryPrice: market.price,
      markPrice: market.price * (1 + (Math.random() - 0.5) * 0.005),
      liqPrice: parseFloat(liqPrice),
      pnl: (Math.random() - 0.4) * 20,
      time: new Date().toLocaleTimeString(),
    };
    setPositions(p => [pos, ...p]);
    setPlacing(false);
    setTab("positions");
  };

  const closePosition = (id) => setPositions(p => p.filter(x => x.id !== id));

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
          <Zap className="h-5 w-5 text-rose-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Perpetuals Trading</h1>
          <p className="text-sm text-muted-foreground">Trade crypto perps with up to 100x leverage</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-border">
        {["trade", "positions", "markets"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize transition-colors border-b-2 -mb-px ${tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t} {t === "positions" && positions.length > 0 && <Badge className="ml-1 text-[10px] py-0">{positions.length}</Badge>}
          </button>
        ))}
      </div>

      {tab === "markets" && (
        <div className="space-y-2">
          {MARKETS.map(m => (
            <button key={m.symbol} onClick={() => { setMarket(m); setTab("trade"); }}
              className={`w-full flex items-center gap-4 p-3 rounded-xl border transition-colors text-left ${market.symbol === m.symbol ? "border-primary/50 bg-primary/5" : "border-border hover:bg-secondary/50"}`}>
              <div className="flex-1">
                <p className="font-bold text-sm">{m.symbol}</p>
                <p className="text-xs text-muted-foreground">OI: ${m.oi} · Funding: {m.fundingRate > 0 ? "+" : ""}{m.fundingRate}%</p>
              </div>
              <div className="text-right">
                <p className="font-bold">${m.price.toLocaleString()}</p>
                <p className={`text-xs font-semibold ${m.change >= 0 ? "text-green-500" : "text-destructive"}`}>
                  {m.change >= 0 ? "+" : ""}{m.change}%
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {tab === "trade" && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{market.symbol}</CardTitle>
                <button onClick={() => setTab("markets")} className="text-xs text-primary hover:underline">Change</button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">${market.price.toLocaleString()}</span>
                <Badge variant={market.change >= 0 ? "default" : "destructive"} className="text-xs">
                  {market.change >= 0 ? "+" : ""}{market.change}%
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                {["long", "short"].map(s => (
                  <button key={s} onClick={() => setSide(s)}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold capitalize transition-colors ${side === s ? (s === "long" ? "bg-green-500 text-white" : "bg-destructive text-white") : "bg-secondary text-muted-foreground"}`}>
                    {s === "long" ? "▲ Long" : "▼ Short"}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Leverage</label>
                <div className="flex flex-wrap gap-1">
                  {LEVERAGES.map(l => (
                    <button key={l} onClick={() => setLeverage(l)}
                      className={`px-2 py-1 rounded text-xs font-bold transition-colors ${leverage === l ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-secondary/80"}`}>
                      {l}x
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Margin (USD)</label>
                <Input type="number" value={margin} onChange={e => setMargin(e.target.value)} placeholder="100" />
              </div>

              <div className="p-3 bg-secondary/50 rounded-lg space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Size</span><span className="font-semibold">${size.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Entry Price</span><span>${market.price.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Liq. Price</span><span className="text-destructive">${parseFloat(liqPrice).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Funding Rate</span><span>{market.fundingRate > 0 ? "+" : ""}{market.fundingRate}%/8h</span></div>
              </div>

              {leverage >= 20 && (
                <div className="flex items-center gap-2 text-xs text-amber-500 bg-amber-500/10 p-2 rounded-lg">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> High leverage increases liquidation risk
                </div>
              )}

              <Button className={`w-full ${side === "long" ? "bg-green-500 hover:bg-green-600" : "bg-destructive hover:bg-destructive/90"}`}
                onClick={handlePlace} disabled={placing || !parseFloat(margin)}>
                {placing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : `${side === "long" ? "▲ Open Long" : "▼ Open Short"} ${leverage}x`}
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Market Stats</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                {[["24h High", `$${(market.price * 1.03).toFixed(0)}`], ["24h Low", `$${(market.price * 0.97).toFixed(0)}`], ["Open Interest", `$${market.oi}`], ["Funding Rate", `${market.fundingRate}%`]].map(([k, v]) => (
                  <div key={k}><p className="text-xs text-muted-foreground">{k}</p><p className="font-semibold">{v}</p></div>
                ))}
              </CardContent>
            </Card>
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardContent className="pt-3 text-xs text-amber-400 space-y-1">
                <p className="font-semibold">⚠ Risk Warning</p>
                <p className="text-muted-foreground">Perpetual futures carry high risk. You can lose your entire margin. Trade responsibly.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {tab === "positions" && (
        <div className="space-y-3">
          {positions.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm">No open positions</div>}
          {positions.map(p => (
            <Card key={p.id} className={`border-l-4 ${p.side === "long" ? "border-l-green-500" : "border-l-destructive"}`}>
              <CardContent className="pt-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{p.market}</span>
                      <Badge variant="outline" className={p.side === "long" ? "text-green-500 border-green-500/40" : "text-destructive border-destructive/40"}>{p.side.toUpperCase()} {p.leverage}x</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-2 text-xs">
                      <div><p className="text-muted-foreground">Size</p><p className="font-semibold">${p.size.toFixed(0)}</p></div>
                      <div><p className="text-muted-foreground">Entry</p><p className="font-semibold">${p.entryPrice.toLocaleString()}</p></div>
                      <div><p className="text-muted-foreground">Liq.</p><p className="font-semibold text-destructive">${p.liqPrice.toLocaleString()}</p></div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${p.pnl >= 0 ? "text-green-500" : "text-destructive"}`}>{p.pnl >= 0 ? "+" : ""}{p.pnl.toFixed(2)} USD</p>
                    <Button size="sm" variant="outline" className="mt-1 text-xs" onClick={() => closePosition(p.id)}>Close</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}