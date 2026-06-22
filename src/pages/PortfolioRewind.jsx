import { USD_RATES } from "@/lib/cryptos";
import { useState, useMemo } from "react";
import { useWallet } from "@/lib/WalletProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "@/lib/recharts";
import ReferenceRateNote from "@/components/ReferenceRateNote";

const PERIODS = [
  { label: "30 Days Ago", key: "30d", days: 30 },
  { label: "90 Days Ago", key: "90d", days: 90 },
  { label: "6 Months Ago", key: "180d", days: 180 },
  { label: "1 Year Ago", key: "1y", days: 365 },
  { label: "2 Years Ago", key: "2y", days: 730 },
];

export default function PortfolioRewind() {
  const { isUnlocked } = useWallet();
  const { portfolio, history, historyPartial, prices, pricesEnabled } = useAnalytics();
  const [selectedPeriod, setSelectedPeriod] = useState("90d");

  const period = PERIODS.find(p => p.key === selectedPeriod);
  const cutoffMs = Date.now() - (period?.days ?? 90) * 86400_000;
  const currentValue = portfolio?.grandTotal ?? 0;

  const chartData = useMemo(() => {
    const relevantTxs = (history ?? [])
      .filter(tx => tx.timestamp && tx.timestamp >= cutoffMs)
      .sort((a, b) => a.timestamp - b.timestamp);

    let running = currentValue;
    for (const tx of [...relevantTxs].reverse()) {
      const rate = (prices?.[tx.assetSymbol] ?? USD_RATES[tx.assetSymbol]) || 0;
      const usd = parseFloat(tx.amount || '0') * rate;
      if (tx.type === 'receive') running -= usd;
      if (tx.type === 'send') running += usd;
    }
    const pastValue = Math.max(0, running);

    return Array.from({ length: 13 }, (_, i) => {
      const frac = i / 12;
      const val = pastValue + (currentValue - pastValue) * frac;
      const d = new Date();
      d.setDate(d.getDate() - Math.round((period?.days ?? 90) * (1 - frac)));
      return {
        date: d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
        value: parseFloat(val.toFixed(2)),
      };
    });
  }, [history, prices, selectedPeriod, currentValue, cutoffMs]);

  const pastValue = chartData[0]?.value ?? currentValue;

  const gain = currentValue - pastValue;
  const gainPct = pastValue > 0 ? (gain / pastValue) * 100 : 0;

  const assetBreakdown = Object.entries(portfolio?.assetTotals ?? {})
    .filter(([, v]) => (v?.usd ?? 0) > 0)
    .map(([sym, v]) => {
      const currentVal = v.usd ?? 0;
      const assetTxs = (history ?? []).filter(tx => tx.assetSymbol === sym && tx.timestamp >= cutoffMs);
      let pastVal = currentVal;
      for (const tx of assetTxs) {
        const rate = (prices?.[sym] ?? USD_RATES[sym]) || 0;
        const usd = parseFloat(tx.amount || '0') * rate;
        if (tx.type === 'receive') pastVal -= usd;
        if (tx.type === 'send') pastVal += usd;
      }
      pastVal = Math.max(0, pastVal);
      const change = currentVal - pastVal;
      const changePct = pastVal > 0 ? (change / pastVal) * 100 : 0;
      return { sym, currentVal, pastVal, change, changePct };
    });

  if (!isUnlocked) {
    return (
      <div className="max-w-2xl mx-auto pt-10 text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Portfolio Rewind</h1>
        <p className="text-sm text-muted-foreground">Unlock your wallet to use Portfolio Rewind.</p>
      </div>
    );
  }

  if (!pricesEnabled) {
    return (
      <div className="max-w-2xl mx-auto pt-10 text-center space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Portfolio Rewind</h1>
        <p className="text-sm text-muted-foreground">Live prices are required to replay your portfolio history.</p>
        <p className="text-xs text-muted-foreground">Enable live prices in Settings to unlock this page.</p>
      </div>
    );
  }

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

      {historyPartial && (
        <div className="p-4 rounded-xl border border-caution/30 bg-caution/10 flex items-start gap-2 text-sm text-caution">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>History incomplete — some chains couldn't be read; this replay may be understated.</span>
        </div>
      )}

      {/* Summary */}
      <div className="p-5 rounded-xl border border-border bg-card text-center space-y-1">
        <p className="text-xs text-muted-foreground">{PERIODS.find(p => p.key === selectedPeriod)?.label} your portfolio was worth</p>
        <p className="text-3xl font-bold">${pastValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        <div className="flex items-center justify-center gap-2">
          <p className="text-sm text-muted-foreground">Now: ${currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          <span className={`flex items-center gap-0.5 text-sm font-semibold ${gain >= 0 ? "text-success" : "text-destructive"}`}>
            {gain >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {gain >= 0 ? "+" : ""}{gainPct.toFixed(1)}%
          </span>
        </div>
        <ReferenceRateNote />
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
          <div key={a.sym} className="p-3.5 rounded-xl border border-border bg-card flex items-center justify-between">
            <div><p className="text-sm font-medium">{a.sym}</p></div>
            <div className="text-right">
              <p className="text-sm font-semibold">${a.pastVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              <p className={`text-xs ${a.change >= 0 ? "text-success" : "text-destructive"}`}>
                {a.change >= 0 ? "+" : ""}{a.changePct.toFixed(1)}% since then
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
