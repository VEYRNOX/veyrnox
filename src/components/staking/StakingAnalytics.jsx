import { useMemo } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import moment from "moment";

const USD_RATES = { BTC: 68000, ETH: 3200, USDT: 1, BNB: 590, SOL: 165, USDC: 1, XRP: 0.52, DOGE: 0.16, ADA: 0.45, TRX: 0.13 };
const COLORS    = { BTC: "#F7931A", ETH: "#627EEA", USDT: "#26A17B", BNB: "#F3BA2F", SOL: "#9945FF", USDC: "#2775CA", XRP: "#0085C0", DOGE: "#C2A633", ADA: "#0033AD", TRX: "#EB0029" };
const fmtUSD    = (n) => "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmt       = (n, d = 4) => Number(n).toFixed(d);

export default function StakingAnalytics({ positions }) {
  const activePositions = positions.filter(p => p.status === "active");

  // Build 30-day cumulative rewards history (simulated from APY + staked_at)
  const rewardHistory = useMemo(() => {
    const days = 30;
    return Array.from({ length: days }, (_, i) => {
      const date = moment().subtract(days - 1 - i, "days");
      let totalRewardUSD = 0;
      for (const p of activePositions) {
        const stakedAt = moment(p.staked_at);
        if (date.isBefore(stakedAt)) continue;
        const daysElapsed = date.diff(stakedAt, "days", true);
        const earned = (p.staked_amount * (p.apy / 100) / 365) * daysElapsed;
        totalRewardUSD += earned * (USD_RATES[p.currency] || 1);
      }
      return { date: date.format("MMM D"), rewards: parseFloat(totalRewardUSD.toFixed(2)) };
    });
  }, [positions]);

  // Daily accrual per day (last 14 days)
  const dailyAccrual = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const date = moment().subtract(13 - i, "days");
      let dayUSD = 0;
      for (const p of activePositions) {
        if (moment(p.staked_at).isAfter(date)) continue;
        dayUSD += (p.staked_amount * (p.apy / 100) / 365) * (USD_RATES[p.currency] || 1);
      }
      return { date: date.format("MMM D"), daily: parseFloat(dayUSD.toFixed(2)) };
    });
  }, [positions]);

  // Per-position performance
  const positionStats = useMemo(() => activePositions.map(p => {
    const daysStaked   = moment().diff(moment(p.staked_at), "days", true);
    const earned       = (p.staked_amount * (p.apy / 100) / 365) * daysStaked;
    const earnedUSD    = earned * (USD_RATES[p.currency] || 1);
    const stakedUSD    = p.staked_amount * (USD_RATES[p.currency] || 1);
    const roiPct       = stakedUSD > 0 ? (earnedUSD / stakedUSD) * 100 : 0;
    return { ...p, earnedUSD, stakedUSD, roiPct, daysStaked: Math.floor(daysStaked) };
  }), [positions]);

  const totalEarnedUSD   = positionStats.reduce((s, p) => s + p.earnedUSD, 0);
  const totalStakedUSD   = positionStats.reduce((s, p) => s + p.stakedUSD, 0);
  const avgAPY           = activePositions.length
    ? activePositions.reduce((s, p) => s + p.apy, 0) / activePositions.length
    : 0;
  const projectedYearUSD = totalStakedUSD * (avgAPY / 100);

  if (activePositions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No active positions to analyse. Stake assets to see analytics.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Total Earned", value: fmtUSD(totalEarnedUSD), sub: "all-time" },
          { label: "Avg APY",      value: avgAPY.toFixed(1) + "%", sub: "blended" },
          { label: "Proj. Annual", value: fmtUSD(projectedYearUSD), sub: "at current rate" },
        ].map(k => (
          <div key={k.label} className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-[10px] text-muted-foreground">{k.label}</p>
            <p className="text-sm font-bold">{k.value}</p>
            <p className="text-[10px] text-muted-foreground">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Cumulative reward curve */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-xs font-semibold mb-3">Cumulative Rewards (30d)</p>
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={rewardHistory} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} interval={6} />
            <YAxis tick={{ fontSize: 9 }} tickFormatter={v => "$" + v} />
            <Tooltip formatter={v => fmtUSD(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
            <Area type="monotone" dataKey="rewards" stroke="#22c55e" fill="url(#rg)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Daily accrual bars */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-xs font-semibold mb-3">Daily Accrual (14d)</p>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={dailyAccrual} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} interval={3} />
            <YAxis tick={{ fontSize: 9 }} tickFormatter={v => "$" + v} />
            <Tooltip formatter={v => fmtUSD(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
            <Bar dataKey="daily" fill="#627EEA" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Per-position table */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <p className="text-xs font-semibold">Position Performance</p>
        {positionStats.map(p => (
          <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
            <div>
              <p className="text-xs font-semibold">{p.validator_name}</p>
              <p className="text-[10px] text-muted-foreground">{p.currency} · {p.daysStaked}d staked</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-green-400">{fmtUSD(p.earnedUSD)}</p>
              <p className="text-[10px] text-muted-foreground">ROI {p.roiPct.toFixed(3)}%</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}