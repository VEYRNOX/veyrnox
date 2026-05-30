import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  BarChart, Bar, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Wallet, BarChart2 } from "lucide-react";
import moment from "moment";

const USD_RATES = { BTC: 68000, ETH: 3200, SOL: 165, USDC: 1, USDT: 1 };
const COLORS = { BTC: "#F7931A", ETH: "#627EEA", SOL: "#9945FF", USDC: "#2775CA", USDT: "#26A17B" };
const RANGES = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "1Y", days: 365 },
];

const fmt = (n) => "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtSmall = (n) => "$" + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
};

const PieTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const { name, value, percent } = payload[0];
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold">{name}</p>
      <p className="text-muted-foreground">{fmt(value)} &middot; {(percent * 100).toFixed(1)}%</p>
    </div>
  );
};

export default function Analytics() {
  const [range, setRange] = useState(30);

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => base44.entities.Transaction.list("-created_date", 500),
  });

  const totalUSD = useMemo(
    () => wallets.reduce((sum, w) => sum + (w.balance || 0) * (USD_RATES[w.currency] || 1), 0),
    [wallets]
  );

  const allocationData = useMemo(() => {
    const grouped = {};
    for (const w of wallets) {
      const usd = (w.balance || 0) * (USD_RATES[w.currency] || 1);
      grouped[w.currency] = (grouped[w.currency] || 0) + usd;
    }
    return Object.entries(grouped)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [wallets]);

  const monthlyData = useMemo(() => {
    const cutoff = moment().subtract(range, "days");
    const filtered = transactions.filter(tx => moment(tx.created_date).isAfter(cutoff));
    const buckets = {};
    for (let i = range; i >= 0; i--) {
      const key = moment().subtract(i, "days").format(range <= 30 ? "MMM D" : "MMM 'YY");
      if (!buckets[key]) buckets[key] = 0;
    }
    let running = totalUSD;
    const sorted = [...filtered].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    for (const tx of sorted) {
      const key = moment(tx.created_date).format(range <= 30 ? "MMM D" : "MMM 'YY");
      const usd = (tx.amount || 0) * (USD_RATES[tx.currency] || 1);
      if (tx.type === "send" || tx.type === "swap") running += usd;
      else running -= usd;
      if (buckets[key] !== undefined) buckets[key] = Math.max(0, running);
    }
    const entries = Object.entries(buckets);
    let last = totalUSD;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i][1] === 0) entries[i][1] = last;
      else last = entries[i][1];
    }
    return entries
      .filter((_, idx) => range > 30 ? idx % 7 === 0 : true)
      .map(([date, value]) => ({ date, value: Math.round(value) }));
  }, [transactions, totalUSD, range]);

  const pnlData = useMemo(() => {
    const months = {};
    for (let i = 5; i >= 0; i--) {
      const key = moment().subtract(i, "months").format("MMM");
      months[key] = { month: key, gains: 0, losses: 0 };
    }
    for (const tx of transactions) {
      const key = moment(tx.created_date).format("MMM");
      if (!months[key]) continue;
      const usd = (tx.amount || 0) * (USD_RATES[tx.currency] || 1);
      if (tx.type === "receive") months[key].gains += usd;
      if (tx.type === "send") months[key].losses += usd;
    }
    return Object.values(months).map(m => ({
      ...m,
      gains: Math.round(m.gains),
      losses: Math.round(m.losses),
    }));
  }, [transactions]);

  const totalGains = pnlData.reduce((s, m) => s + m.gains, 0);
  const totalLosses = pnlData.reduce((s, m) => s + m.losses, 0);
  const netPnL = totalGains - totalLosses;
  const bestAsset = allocationData[0];

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Portfolio performance &amp; insights</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-border bg-card p-3 space-y-1">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase tracking-wide">Total Value</span>
          </div>
          <p className="text-base font-bold">{fmt(totalUSD)}</p>
        </div>
        <div className={`rounded-xl border bg-card p-3 space-y-1 ${netPnL >= 0 ? "border-green-500/30" : "border-destructive/30"}`}>
          <div className="flex items-center gap-1 text-muted-foreground">
            {netPnL >= 0
              ? <TrendingUp className="h-3.5 w-3.5 text-green-400" />
              : <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
            <span className="text-[10px] uppercase tracking-wide">Net PnL</span>
          </div>
          <p className={`text-base font-bold ${netPnL >= 0 ? "text-green-400" : "text-destructive"}`}>
            {netPnL >= 0 ? "+" : "-"}{fmtSmall(netPnL)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 space-y-1">
          <div className="flex items-center gap-1 text-muted-foreground">
            <DollarSign className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase tracking-wide">Top Asset</span>
          </div>
          <p className="text-base font-bold">{bestAsset?.name ?? "—"}</p>
        </div>
      </div>

      {/* Portfolio Growth Chart */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Portfolio Value</p>
          </div>
          <div className="flex items-center gap-1">
            {RANGES.map(r => (
              <button
                key={r.days}
                onClick={() => setRange(r.days)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  range === r.days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={monthlyData}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(28,95%,54%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(28,95%,54%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(240,5%,20%)" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(240,5%,55%)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9, fill: "hsl(240,5%,55%)" }} tickLine={false} axisLine={false} tickFormatter={v => "$" + (v / 1000).toFixed(0) + "k"} width={36} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="value" name="Portfolio" stroke="hsl(28,95%,54%)" fill="url(#areaGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Asset Allocation */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Asset Allocation</p>
        </div>
        {allocationData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No wallet data yet</p>
        ) : (
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={160}>
              <PieChart>
                <Pie data={allocationData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                  {allocationData.map((entry) => (
                    <Cell key={entry.name} fill={COLORS[entry.name] || "#888"} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {allocationData.map(d => {
                const pct = totalUSD > 0 ? ((d.value / totalUSD) * 100).toFixed(1) : "0";
                return (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ background: COLORS[d.name] || "#888" }} />
                      <span className="text-xs font-semibold">{d.name}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-mono">{fmt(d.value)}</p>
                      <p className="text-[10px] text-muted-foreground">{pct}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Monthly PnL */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Monthly Activity (6 months)</p>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={pnlData} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(240,5%,20%)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 9, fill: "hsl(240,5%,55%)" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(240,5%,55%)" }} tickLine={false} axisLine={false} tickFormatter={v => "$" + (v / 1000).toFixed(0) + "k"} width={36} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }} />
            <Bar dataKey="gains" name="Received" fill="#22c55e" radius={[3, 3, 0, 0]} />
            <Bar dataKey="losses" name="Sent" fill="#ef4444" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}