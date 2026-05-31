import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ArrowRight, TrendingUp, TrendingDown, BarChart2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const USD_RATES = { BTC: 68000, ETH: 3200, USDT: 1, BNB: 590, SOL: 165, USDC: 1, XRP: 0.52, DOGE: 0.16, ADA: 0.45, TRX: 0.13 };
const COLORS = ["#f97316", "#3b82f6", "#22c55e", "#a855f7", "#eab308"];

export default function RebalancingHistory() {
  const { data: snapshots = [], isLoading } = useQuery({
    queryKey: ["portfolio-snapshots"],
    queryFn: () => base44.entities.PortfolioSnapshot.list("-created_date", 20),
  });
  const { data: wallets = [] } = useQuery({ queryKey: ["wallets"], queryFn: () => base44.entities.Wallet.list() });

  const totalUSD = wallets.reduce((s, w) => s + (w.balance || 0) * (USD_RATES[w.currency] || 1), 0);

  const chartData = snapshots.slice(0, 12).reverse().map(s => ({
    date: new Date(s.created_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    value: s.total_value_usd || 0,
  }));

  if (isLoading) return <div className="flex justify-center py-20"><div className="h-8 w-8 rounded-full border-4 border-border border-t-primary animate-spin" /></div>;

  if (snapshots.length === 0) return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div><h1 className="text-xl font-bold">Rebalancing History</h1><p className="text-sm text-muted-foreground">Track all portfolio snapshots and rebalancing events</p></div>
      <div className="text-center py-20 text-muted-foreground">
        <BarChart2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No snapshots yet</p>
        <p className="text-sm mt-1">Take a portfolio snapshot from the Snapshots page to start tracking history.</p>
      </div>
    </div>
  );

  const first = snapshots[snapshots.length - 1];
  const last = snapshots[0];
  const change = last?.total_value_usd && first?.total_value_usd ? ((last.total_value_usd - first.total_value_usd) / first.total_value_usd * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Rebalancing History</h1>
        <p className="text-sm text-muted-foreground">{snapshots.length} portfolio snapshots recorded</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border border-border bg-card text-center">
          <p className="text-xs text-muted-foreground">Snapshots</p>
          <p className="text-2xl font-bold">{snapshots.length}</p>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card text-center">
          <p className="text-xs text-muted-foreground">Current Value</p>
          <p className="text-xl font-bold">${totalUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card text-center">
          <p className="text-xs text-muted-foreground">Overall Change</p>
          <div className="flex items-center justify-center gap-1 mt-1">
            {change >= 0 ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
            <p className={`text-lg font-bold ${change >= 0 ? "text-green-500" : "text-destructive"}`}>{change >= 0 ? "+" : ""}{change.toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {chartData.length > 1 && (
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-sm font-semibold mb-4">Portfolio Value Over Time</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => [`$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, "Value"]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-semibold">Snapshot Timeline</p>
        {snapshots.map((s, i) => {
          const prev = snapshots[i + 1];
          const diff = prev ? ((s.total_value_usd - prev.total_value_usd) / prev.total_value_usd * 100) : 0;
          const up = diff >= 0;
          return (
            <div key={s.id} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card">
              <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                {snapshots.length - i}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{new Date(s.created_date).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
                <p className="text-xs text-muted-foreground">{s.note || "Portfolio snapshot"}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold">${(s.total_value_usd || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                {prev && (
                  <p className={`text-xs font-medium ${up ? "text-green-500" : "text-destructive"}`}>{up ? "+" : ""}{diff.toFixed(1)}%</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}