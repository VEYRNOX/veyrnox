import { USD_RATES, CURRENCY_COLORS } from "@/lib/cryptos";
import { useState, useMemo } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  BarChart, Bar, Legend,
} from "@/lib/recharts";
import { TrendingUp, TrendingDown, DollarSign, Wallet, BarChart2 } from "lucide-react";
import { useWallet } from "@/lib/WalletProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import ReferenceRateNote from "@/components/ReferenceRateNote";
import IncompleteBalanceNote from "@/components/IncompleteBalanceNote";
import { formatUsd, resolveLocale } from "@/lib/locale";
import { getAssetById } from "@/wallet-core/assets";

// Fallback palette when CURRENCY_COLORS has no entry for a symbol. Order lifted
// from the chart-N HSL scale so a per-index fallback still reads on-theme.
// Keeps every slice distinguishable when the pie has 5+ assets.
const FALLBACK_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--caution))',
];

const RANGES = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "1Y", days: 365 },
];

// Locale-aware currency formatters. Was `"$" + n.toLocaleString(...)` which
// forced the en-US "$" prefix on every user. formatUsd renders per-locale
// (de-DE: "1.234 $", fr-FR: "1 234 $US"). fmtSmall keeps the abs() because a
// negative small value already carries the sign in the caller's UI.
const fmt = (n) => formatUsd(n, resolveLocale(), { maximumFractionDigits: 0 });
const fmtSmall = (n) => formatUsd(Math.abs(n), resolveLocale(), { maximumFractionDigits: 2 });

const CustomTooltip = (/** @type {any} */ { active, payload, label } = {}) => {
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

const PieTooltip = (/** @type {any} */ { active, payload } = {}) => {
  if (!active || !payload?.length) return null;
  const { name, value, percent } = payload[0];
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold">{name}</p>
      <p className="text-muted-foreground">{fmt(value)} &middot; {(percent * 100).toFixed(1)}%</p>
    </div>
  );
};

const LiveGate = () => (
  <div className="rounded-xl border border-border bg-card p-6 text-center space-y-2">
    <p className="text-sm text-muted-foreground">
      Enable <strong>Live Prices</strong> in Settings to see this chart in USD.
    </p>
  </div>
);

export default function Analytics() {
  const { isUnlocked } = useWallet();
  const { portfolio, history, prices, pricesEnabled } = useAnalytics();
  const [range, setRange] = useState(30);

  const totalUSD = portfolio?.grandTotal ?? 0;

  // assetTotals is KEYED by composite id ("ETH:mainnet"), and the value carries
  // the bare `symbol` for display + palette lookup. Prior code destructured
  // the entry as `[name, v]` and passed the KEY through as `name` — that's
  // what shipped the "ETH:mainnet" pie labels and the all-grey slices (the
  // CURRENCY_COLORS map is keyed by bare symbol, so the composite id missed).
  //
  // Match the Dashboard label formula (WalletPortfolioPage.jsx:867) —
  // `DISPLAY (Chain)`, chain = "Ethereum" for erc20 (a.name there is the
  // token brand) else the ASSETS entry's own name. Color falls back to a
  // theme-safe palette by index when CURRENCY_COLORS has no entry.
  const allocationData = useMemo(() => {
    if (!portfolio?.assetTotals) return [];
    return Object.entries(portfolio.assetTotals)
      .map(([id, v]) => {
        const asset = getAssetById(id);
        const symbol = v.symbol || asset?.symbol || id;
        const displaySymbol = asset?.displaySymbol || symbol;
        const chainLabel = asset?.family === "erc20" ? "Ethereum" : asset?.name;
        const label = chainLabel ? `${displaySymbol} (${chainLabel})` : displaySymbol;
        return {
          id,
          symbol,
          name: label,
          value: Math.round(v.usd ?? 0),
        };
      })
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .map((entry, idx) => ({
        ...entry,
        color: CURRENCY_COLORS[entry.symbol] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length],
      }));
  }, [portfolio]);

  const monthlyData = useMemo(() => {
    if (!pricesEnabled || !prices) return [];
    const nowMs = Date.now();
    const cutoffMs = nowMs - range * 86400_000;
    const buckets = {};
    for (let i = range; i >= 0; i--) {
      const d = new Date(nowMs - i * 86400_000);
      const key = d.toLocaleDateString(undefined, range <= 30
        ? { day: 'numeric', month: 'short' }
        : { month: 'short', year: '2-digit' });
      if (!(key in buckets)) buckets[key] = totalUSD;
    }
    let running = totalUSD;
    const sorted = [...history].filter(t => t.timestamp != null).sort((a, b) => b.timestamp - a.timestamp);
    for (const tx of sorted) {
      if (tx.timestamp < cutoffMs) break;
      const rate = (prices[tx.assetSymbol] ?? USD_RATES[tx.assetSymbol]) || 0;
      const usd = parseFloat(tx.amount || '0') * rate;
      if (tx.type === 'send') running += usd;
      else if (tx.type === 'receive') running -= usd;
      const key = new Date(tx.timestamp).toLocaleDateString(undefined, range <= 30
        ? { day: 'numeric', month: 'short' }
        : { month: 'short', year: '2-digit' });
      if (key in buckets) buckets[key] = Math.max(0, Math.round(running));
    }
    return Object.entries(buckets)
      .filter((_, idx) => range > 30 ? idx % 7 === 0 : true)
      .map(([date, value]) => ({ date, value }));
  }, [history, pricesEnabled, prices, range, totalUSD]);

  const pnlData = useMemo(() => {
    const months = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const key = d.toLocaleString(undefined, { month: 'short' });
      if (!months[key]) months[key] = { month: key, gains: 0, losses: 0 };
    }
    if (pricesEnabled && prices) {
      for (const tx of history) {
        if (!tx.timestamp) continue;
        const key = new Date(tx.timestamp).toLocaleString(undefined, { month: 'short' });
        if (!months[key]) continue;
        const rate = (prices[tx.assetSymbol] ?? USD_RATES[tx.assetSymbol]) || 0;
        const usd = parseFloat(tx.amount || '0') * rate;
        if (tx.type === 'receive') months[key].gains += usd;
        if (tx.type === 'send') months[key].losses += usd;
      }
    }
    return Object.values(months).map(m => ({ ...m, gains: Math.round(m.gains), losses: Math.round(m.losses) }));
  }, [history, pricesEnabled, prices]);

  const totalGains = pnlData.reduce((s, m) => s + m.gains, 0);
  const totalLosses = pnlData.reduce((s, m) => s + m.losses, 0);
  const netPnL = totalGains - totalLosses;
  const bestAsset = allocationData[0];

  if (!isUnlocked) {
    return (
      <div className="max-w-lg mx-auto pt-10 text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">Unlock your wallet to see analytics.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Portfolio performance &amp; insights</p>
      </div>

      {/* I4 fail-closed: totals/allocation below derive from grandTotal/assetTotals,
          which EXCLUDE any asset whose balance read failed. Mark the figures as
          incomplete rather than presenting a silently-understated view as fact. */}
      {portfolio?.indeterminate && <IncompleteBalanceNote />}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-3 space-y-1 min-w-0">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase tracking-wide">Total Value</span>
          </div>
          <p className="text-base font-bold break-words">{pricesEnabled ? fmt(totalUSD) : "—"}</p>
        </div>
        <div className={`rounded-xl border bg-card p-3 space-y-1 min-w-0 ${pricesEnabled && netPnL >= 0 ? "border-success/30" : pricesEnabled ? "border-destructive/30" : "border-border"}`}>
          <div className="flex items-center gap-1 text-muted-foreground">
            {pricesEnabled
              ? netPnL >= 0
                ? <TrendingUp className="h-3.5 w-3.5 text-success" />
                : <TrendingDown className="h-3.5 w-3.5 text-destructive" />
              : <TrendingUp className="h-3.5 w-3.5" />}
            <span className="text-[10px] uppercase tracking-wide">Net PnL</span>
          </div>
          {pricesEnabled ? (
            <p className={`text-base font-bold break-words ${netPnL >= 0 ? "text-success" : "text-destructive"}`}>
              {netPnL >= 0 ? "+" : "-"}{fmtSmall(netPnL)}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground break-words">Requires live prices</p>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-3 space-y-1 min-w-0">
          <div className="flex items-center gap-1 text-muted-foreground">
            <DollarSign className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase tracking-wide">Top Asset</span>
          </div>
          <p className="text-base font-bold break-words">{bestAsset?.name ?? "—"}</p>
        </div>
      </div>
      <ReferenceRateNote />

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
        {!pricesEnabled ? (
          <LiveGate />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={v => formatUsd(v, resolveLocale(), { compact: true, maximumFractionDigits: 1 })} width={36} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="value" name="Portfolio" stroke="hsl(var(--primary))" fill="url(#areaGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-muted-foreground">Values use current prices — not historical rates.</p>
          </>
        )}
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
                    <Cell key={entry.id} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {allocationData.map(d => {
                const pct = totalUSD > 0 ? ((d.value / totalUSD) * 100).toFixed(1) : "0";
                return (
                  <div key={d.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ background: d.color }} />
                      <span className="text-xs font-semibold">{d.name}</span>
                    </div>
                    <div className="text-end">
                      <p className="text-xs font-mono">{pricesEnabled ? fmt(d.value) : "—"}</p>
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
        {!pricesEnabled ? (
          <LiveGate />
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={pnlData} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={v => formatUsd(v, resolveLocale(), { compact: true, maximumFractionDigits: 1 })} width={36} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }} />
              <Bar dataKey="gains" name="Received" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} />
              <Bar dataKey="losses" name="Sent" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
