import { useMemo } from "react";
import { useWallet } from "@/lib/WalletProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { USD_RATES } from "@/lib/cryptos";
import { TrendingUp, TrendingDown, BarChart2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "@/lib/recharts";
import ReferenceRateNote from "@/components/ReferenceRateNote";

export default function PortfolioBenchmark() {
  const { isUnlocked } = useWallet();
  const { portfolio, history, prices, pricesEnabled } = useAnalytics();

  // Derived stats — hooks before any conditional return
  const inflow = useMemo(() => history.reduce((s, tx) => {
    if (tx.type !== 'receive') return s;
    const rate = (prices?.[tx.assetSymbol] ?? USD_RATES[tx.assetSymbol]) || 0;
    return s + parseFloat(tx.amount || '0') * rate;
  }, 0), [history, prices]);

  const outflow = useMemo(() => history.reduce((s, tx) => {
    if (tx.type !== 'send') return s;
    const rate = (prices?.[tx.assetSymbol] ?? USD_RATES[tx.assetSymbol]) || 0;
    return s + parseFloat(tx.amount || '0') * rate;
  }, 0), [history, prices]);

  const currentValue = portfolio?.grandTotal ?? 0;
  const netInvested = inflow - outflow;
  const portfolioReturn = netInvested > 0 ? ((currentValue - netInvested) / netInvested) * 100 : 0;

  const monthlyData = useMemo(() => {
    const months = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const key = d.toLocaleString('en-GB', { month: 'short' });
      if (!months[key]) months[key] = { month: key, inflow: 0, outflow: 0 };
    }
    for (const tx of history) {
      if (!tx.timestamp) continue;
      const key = new Date(tx.timestamp).toLocaleString('en-GB', { month: 'short' });
      if (!months[key]) continue;
      const rate = (prices?.[tx.assetSymbol] ?? USD_RATES[tx.assetSymbol]) || 0;
      const usd = parseFloat(tx.amount || '0') * rate;
      if (tx.type === 'receive') months[key].inflow += usd;
      if (tx.type === 'send') months[key].outflow += usd;
    }
    return Object.values(months).map(m => ({ ...m, inflow: Math.round(m.inflow), outflow: Math.round(m.outflow) }));
  }, [history, prices]);

  // Gates — after all hooks
  if (!isUnlocked) {
    return (
      <div className="max-w-2xl mx-auto pt-10 text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Portfolio Benchmark</h1>
        <p className="text-sm text-muted-foreground">Unlock your wallet to see benchmarks.</p>
      </div>
    );
  }

  if (!pricesEnabled) {
    return (
      <div className="max-w-2xl mx-auto pt-10 text-center space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Portfolio Benchmark</h1>
        <p className="text-sm text-muted-foreground">Live prices are required to calculate portfolio returns.</p>
        <p className="text-xs text-muted-foreground">Enable live prices in Settings to unlock this page.</p>
      </div>
    );
  }

  const returnUp = portfolioReturn >= 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Portfolio Benchmarking</h1>
        <p className="text-sm text-muted-foreground">Your real returns based on transaction history</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-xs text-muted-foreground mb-1">Portfolio Return</p>
          <div className="flex items-center gap-2">
            {returnUp ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
            <p className={`text-xl font-bold ${returnUp ? "text-success" : "text-destructive"}`}>
              {returnUp ? "+" : ""}{portfolioReturn.toFixed(1)}%
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">All-time return</p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-xs text-muted-foreground mb-1">Net Invested</p>
          <p className="text-xl font-bold">
            ${Math.abs(netInvested).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">Received minus sent</p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-xs text-muted-foreground mb-1">Current Value</p>
          <p className="text-xl font-bold">
            ${currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">Portfolio total</p>
        </div>
      </div>
      <ReferenceRateNote />

      <div className="p-4 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 mb-1">
          <BarChart2 className="h-5 w-5 text-primary" />
          <p className="text-sm font-semibold">Monthly Cash Flow (USD)</p>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthlyData}>
            <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="inflow" name="Received" fill="#22c55e" radius={[3, 3, 0, 0]} />
            <Bar dataKey="outflow" name="Sent" fill="#ef4444" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2">
          Benchmark comparison requires historical market data — not available in local-only mode.
        </p>
      </div>
    </div>
  );
}
