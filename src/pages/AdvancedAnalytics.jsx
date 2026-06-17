import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { TrendingUp, Activity, Target, BarChart3, Shield, AlertTriangle } from "lucide-react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "@/lib/recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, subMonths } from "date-fns";

// Reference volatility and Sharpe constants — same approach as /risk-score (which is live).
// These are NOT live-market figures; they are calibration constants that qualitatively
// rank assets by historic risk profile. Labeled as such in the UI.
const VOLATILITY = { BTC: 0.72, ETH: 0.85, SOL: 1.2, USDC: 0.01, USDT: 0.01 };
const SHARPE = { BTC: 1.4, ETH: 1.1, SOL: 0.9, USDC: 0.05, USDT: 0.05 };
const CORRELATION = [
  { asset: "BTC", BTC: 1, ETH: 0.72, SOL: 0.61, USDC: -0.05, USDT: -0.04 },
  { asset: "ETH", BTC: 0.72, ETH: 1, SOL: 0.78, USDC: -0.03, USDT: -0.02 },
  { asset: "SOL", BTC: 0.61, ETH: 0.78, SOL: 1, USDC: -0.01, USDT: -0.01 },
  { asset: "USDC", BTC: -0.05, ETH: -0.03, SOL: -0.01, USDC: 1, USDT: 0.99 },
  { asset: "USDT", BTC: -0.04, ETH: -0.02, SOL: -0.01, USDC: 0.99, USDT: 1 },
];
const CORRELATION_ASSETS = ["BTC", "ETH", "SOL", "USDC", "USDT"];
const DEFAULT_VOLATILITY = 0.5;
const DEFAULT_SHARPE = 0.5;

export default function AdvancedAnalytics() {
  const { data: wallets = [] } = useQuery({ queryKey: ["wallets"], queryFn: () => base44.entities.Wallet.list() });
  const { data: transactions = [] } = useQuery({ queryKey: ["transactions"], queryFn: () => base44.entities.Transaction.list("-created_date", 500) });

  // Native balance per currency (no USD weights — avoids stale price dependency).
  const holdings = useMemo(() => {
    const map = {};
    for (const w of wallets) map[w.currency] = (map[w.currency] || 0) + (w.balance || 0);
    return map;
  }, [wallets]);

  const assets = Object.keys(holdings).filter(c => holdings[c] > 0);
  const totalNative = Object.values(holdings).reduce((s, b) => s + b, 0);

  // Diversification: HHI on wallet-count per currency (unit-agnostic proxy).
  const walletCountByCurrency = wallets.reduce((acc, w) => {
    acc[w.currency] = (acc[w.currency] || 0) + 1;
    return acc;
  }, {});
  const totalWallets = wallets.length || 1;
  const diversificationScore = useMemo(() => {
    const weights = Object.values(walletCountByCurrency).map(n => n / totalWallets);
    const hhi = weights.reduce((s, w) => s + w * w, 0);
    return Math.round((1 - hhi) * 100);
  }, [walletCountByCurrency, totalWallets]);

  // Volatility / Sharpe — weighted by wallet count (unit-agnostic proxy).
  const portfolioVolatility = useMemo(() =>
    assets.reduce((s, c) => s + ((walletCountByCurrency[c] || 1) / totalWallets) * (VOLATILITY[c] || DEFAULT_VOLATILITY), 0)
  , [assets, walletCountByCurrency, totalWallets]);

  const portfolioSharpe = useMemo(() =>
    assets.reduce((s, c) => s + ((walletCountByCurrency[c] || 1) / totalWallets) * (SHARPE[c] || DEFAULT_SHARPE), 0)
  , [assets, walletCountByCurrency, totalWallets]);

  const stableCount = ["USDC","USDT"].reduce((s, c) => s + (walletCountByCurrency[c] || 0), 0);
  const stableRatio = totalWallets > 0 ? ((stableCount / totalWallets) * 100).toFixed(1) : 0;

  // Monthly sent/received counts — real tx data, no USD needed.
  const activityData = useMemo(() => {
    const months = {};
    for (let i = 5; i >= 0; i--) {
      const key = format(subMonths(new Date(), i), "MMM");
      months[key] = { month: key, received: 0, sent: 0 };
    }
    for (const tx of transactions) {
      const key = format(new Date(tx.created_date), "MMM");
      if (!months[key]) continue;
      if (tx.type === "receive") months[key].received += 1;
      if (tx.type === "send") months[key].sent += 1;
    }
    return Object.values(months);
  }, [transactions]);

  const radarData = assets.slice(0, 5).map(c => ({
    asset: c,
    wallets: walletCountByCurrency[c] || 0,
    volatility: Math.round((VOLATILITY[c] || DEFAULT_VOLATILITY) * 100),
    sharpe: Math.round((SHARPE[c] || DEFAULT_SHARPE) * 100),
  }));

  const riskLevel = portfolioVolatility < 0.3
    ? { label: "Low", color: "text-green-400", bg: "bg-green-500/10" }
    : portfolioVolatility < 0.6
    ? { label: "Medium", color: "text-yellow-400", bg: "bg-yellow-500/10" }
    : { label: "High", color: "text-destructive", bg: "bg-destructive/10" };

  const metrics = [
    { label: "Portfolio Risk", value: riskLevel.label, color: riskLevel.color, bg: riskLevel.bg, icon: Shield },
    { label: "Ref. Sharpe", value: portfolioSharpe.toFixed(2), icon: TrendingUp, color: "text-primary", bg: "bg-primary/10" },
    { label: "Diversification", value: `${diversificationScore}%`, icon: Target, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Stable Ratio", value: `${stableRatio}%`, icon: Activity, color: "text-purple-400", bg: "bg-purple-500/10" },
  ];

  const chartStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><BarChart3 className="h-6 w-6 text-primary" /> Advanced Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">In-depth risk analysis and activity metrics</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metrics.map(m => (
          <div key={m.label} className={`p-3 rounded-xl border border-border ${m.bg} text-center`}>
            <m.icon className={`h-5 w-5 mx-auto mb-1 ${m.color}`} />
            <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
            <p className="text-[10px] text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-2 p-3 rounded-xl bg-secondary/40 border border-border text-xs text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-yellow-500" />
        <span>Volatility and Sharpe figures are reference constants (same per-asset calibration as Risk Score), not live market data. Risk / diversification metrics weight by wallet count — a unit-agnostic proxy.</span>
      </div>

      <Tabs defaultValue="activity">
        <TabsList className="w-full bg-secondary">
          <TabsTrigger value="activity" className="flex-1">Activity</TabsTrigger>
          <TabsTrigger value="risk" className="flex-1">Risk</TabsTrigger>
          <TabsTrigger value="correlation" className="flex-1">Correlation</TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="mt-3 space-y-4">
          <div className="p-4 rounded-xl border border-border bg-card">
            <p className="text-sm font-semibold mb-3">Monthly Sent / Received (6 months)</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={activityData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={28} />
                <Tooltip contentStyle={chartStyle} />
                <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }} />
                <Bar dataKey="received" name="Received" fill="#22c55e" radius={[4,4,0,0]} />
                <Bar dataKey="sent" name="Sent" fill="#ef4444" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-muted-foreground mt-2">Transaction counts from local history — no USD conversion</p>
          </div>
        </TabsContent>

        <TabsContent value="risk" className="mt-3 space-y-4">
          <div className="p-4 rounded-xl border border-border bg-card">
            <p className="text-sm font-semibold mb-3">Risk / Return Profile (reference constants)</p>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="asset" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Radar name="Wallets" dataKey="wallets" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
                <Radar name="Volatility" dataKey="volatility" stroke="#EF4444" fill="#EF4444" fillOpacity={0.1} />
                <Tooltip contentStyle={chartStyle} />
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {assets.map(c => (
              <div key={c} className="px-4 py-3 flex items-center gap-3">
                <div className="w-16 text-sm font-semibold">{c}</div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-14">Volatility</span>
                    <div className="flex-1 h-1.5 rounded-full bg-secondary"><div className="h-full rounded-full bg-destructive" style={{ width: `${Math.min((VOLATILITY[c] || DEFAULT_VOLATILITY) * 100, 100)}%` }} /></div>
                    <span className="text-[10px] text-muted-foreground w-8">{((VOLATILITY[c] || DEFAULT_VOLATILITY) * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-14">Sharpe</span>
                    <div className="flex-1 h-1.5 rounded-full bg-secondary"><div className="h-full rounded-full bg-green-500" style={{ width: `${Math.min((SHARPE[c] || DEFAULT_SHARPE) * 70, 100)}%` }} /></div>
                    <span className="text-[10px] text-muted-foreground w-8">{SHARPE[c] || DEFAULT_SHARPE}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {portfolioVolatility > 0.5 && (
            <div className="flex gap-3 p-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5">
              <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">High reference-volatility portfolio. Consider increasing stablecoin allocation to reduce risk.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="correlation" className="mt-3 space-y-4">
          <div className="p-4 rounded-xl border border-border bg-card">
            <p className="text-sm font-semibold mb-1">Asset Correlation Matrix</p>
            <p className="text-xs text-muted-foreground mb-1">How your assets tend to move together (1 = perfect correlation)</p>
            <p className="text-[10px] text-yellow-400 mb-3">Reference constants — not live market data. Correlations shift over time; do not use for financial decisions.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left py-1 pr-3 text-muted-foreground font-normal"></th>
                    {CORRELATION_ASSETS.map(a => <th key={a} className="py-1 px-2 text-muted-foreground font-normal">{a}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {CORRELATION.map(row => (
                    <tr key={row.asset}>
                      <td className="py-1 pr-3 font-semibold">{row.asset}</td>
                      {CORRELATION_ASSETS.map(col => {
                        const val = row[col];
                        if (val == null) return <td key={col} className="py-1 px-2 text-center font-mono text-muted-foreground">—</td>;
                        const isHigh = val > 0.6 && val < 1;
                        const isLow = val < 0.1;
                        return (
                          <td key={col} className={`py-1 px-2 text-center rounded font-mono ${val === 1 ? "bg-secondary" : isHigh ? "text-yellow-400" : isLow ? "text-blue-400" : ""}`}>{val.toFixed(2)}</td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex gap-3 items-start p-3 rounded-xl border border-border bg-card text-xs text-muted-foreground">
            <Activity className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span>Assets with low correlation improve diversification. Highly correlated assets provide less risk reduction benefit when combined.</span>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
