import { USD_RATES } from "@/lib/cryptos";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { TrendingUp, Activity, Target, AlertTriangle, BarChart3, Shield } from "lucide-react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const VOLATILITY = { BTC: 0.72, ETH: 0.85, SOL: 1.2, USDC: 0.01, USDT: 0.01 };
const SHARPE = { BTC: 1.4, ETH: 1.1, SOL: 0.9, USDC: 0.05, USDT: 0.05 };
const CORRELATION = [
  { asset: "BTC", BTC: 1, ETH: 0.72, SOL: 0.61, USDC: -0.05, USDT: -0.04 },
  { asset: "ETH", BTC: 0.72, ETH: 1, SOL: 0.78, USDC: -0.03, USDT: -0.02 },
  { asset: "SOL", BTC: 0.61, ETH: 0.78, SOL: 1, USDC: -0.01, USDT: -0.01 },
  { asset: "USDC", BTC: -0.05, ETH: -0.03, SOL: -0.01, USDC: 1, USDT: 0.99 },
  { asset: "USDT", BTC: -0.04, ETH: -0.02, SOL: -0.01, USDC: 0.99, USDT: 1 },
];
// The matrix only has data for these 5 assets — drive BOTH the header and the
// per-row columns from this list so we never index a column a row doesn't have
// (which would crash on `.toFixed`).
const CORRELATION_ASSETS = ["BTC", "ETH", "SOL", "USDC", "USDT"];
// Lookups default to mid-range so an asset missing from the tables above
// renders a sensible value instead of NaN.
const DEFAULT_VOLATILITY = 0.5;
const DEFAULT_SHARPE = 0.5;
const MONTHLY_PERFORMANCE = [
  { month: "Nov", portfolio: 4.2, btc: 5.1, sp500: 2.1 },
  { month: "Dec", portfolio: -2.1, btc: -3.4, sp500: -1.2 },
  { month: "Jan", portfolio: 8.4, btc: 9.2, sp500: 1.8 },
  { month: "Feb", portfolio: 3.1, btc: 2.8, sp500: 2.4 },
  { month: "Mar", portfolio: -1.4, btc: -2.1, sp500: 1.1 },
  { month: "Apr", portfolio: 6.7, btc: 7.3, sp500: 2.9 },
];

export default function AdvancedAnalytics() {
  const { data: wallets = [] } = useQuery({ queryKey: ["wallets"], queryFn: () => base44.entities.Wallet.list() });

  const holdings = useMemo(() => {
    const map = {};
    for (const w of wallets) map[w.currency] = (map[w.currency] || 0) + (w.balance || 0);
    return map;
  }, [wallets]);

  const totalUSD = useMemo(() => Object.entries(holdings).reduce((s, [c, b]) => s + b * (USD_RATES[c] || 1), 0), [holdings]);
  const assets = Object.keys(holdings).filter(c => holdings[c] > 0);

  const portfolioVolatility = useMemo(() => {
    if (totalUSD === 0) return 0;
    return assets.reduce((s, c) => s + (holdings[c] * USD_RATES[c] / totalUSD) * (VOLATILITY[c] || 0.5), 0);
  }, [assets, holdings, totalUSD]);

  const portfolioSharpe = useMemo(() => {
    if (totalUSD === 0) return 0;
    return assets.reduce((s, c) => s + (holdings[c] * USD_RATES[c] / totalUSD) * (SHARPE[c] || 0.5), 0);
  }, [assets, holdings, totalUSD]);

  const diversificationScore = useMemo(() => {
    if (assets.length === 0) return 0;
    const weights = assets.map(c => holdings[c] * USD_RATES[c] / totalUSD);
    const hhi = weights.reduce((s, w) => s + w * w, 0);
    return Math.round((1 - hhi) * 100);
  }, [assets, holdings, totalUSD]);

  const stableRatio = useMemo(() => {
    const stables = ["USDC", "USDT"];
    const stableUSD = stables.reduce((s, c) => s + (holdings[c] || 0) * (USD_RATES[c] || 1), 0);
    return totalUSD > 0 ? ((stableUSD / totalUSD) * 100).toFixed(1) : 0;
  }, [holdings, totalUSD]);

  const radarData = assets.slice(0, 5).map(c => ({
    asset: c,
    allocation: totalUSD > 0 ? Math.round((holdings[c] * USD_RATES[c] / totalUSD) * 100) : 0,
    volatility: Math.round((VOLATILITY[c] || 0.5) * 100),
    sharpe: Math.round((SHARPE[c] || 0.5) * 100),
  }));

  const riskLevel = portfolioVolatility < 0.3
    ? { label: "Low", color: "text-green-400", bg: "bg-green-500/10" }
    : portfolioVolatility < 0.6
    ? { label: "Medium", color: "text-yellow-400", bg: "bg-yellow-500/10" }
    : { label: "High", color: "text-destructive", bg: "bg-destructive/10" };

  const metrics = [
    { label: "Portfolio Risk", value: riskLevel.label, color: riskLevel.color, bg: riskLevel.bg, icon: Shield },
    { label: "Sharpe Ratio", value: portfolioSharpe.toFixed(2), icon: TrendingUp, color: "text-primary", bg: "bg-primary/10" },
    { label: "Diversification", value: `${diversificationScore}%`, icon: Target, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Stable Ratio", value: `${stableRatio}%`, icon: Activity, color: "text-purple-400", bg: "bg-purple-500/10" },
  ];

  const chartStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><BarChart3 className="h-6 w-6 text-primary" /> Advanced Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">In-depth risk analysis and performance metrics</p>
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

      <Tabs defaultValue="performance">
        <TabsList className="w-full bg-secondary">
          <TabsTrigger value="performance" className="flex-1">Performance</TabsTrigger>
          <TabsTrigger value="risk" className="flex-1">Risk</TabsTrigger>
          <TabsTrigger value="correlation" className="flex-1">Correlation</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="mt-3 space-y-4">
          <div className="p-4 rounded-xl border border-border bg-card">
            <p className="text-sm font-semibold mb-3">Monthly Returns vs Benchmarks</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={MONTHLY_PERFORMANCE}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v) => `${v}%`} contentStyle={chartStyle} />
                <Legend />
                <Bar dataKey="portfolio" name="Your Portfolio" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                <Bar dataKey="btc" name="BTC" fill="#F7931A" radius={[4,4,0,0]} />
                <Bar dataKey="sp500" name="S&amp;P 500" fill="#627EEA" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[{ label: "Best Month", value: "+8.4%", color: "text-green-400" }, { label: "Worst Month", value: "-2.1%", color: "text-destructive" }, { label: "Win Rate", value: "67%", color: "text-primary" }].map(s => (
              <div key={s.label} className="p-3 rounded-xl border border-border bg-card text-center">
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="risk" className="mt-3 space-y-4">
          <div className="p-4 rounded-xl border border-border bg-card">
            <p className="text-sm font-semibold mb-3">Risk / Return Profile</p>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="asset" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Radar name="Allocation" dataKey="allocation" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
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
              <p className="text-xs text-muted-foreground">High portfolio volatility detected. Consider increasing stablecoin allocation to reduce risk.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="correlation" className="mt-3 space-y-4">
          <div className="p-4 rounded-xl border border-border bg-card">
            <p className="text-sm font-semibold mb-1">Asset Correlation Matrix</p>
            <p className="text-xs text-muted-foreground mb-3">How your assets move together (1 = perfect correlation)</p>
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
            <span>Assets with low correlation (blue) improve diversification. Highly correlated assets (yellow) provide less risk reduction benefit when combined.</span>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}