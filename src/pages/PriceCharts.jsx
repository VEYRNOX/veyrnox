import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, ComposedChart, Bar } from "@/lib/recharts";
import { TrendingUp, TrendingDown } from "lucide-react";
import { TOP_CRYPTOS } from "@/lib/cryptos";
import { fetchOHLCVCG as fetchOHLCV } from "@/lib/coinGecko";
import { isLivePricesEnabled, setLivePricesEnabled } from "@/lib/priceFeed";
import CandlestickChart from "@/components/CandlestickChart";

// Top 10 by market cap, derived from the canonical source so every feature
// stays in sync. `price` mirrors the canonical reference `usd`.
const ASSETS = TOP_CRYPTOS.map((c) => ({
  symbol: c.symbol, name: c.name, price: c.usd, change24h: c.change24h, color: c.color, mcap: c.mcap,
}));

const PERIODS = ["1H", "4H", "1D", "1W", "1M"];

// Period → { resolution, limit } mapping for CryptoCompare histoX endpoints
const PERIOD_PARAMS = {
  "1H": { resolution: "minute", limit: 60 },
  "4H": { resolution: "minute", limit: 240 },
  "1D": { resolution: "hour",   limit: 24 },
  "1W": { resolution: "hour",   limit: 168 },
  "1M": { resolution: "day",    limit: 30 },
};

export default function PriceCharts() {
  const [selected, setSelected] = useState("BTC");
  const [period, setPeriod] = useState("1D");

  const livePricesOn = isLivePricesEnabled();
  const asset = ASSETS.find((a) => a.symbol === selected);
  const { resolution, limit } = PERIOD_PARAMS[period];

  // Volume bar still needs its own query (same queryKey — cached, no double-fetch).
  const { data: rawCandles } = useQuery({
    queryKey: ["ohlcv", selected, period],
    queryFn: () => fetchOHLCV(selected, resolution, limit),
    enabled: livePricesOn,
    staleTime: 60_000,
  });

  const data = (rawCandles ?? []).map((d) => ({
    close: d.close,
    volume: d.volumefrom,
    price: d.close,
    time: new Date(d.time * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  }));

  const firstPrice = data[0]?.price;
  const lastPrice = data[data.length - 1]?.price;
  const change = firstPrice && lastPrice ? ((lastPrice - firstPrice) / firstPrice * 100).toFixed(2) : "0.00";
  const isUp = parseFloat(change) >= 0;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold">Price Charts</h1>
        <p className="text-sm text-muted-foreground">Candlestick charts for major assets</p>
      </div>

      {/* Live prices off banner */}
      {!livePricesOn && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-caution/30 bg-caution/10 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Live prices are disabled. Enable them to view real chart data.</span>
          <button
            onClick={() => { setLivePricesEnabled(true); window.location.reload(); }}
            className="shrink-0 rounded-lg bg-caution/20 px-3 py-1.5 text-xs font-semibold text-caution hover:bg-caution/30 transition-colors"
          >
            Enable
          </button>
        </div>
      )}

      {/* Asset selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {ASSETS.map((a) => (
          <button key={a.symbol} onClick={() => livePricesOn && setSelected(a.symbol)}
            disabled={!livePricesOn}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold shrink-0 transition-colors ${selected === a.symbol ? "border-transparent text-white" : "border-border bg-card text-muted-foreground hover:text-foreground"} ${!livePricesOn ? "opacity-40 cursor-not-allowed" : ""}`}
            style={selected === a.symbol ? { backgroundColor: a.color } : {}}>
            {a.symbol}
            <span className={`text-[10px] ${a.change24h >= 0 ? "text-success" : "text-destructive"}`}>
              {a.change24h >= 0 ? "+" : ""}{a.change24h}%
            </span>
          </button>
        ))}
      </div>

      {/* Price header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-3xl font-bold">${lastPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "—"}</p>
          <div className={`flex items-center gap-1 mt-0.5 text-sm font-medium ${isUp ? "text-success" : "text-destructive"}`}>
            {isUp ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {isUp ? "+" : ""}{change}% · {period}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>Mkt Cap ${asset.mcap}</p>
          <p className="mt-0.5">{asset.name}</p>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex gap-1">
        {PERIODS.map((p) => (
          <button key={p} onClick={() => setPeriod(p)} disabled={!livePricesOn}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"} ${!livePricesOn ? "opacity-40 cursor-not-allowed" : ""}`}>
            {p}
          </button>
        ))}
      </div>

      <CandlestickChart symbol={selected} period={period} />

      {(!livePricesOn || data.length > 0) && (
        <div className={`p-4 rounded-xl border border-border bg-card ${!livePricesOn ? "opacity-40 pointer-events-none" : ""}`}>
          <p className="text-xs text-muted-foreground mb-2 font-semibold">Volume</p>
          <ResponsiveContainer width="100%" height={60}>
            <ComposedChart data={data}>
              <Bar dataKey="volume" fill="hsl(var(--primary))" opacity={0.4} radius={[2, 2, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
