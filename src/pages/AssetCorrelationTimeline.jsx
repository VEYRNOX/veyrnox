import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { RefreshCw, TrendingUp } from "lucide-react";
import { isLivePricesEnabled } from "@/lib/priceFeed";

const TIMELINE_ASSETS = ["BTC", "ETH", "SOL"];
const ASSET_COLORS = { BTC: "#f97316", ETH: "#3b82f6", SOL: "#22c55e" };

async function fetchAllDailyCloses() {
  const results = await Promise.all(
    TIMELINE_ASSETS.map(sym =>
      fetch(`https://min-api.cryptocompare.com/data/v2/histoday?fsym=${sym}&tsym=USD&limit=29`)
        .then(r => r.json())
        .then(json => {
          if (json.Response !== "Success") throw new Error(json.Message || "API error");
          return [sym, json.Data.Data.filter(d => d.close > 0).map(d => ({ time: d.time, close: d.close }))];
        })
    )
  );
  return Object.fromEntries(results);
}

export default function AssetCorrelationTimeline() {
  const [assets, setAssets] = useState(["BTC", "ETH"]);
  const liveOn = isLivePricesEnabled();

  const { data: closesMap = {}, isLoading, isError } = useQuery({
    queryKey: ["correlation-timeline-closes"],
    queryFn: fetchAllDailyCloses,
    enabled: liveOn,
    staleTime: 10 * 60 * 1000,
  });

  const toggleAsset = (a) => setAssets(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);

  const chartData = useMemo(() => {
    const ref = closesMap[TIMELINE_ASSETS[0]];
    if (!ref?.length) return [];
    return ref.map(({ time }, i) => {
      const day = new Date(time * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      const obj = { day };
      for (const sym of TIMELINE_ASSETS) {
        const series = closesMap[sym];
        if (!series?.length) continue;
        const base = series[0]?.close || 1;
        obj[sym] = series[i] ? parseFloat((series[i].close / base * 100).toFixed(2)) : undefined;
      }
      return obj;
    });
  }, [closesMap]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Asset Correlation Timeline</h1>
        <p className="text-sm text-muted-foreground">30-day indexed performance · CryptoCompare</p>
      </div>

      {/* Asset toggles */}
      <div className="flex gap-2">
        {TIMELINE_ASSETS.map(a => (
          <button key={a} onClick={() => toggleAsset(a)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${assets.includes(a) ? "border-transparent text-white" : "border-border text-muted-foreground bg-card"}`}
            style={assets.includes(a) ? { background: ASSET_COLORS[a] } : {}}>
            {a}
          </button>
        ))}
      </div>

      {!liveOn ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center space-y-3 text-muted-foreground">
          <TrendingUp className="h-10 w-10 mx-auto opacity-30" />
          <p className="font-medium text-foreground">Live prices are off</p>
          <p className="text-sm">Enable live prices in <span className="font-medium text-foreground">Settings → Live Prices</span> to see real price timeline.</p>
        </div>
      ) : isLoading ? (
        <div className="p-4 rounded-xl border border-border bg-card h-72 flex items-center justify-center text-muted-foreground gap-2 text-sm">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading price history…
        </div>
      ) : isError ? (
        <div className="p-4 rounded-xl border border-border bg-card h-72 flex items-center justify-center text-muted-foreground text-sm">
          Failed to load price history — check your connection and try again.
        </div>
      ) : (
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-sm font-semibold mb-4">Price Performance (Indexed to 100)</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={6} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {assets.map(a => (
                <Line key={a} dataKey={a} stroke={ASSET_COLORS[a]} strokeWidth={2} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
