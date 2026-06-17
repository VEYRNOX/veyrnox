import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { TrendingUp, Activity, Target, AlertTriangle, BarChart3, Shield } from "lucide-react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isLivePricesEnabled, useLivePrices } from "@/lib/priceFeed";
import moment from "moment";

// Industry reference estimates (annualised). Not computed from live price data — labeled as such in the UI.
const REF_VOL    = { BTC: 0.72, ETH: 0.85, SOL: 1.2, USDC: 0.01, USDT: 0.01, BNB: 0.78, XRP: 0.95, DOGE: 1.4, ADA: 1.1, TRX: 0.82 };
const REF_SHARPE = { BTC: 1.4,  ETH: 1.1,  SOL: 0.9, USDC: 0.05, USDT: 0.05, BNB: 1.0,  XRP: 0.7,  DOGE: 0.5, ADA: 0.6, TRX: 0.8 };
const DEF_VOL = 0.5, DEF_SHARPE = 0.5;

export default function AdvancedAnalytics() {
  const liveOn = isLivePricesEnabled();
  const { prices } = useLivePrices();
  const rate = (sym) => liveOn ? (prices?.[sym] ?? 0) : 0;

  const { data: wallets = [] } = useQuery({ queryKey: ["wallets"], queryFn: () => base44.entities.Wallet.list() });
  const { data: transactions = [] } = useQuery({ queryKey: ["transactions"], queryFn: () => base44.entities.Transaction.list("-created_date", 500) });

  const holdings = useMemo(() => {
    const map = {};
    for (const w of wallets) map[w.currency] = (map[w.currency] || 0) + (w.balance || 0);
    return map;
  }, [wallets]);

  const assets = Object.keys(holdings).filter(c => holdings[c] > 0);

  const totalUSD = useMemo(() =>
    liveOn ? assets.reduce((s, c) => s + holdings[c] * rate(c), 0) : null,
    [assets, holdings, liveOn, prices]);

  const portfolioVol = useMemo(() => {
    if (!liveOn || !totalUSD) return null;
    return assets.reduce((s, c) => s + (holdings[c] * rate(c) / totalUSD) * (REF_VOL[c] ?? DEF_VOL), 0);
  }, [assets, holdings, totalUSD, liveOn, prices]);

  const portfolioSharpe = useMemo(() => {
    if (!liveOn || !totalUSD) return null;
    return assets.reduce((s, c) => s + (holdings[c] * rate(c) / totalUSD) * (REF_SHARPE[c] ?? DEF_SHARPE), 0);
  }, [assets, holdings, totalUSD, liveOn, prices]);

  const diversification = useMemo(() => {
    if (!liveOn || !totalUSD) return null;
    const weights = assets.map(c => holdings[c] * rate(c) / totalUSD);
    return Math.round((1 - weights.reduce((s, w) => s + w * w, 0)) * 100);
  }, [assets, holdings, totalUSD, liveOn, prices]);

  const stableRatio = useMemo(() => {
    if (!liveOn || !totalUSD) return null;
    const stableUSD = ["USDC", "USDT"].reduce((s, c) => s + (holdings[c] || 0) * rate(c), 0);
    return parseFloat((stableUSD / totalUSD * 100).toFixed(1));
  }, [holdings, totalUSD, liveOn, prices]);

  const monthlyActivity = useMemo(() => {
    if (!liveOn) return [];
    const months = {};
    for (let i = 5; i >= 0; i--) {
      const key = moment().subtract(i, "months").format("MMM");
      months[key] = { month: key, received: 0, sent: 0 };
    }
    for (const tx of transactions) {
      const key = moment(tx.created_date).format("MMM");
      if (!months[key]) continue;
      const usd = (tx.amount || 0) * (prices?.[tx.currency] ?? 0);
      if (tx.type === "receive") months[key].received += usd;
      if (tx.type === "send")    months[key].sent    += usd;
    }
    return Object.values(months).map(m => ({
      month: m.month,
      received: Math.round(m.received),
      sent: Math.round(m.sent),
      net: Math.round(m.received - m.sent),
    }));
  }, [transactions, liveOn, prices]);

  const nets = monthlyActivity.map(m => m.net);
  const bestNet = nets.length ? Math.max(...nets) : null;
  const worstNet = nets.length ? Math.min(...nets) : null;
  const winRate = nets.length ? Math.round(nets.filter(n => n > 0).length / nets.length * 100) : null;

  const riskLevel = portfolioVol == null
    ? { label: "—", color: "text-muted-foreground", bg: "" }
    : portfolioVol < 0.3 ? { label: "Low",    color: "text-green-400",   bg: "bg-green-500/10" }
    : portfolioVol < 0.6 ? { label: "Medium",  color: "text-yellow-400",  bg: "bg-yellow-500/10" }
    :                       { label: "High",    color: "text-destructive", bg: "bg-destructive/10" };

  const fmt = (n) => n != null ? `$${Math.round(n).toLocaleString()}` : "—";
  const chartStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" };

  const metrics = [
    { label: "Portfolio Risk",   value: riskLevel.label,                          color: riskLevel.color, bg: riskLevel.bg,          icon: Shield     },
    { label: "Sharpe (ref)",     value: portfolioSharpe != null ? portfolioSharpe.toFixed(2) : "—", color: "text-primary",    bg: "bg-primary/10",   icon: TrendingUp },
    { label: "Diversification", value: diversification != null ? `${diversification}%` : "—",       color: "text-blue-400",  bg: "bg-blue-500/10",  icon: Target     },
    { label: "Stable Ratio",     value: stableRatio     != null ? `${stableRatio}%`     : "—",       color: "text-purple-400",bg: "bg-purple-500/10",icon: Activity   },
  ];

  const radarData = liveOn && totalUSD ? assets.slice(0, 5).map(c => ({
    asset: c,
    "Allocation %": Math.round(holdings[c] * rate(c) / totalUSD * 100),
    "Vol (ref)":    Math.round((REF_VOL[c]    ?? DEF_VOL)    * 100),
  })) : [];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><BarChart3 className="h-6 w-6 text-primary" /> Advanced Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Portfolio risk analysis and activity metrics</p>
      </div>

      {!liveOn && (
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Live prices are off — USD metrics show "—". Turn them on in <span className="font-medium text-foreground">Settings → Live Prices</span>.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metrics.map(m => (
          <div key={m.label} className={`p-3 rounded-xl border border-border ${m.bg} text-center`}>
            <m.icon className={`h-5 w-5 mx-auto mb-1 ${m.color}`} />
            <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
            <p className="text-[10px] text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="activity">
        <TabsList className="w-full bg-secondary">
          <TabsTrigger value="activity" className="flex-1">Activity</TabsTrigger>
          <TabsTrigger value="risk"     className="flex-1">Risk</TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="mt-3 space-y-4">
          {!liveOn ? (
            <div className="p-8 rounded-xl border border-border bg-card text-center text-muted-foreground text-sm">
              Enable live prices to see USD activity data.
            </div>
          ) : (
            <>
              <div className="p-4 rounded-xl border border-border bg-card">
                <p className="text-sm font-semibold mb-3">Monthly Activity — last 6 months (USD · current prices)</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlyActivity}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={v => fmt(v)} contentStyle={chartStyle} />
                    <Legend />
                    <Bar dataKey="received" name="Received" fill="#22c55e" radius={[4,4,0,0]} />
                    <Bar dataKey="sent"     name="Sent"     fill="#ef4444" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-muted-foreground mt-2">Approximate — current prices applied to recorded transaction amounts.</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Best Month Net",    value: bestNet  != null ? fmt(bestNet)  : "—", color: "text-green-400"   },
                  { label: "Worst Month Net",   value: worstNet != null ? fmt(worstNet) : "—", color: "text-destructive" },
                  { label: "Positive Months",   value: winRate  != null ? `${winRate}%` : "—", color: "text-primary"     },
                ].map(s => (
                  <div key={s.label} className="p-3 rounded-xl border border-border bg-card text-center">
                    <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="risk" className="mt-3 space-y-4">
          {!liveOn ? (
            <div className="p-8 rounded-xl border border-border bg-card text-center text-muted-foreground text-sm">
              Enable live prices to see the risk / return profile.
            </div>
          ) : assets.length === 0 ? (
            <div className="p-8 rounded-xl border border-border bg-card text-center text-muted-foreground text-sm">
              No wallets found — add wallets to see risk analysis.
            </div>
          ) : (
            <>
              <div className="p-4 rounded-xl border border-border bg-card">
                <p className="text-sm font-semibold mb-3">Allocation vs Reference Volatility</p>
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="asset" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Radar name="Allocation %" dataKey="Allocation %" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
                    <Radar name="Vol (ref)"    dataKey="Vol (ref)"    stroke="#EF4444"              fill="#EF4444"              fillOpacity={0.1} />
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
                        <span className="text-[10px] text-muted-foreground w-16">Vol (ref)</span>
                        <div className="flex-1 h-1.5 rounded-full bg-secondary"><div className="h-full rounded-full bg-destructive" style={{ width: `${Math.min((REF_VOL[c] ?? DEF_VOL) * 100, 100)}%` }} /></div>
                        <span className="text-[10px] text-muted-foreground w-8">{((REF_VOL[c] ?? DEF_VOL) * 100).toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-16">Sharpe (ref)</span>
                        <div className="flex-1 h-1.5 rounded-full bg-secondary"><div className="h-full rounded-full bg-green-500" style={{ width: `${Math.min((REF_SHARPE[c] ?? DEF_SHARPE) * 70, 100)}%` }} /></div>
                        <span className="text-[10px] text-muted-foreground w-8">{REF_SHARPE[c] ?? DEF_SHARPE}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 p-3 rounded-xl border border-border bg-card text-xs text-muted-foreground">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Volatility and Sharpe figures are industry reference estimates (annualised) — not computed from your live price history.</span>
              </div>
              {portfolioVol != null && portfolioVol > 0.5 && (
                <div className="flex gap-3 p-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5">
                  <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">High portfolio volatility detected. Consider increasing stablecoin allocation to reduce risk.</p>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
