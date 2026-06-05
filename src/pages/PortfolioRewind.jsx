import { USD_RATES } from "@/lib/cryptos";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { TrendingUp, TrendingDown } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";


// Historical price multipliers (relative to current)
const PRICE_HISTORY = {
  BTC: { "30d": 0.85, "90d": 0.72, "180d": 0.61, "1y": 0.48, "2y": 0.31 },
  ETH: { "30d": 0.88, "90d": 0.75, "180d": 0.64, "1y": 0.52, "2y": 0.28 },
  SOL: { "30d": 0.78, "90d": 0.65, "180d": 0.50, "1y": 0.35, "2y": 0.18 },
  USDC: { "30d": 1, "90d": 1, "180d": 1, "1y": 1, "2y": 1 },
  USDT: { "30d": 1, "90d": 1, "180d": 1, "1y": 1, "2y": 1 },
};

const PERIODS = [
  { label: "30 Days Ago", key: "30d", days: 30 },
  { label: "90 Days Ago", key: "90d", days: 90 },
  { label: "6 Months Ago", key: "180d", days: 180 },
  { label: "1 Year Ago", key: "1y", days: 365 },
  { label: "2 Years Ago", key: "2y", days: 730 },
];

export default function PortfolioRewind() {
  const [selectedPeriod, setSelectedPeriod] = useState("90d");
  const { data: wallets = [], isLoading } = useQuery({ queryKey: ["wallets"], queryFn: () => base44.entities.Wallet.list() });

  const currentTotal = wallets.reduce((s, w) => s + (w.balance || 0) * (USD_RATES[w.currency] || 1), 0);

  const pastTotal = wallets.reduce((s, w) => {
    const mult = PRICE_HISTORY[w.currency]?.[selectedPeriod] || 1;
    return s + (w.balance || 0) * (USD_RATES[w.currency] || 1) * mult;
  }, 0);

  const gain = currentTotal - pastTotal;
  const gainPct = pastTotal > 0 ? (gain / pastTotal) * 100 : 0;

  // Build chart data
  const chartData = Array.from({ length: 13 }, (_, i) => {
    const frac = i / 12;
    const val = wallets.reduce((s, w) => {
      const startMult = PRICE_HISTORY[w.currency]?.[selectedPeriod] || 1;
      const mult = startMult + (1 - startMult) * frac;
      return s + (w.balance || 0) * (USD_RATES[w.currency] || 1) * mult;
    }, 0);
    const period = PERIODS.find(p => p.key === selectedPeriod);
    const d = new Date(); d.setDate(d.getDate() - Math.round((period?.days || 90) * (1 - frac)));
    return { date: d.toLocaleDateString("en-GB", { month: "short", day: "numeric" }), value: parseFloat(val.toFixed(2)) };
  });

  const assetBreakdown = wallets.map(w => {
    const currentVal = (w.balance || 0) * (USD_RATES[w.currency] || 1);
    const mult = PRICE_HISTORY[w.currency]?.[selectedPeriod] || 1;
    const pastVal = currentVal * mult;
    return { ...w, currentVal, pastVal, change: currentVal - pastVal, changePct: ((currentVal - pastVal) / (pastVal || 1)) * 100 };
  });

  if (isLoading) return <div className="flex justify-center py-20"><div className="h-8 w-8 rounded-full border-4 border-border border-t-primary animate-spin" /></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div><h1 className="text-xl font-bold">Portfolio Rewind</h1><p className="text-sm text-muted-foreground">Replay your portfolio's value at any point in history</p></div>

      {/* Period selector */}
      <div className="flex gap-2 flex-wrap">
        {PERIODS.map(p => (
          <button key={p.key} onClick={() => setSelectedPeriod(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${selectedPeriod === p.key ? "bg-primary text-primary-foreground border-transparent" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="p-5 rounded-xl border border-border bg-card text-center space-y-1">
        <p className="text-xs text-muted-foreground">{PERIODS.find(p => p.key === selectedPeriod)?.label} your portfolio was worth</p>
        <p className="text-3xl font-bold">${pastTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        <div className="flex items-center justify-center gap-2">
          <p className="text-sm text-muted-foreground">Now: ${currentTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          <span className={`flex items-center gap-0.5 text-sm font-semibold ${gain >= 0 ? "text-green-500" : "text-destructive"}`}>
            {gain >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {gain >= 0 ? "+" : ""}{gainPct.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <p className="text-xs font-semibold text-muted-foreground mb-3">Portfolio Value Over Time</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={3} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={v => [`$${v.toLocaleString()}`, "Portfolio"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
            <Line dataKey="value" stroke="#f97316" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Asset breakdown */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">Asset Breakdown</p>
        {assetBreakdown.map(a => (
          <div key={a.id} className="p-3.5 rounded-xl border border-border bg-card flex items-center justify-between">
            <div><p className="text-sm font-medium">{a.name || a.currency}</p><p className="text-xs text-muted-foreground">{a.balance} {a.currency}</p></div>
            <div className="text-right">
              <p className="text-sm font-semibold">${a.pastVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              <p className={`text-xs ${a.change >= 0 ? "text-green-500" : "text-destructive"}`}>
                {a.change >= 0 ? "+" : ""}{a.changePct.toFixed(1)}% since then
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}