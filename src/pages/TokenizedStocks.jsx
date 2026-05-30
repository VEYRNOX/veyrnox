import { useState } from "react";
import { LineChart, TrendingUp, TrendingDown, DollarSign, Info, CheckCircle, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const STOCKS = [
  { symbol: "xTSLA", name: "Tesla", underlying: "TSLA", price: 182.4, change: 3.21, sector: "EV", protocol: "Synthetix" },
  { symbol: "xAAPL", name: "Apple", underlying: "AAPL", price: 213.7, change: 0.87, sector: "Tech", protocol: "Synthetix" },
  { symbol: "xNVDA", name: "NVIDIA", underlying: "NVDA", price: 894.2, change: 2.14, sector: "Semiconductors", protocol: "Mirror" },
  { symbol: "xGOOGL", name: "Alphabet", underlying: "GOOGL", price: 175.6, change: -0.42, sector: "Tech", protocol: "Mirror" },
  { symbol: "xMSFT", name: "Microsoft", underlying: "MSFT", price: 412.3, change: 1.03, sector: "Tech", protocol: "Synthetix" },
  { symbol: "xMETA", name: "Meta", underlying: "META", price: 487.1, change: -1.87, sector: "Social", protocol: "Mirror" },
  { symbol: "xSPY", name: "S&P 500 ETF", underlying: "SPY", price: 534.6, change: 0.44, sector: "Index", protocol: "Synthetix" },
  { symbol: "xGLD", name: "Gold ETF", underlying: "GLD", price: 226.1, change: 0.12, sector: "Commodity", protocol: "Mirror" },
];

export default function TokenizedStocks() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [amount, setAmount] = useState("");
  const [side, setSide] = useState("buy");
  const [buying, setBuying] = useState(false);
  const [success, setSuccess] = useState(null);
  const [filter, setFilter] = useState("All");

  const sectors = ["All", ...new Set(STOCKS.map(s => s.sector))];
  const filtered = filter === "All" ? STOCKS : STOCKS.filter(s => s.sector === filter);

  const totalCost = selected && amount ? (parseFloat(amount) * selected.price).toFixed(2) : "0.00";

  const handleTrade = async () => {
    setBuying(true);
    await new Promise(r => setTimeout(r, 1500));
    await base44.entities.Transaction.create({
      type: side === "buy" ? "receive" : "send",
      currency: "USDC",
      amount: parseFloat(totalCost),
      network: "Ethereum",
      status: "completed",
      note: `${side === "buy" ? "Bought" : "Sold"} ${amount} ${selected.symbol} @ $${selected.price}`,
      timestamp: new Date().toISOString(),
    });
    setSuccess({ stock: selected, qty: amount, side, total: totalCost });
    setBuying(false);
    setAmount("");
    qc.invalidateQueries({ queryKey: ["transactions"] });
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
          <LineChart className="h-5 w-5 text-purple-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Tokenized Stocks</h1>
          <p className="text-sm text-muted-foreground">Trade real-world stocks as on-chain tokens 24/7</p>
        </div>
      </div>

      <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-400">
        <Info className="h-3.5 w-3.5 shrink-0" />
        Tokenized stocks are synthetic assets that track real prices via oracles. They are not securities and not available in all jurisdictions.
      </div>

      {success && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-4 flex items-center gap-3">
            <CheckCircle className="h-8 w-8 text-green-500 shrink-0" />
            <div>
              <p className="font-bold">{success.side === "buy" ? "Bought" : "Sold"} {success.qty} {success.stock.symbol}</p>
              <p className="text-sm text-muted-foreground">for ${success.total} USDC · {success.stock.protocol}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setSuccess(null)} className="ml-auto">✕</Button>
          </CardContent>
        </Card>
      )}

      {/* Sector filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {sectors.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${filter === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-secondary/80"}`}>
            {s}
          </button>
        ))}
      </div>

      {/* Stock list */}
      <div className="space-y-2">
        {filtered.map(stock => (
          <div key={stock.symbol}
            className={`p-3 rounded-xl border cursor-pointer transition-colors ${selected?.symbol === stock.symbol ? "border-primary/50 bg-primary/5" : "border-border hover:bg-secondary/50"}`}
            onClick={() => setSelected(s => s?.symbol === stock.symbol ? null : stock)}>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                {stock.underlying.slice(0, 3)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">{stock.symbol}</span>
                  <Badge variant="outline" className="text-[10px]">{stock.protocol}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{stock.name} · {stock.sector}</p>
              </div>
              <div className="text-right">
                <p className="font-bold">${stock.price.toLocaleString()}</p>
                <p className={`text-xs font-semibold ${stock.change >= 0 ? "text-green-500" : "text-destructive"}`}>
                  {stock.change >= 0 ? "+" : ""}{stock.change}%
                </p>
              </div>
            </div>

            {selected?.symbol === stock.symbol && (
              <div className="mt-3 pt-3 border-t border-border space-y-3" onClick={e => e.stopPropagation()}>
                <div className="flex gap-2">
                  {["buy", "sell"].map(s => (
                    <button key={s} onClick={() => setSide(s)}
                      className={`flex-1 py-1.5 rounded-lg text-sm font-semibold capitalize transition-colors ${side === s ? (s === "buy" ? "bg-green-500 text-white" : "bg-destructive text-white") : "bg-secondary text-muted-foreground"}`}>
                      {s}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 items-center">
                  <Input type="number" placeholder="Quantity" value={amount} onChange={e => setAmount(e.target.value)} className="flex-1" />
                  <div className="text-sm text-right shrink-0">
                    <p className="font-bold">${totalCost}</p>
                    <p className="text-xs text-muted-foreground">USDC</p>
                  </div>
                </div>
                <Button className={`w-full ${side === "buy" ? "bg-green-500 hover:bg-green-600" : "bg-destructive hover:bg-destructive/90"}`}
                  onClick={handleTrade} disabled={buying || !parseFloat(amount)}>
                  {buying ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><ShoppingCart className="h-4 w-4 mr-2" />{side === "buy" ? "Buy" : "Sell"} {stock.symbol}</>}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}