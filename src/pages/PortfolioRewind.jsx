import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { TrendingUp, TrendingDown } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { isLivePricesEnabled, useLivePrices } from "@/lib/priceFeed";

const KNOWN_ASSETS = ["BTC", "ETH", "SOL", "USDC", "USDT", "BNB", "XRP", "DOGE", "ADA", "TRX"];

const PERIODS = [
  { label: "30d", days: 30,  full: "30 days ago" },
  { label: "90d", days: 90,  full: "90 days ago" },
  { label: "6m",  days: 180, full: "6 months ago" },
  { label: "1y",  days: 365, full: "1 year ago" },
  { label: "2y",  days: 730, full: "2 years ago" },
];

async function fetchHistoday(symbols) {
  const results = await Promise.all(
    symbols.map(sym =>
      fetch(`https://min-api.cryptocompare.com/data/v2/histoday?fsym=${sym}&tsym=USD&limit=730`)
        .then(r => r.json())
        .then(json => {
          if (json.Response !== "Success") throw new Error(json.Message || "API error");
          return [sym, json.Data.Data.filter(d => d.close > 0).map(d => ({ time: d.time, close: d.close }))];
        })
    )
  );
  return Object.fromEntries(results);
}

export default function PortfolioRewind() {
  const [selectedPeriod, setSelectedPeriod] = useState("90d");
  const liveOn = isLivePricesEnabled();
  const { prices } = useLivePrices();

  const { data: wallets = [], isLoading: walletsLoading } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });

  const walletSymbols = useMemo(() =>
    [...new Set(wallets.map(w => w.currency).filter(c => KNOWN_ASSETS.includes(c)))],
    [wallets]);

  const { data: histoday = {}, isLoading: histLoading, isError: histError } = useQuery({
    queryKey: ["portfolio-rewind-histoday", walletSymbols.join(",")],
    queryFn: () => fetchHistoday(walletSymbols),
    enabled: liveOn && walletSymbols.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  const period = PERIODS.find(p => p.label === selectedPeriod) ?? PERIODS[1];

  // Pre-build per-symbol time→close maps for O(1) chart lookups
  const closeMaps = useMemo(() => {
    const maps = {};
    for (const [sym, series] of Object.entries(histoday)) {
      maps[sym] = new Map(series.map(d => [d.time, d.close]));
    }
    return maps;
  }, [histoday]);

  const chartData = useMemo(() => {
    if (!liveOn || !Object.keys(histoday).length) return [];
    const refSeries = Object.values(histoday)[0] ?? [];
    const sliced = refSeries.slice(-period.days);
    // Thin to ~30 points so the chart renders cleanly across all periods
    const thin = Math.max(1, Math.ceil(period.days / 30));
    return sliced
      .filter((_, i) => i % thin === 0 || i === sliced.length - 1)
      .map(({ time }) => {
        const val = wallets.reduce((s, w) => {
          const close = closeMaps[w.currency]?.get(time);
          return close != null ? s + (w.balance || 0) * close : s;
        }, 0);
        return {
          date: new Date(time * 1000).toLocaleDateString("en-GB", { month: "short", day: "numeric" }),
          value: parseFloat(val.toFixed(2)),
        };
      });
  }, [histoday, closeMaps, wallets, period, liveOn]);

  const pastTotal = chartData[0]?.value ?? null;

  const currentTotal = useMemo(() => {
    if (!liveOn || !prices) return null;
    return wallets.reduce((s, w) => {
      const r = prices?.[w.currency] ?? null;
      return r != null ? s + (w.balance || 0) * r : s;
    }, 0);
  }, [wallets, liveOn, prices]);

  const gain = currentTotal != null && pastTotal != null ? currentTotal - pastTotal : null;
  const gainPct = gain != null && pastTotal > 0 ? (gain / pastTotal) * 100 : null;

  const assetBreakdown = useMemo(() => {
    if (!liveOn || !Object.keys(histoday).length) return [];
    return wallets
      .filter(w => w.balance > 0 && KNOWN_ASSETS.includes(w.currency))
      .map(w => {
        const series = histoday[w.currency];
        if (!series) return null;
        const sliced = series.slice(-period.days);
        const pastClose = sliced[0]?.close ?? null;
        const nowPrice = prices?.[w.currency] ?? null;
        const pastVal = pastClose != null ? (w.balance || 0) * pastClose : null;
        const currentVal = nowPrice != null ? (w.balance || 0) * nowPrice : null;
        const change = pastVal != null && currentVal != null ? currentVal - pastVal : null;
        const changePct = change != null && pastVal > 0 ? (change / pastVal) * 100 : null;
        return { ...w, pastVal, currentVal, change, changePct };
      })
      .filter(Boolean);
  }, [wallets, histoday, prices, period, liveOn]);

  const fmt = n => n != null ? `$${Math.round(n).toLocaleString()}` : "—";
  const chartStyle = { fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" };

  if ((walletsLoading || histLoading) && liveOn) return (
    <div className="flex justify-center py-20">
      <div className="h-8 w-8 rounded-full border-4 border-border border-t-primary animate-spin" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Portfolio Rewind</h1>
        <p className="text-sm text-muted-foreground">Approximate portfolio value at a point in history</p>
      </div>

      {!liveOn ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center space-y-3 text-muted-foreground">
          <p className="font-medium text-foreground">Live prices are off</p>
          <p className="text-sm">Enable live prices in <span className="font-medium text-foreground">Settings → Live Prices</span> to view historical portfolio data.</p>
        </div>
      ) : histError ? (
        <div className="p-8 rounded-xl border border-border bg-card text-center text-muted-foreground text-sm">
          Failed to load price history — check your connection and try again.
        </div>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap">
            {PERIODS.map(p => (
              <button key={p.label} onClick={() => setSelectedPeriod(p.label)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${selectedPeriod === p.label ? "bg-primary text-primary-foreground border-transparent" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="p-5 rounded-xl border border-border bg-card text-center space-y-1">
            <p className="text-xs text-muted-foreground">{period.full} your portfolio was worth</p>
            <p className="text-3xl font-bold">{fmt(pastTotal)}</p>
            <div className="flex items-center justify-center gap-3">
              <p className="text-sm text-muted-foreground">Now: {fmt(currentTotal)}</p>
              {gainPct != null && (
                <span className={`flex items-center gap-0.5 text-sm font-semibold ${gain >= 0 ? "text-green-500" : "text-destructive"}`}>
                  {gain >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {gain >= 0 ? "+" : ""}{gainPct.toFixed(1)}%
                </span>
              )}
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="p-4 rounded-xl border border-border bg-card">
              <p className="text-xs font-semibold text-muted-foreground mb-3">Portfolio Value Over Time</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={Math.ceil(chartData.length / 5)} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => [fmt(v), "Portfolio"]} contentStyle={chartStyle} />
                  <Line dataKey="value" stroke="#f97316" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {assetBreakdown.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Asset Breakdown</p>
              {assetBreakdown.map(a => (
                <div key={a.id} className="p-3.5 rounded-xl border border-border bg-card flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{a.name || a.currency}</p>
                    <p className="text-xs text-muted-foreground">{a.balance} {a.currency}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{fmt(a.pastVal)}</p>
                    {a.changePct != null && (
                      <p className={`text-xs ${a.change >= 0 ? "text-green-500" : "text-destructive"}`}>
                        {a.change >= 0 ? "+" : ""}{a.changePct.toFixed(1)}% since then
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground text-center px-4">
            Approximate only — based on current wallet balances applied to historical CryptoCompare closing prices. Assumes you held the same assets throughout; actual historical holdings may differ.
          </p>
        </>
      )}
    </div>
  );
}
