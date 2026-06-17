import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "@/lib/recharts";
import { TrendingUp, TrendingDown } from "lucide-react";
import { TOP_CRYPTOS } from "@/lib/cryptos";
import { fetchOHLCV } from "@/lib/cryptoCompare";
import { isLivePricesEnabled, setLivePricesEnabled } from "@/lib/priceFeed";

// Top 10 by market cap, derived from the canonical source so every feature
// stays in sync. `price` mirrors the canonical reference `usd`.
const ASSETS = TOP_CRYPTOS.map(c => ({
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

const CandlestickBar = (props) => {
  const { x, y, width, height, open, close, high, low, chartHeight, yMin, yRange } = props;
  if (!open || !close) return null;
  const isUp = close >= open;
  const color = isUp ? "#22C55E" : "#EF4444";
  const toY = (v) => ((1 - (v - yMin) / yRange) * chartHeight);
  const bodyTop = Math.min(toY(open), toY(close));
  const bodyH = Math.abs(toY(open) - toY(close)) || 1;
  const wickX = x + width / 2;
  return (
    <g>
      <line x1={wickX} x2={wickX} y1={toY(high)} y2={toY(low)} stroke={color} strokeWidth={1} />
      <rect x={x + 1} y={bodyTop} width={width - 2} height={bodyH} fill={color} opacity={0.9} />
    </g>
  );
};

const CustomTooltip = ({ active = undefined, payload = undefined }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const isUp = d.close >= d.open;
  return (
    <div className="bg-card border border-border rounded-xl p-3 text-xs shadow-lg">
      <p className="text-muted-foreground mb-1">{d.time}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {[["O", d.open], ["H", d.high], ["L", d.low], ["C", d.close]].map(([l, v]) => (
          <p key={l}><span className="text-muted-foreground">{l} </span><span className={`font-semibold ${l === "C" ? (isUp ? "text-green-500" : "text-destructive") : ""}`}>${v?.toFixed(2)}</span></p>
        ))}
      </div>
      <p className="mt-1"><span className="text-muted-foreground">Vol </span><span className="font-semibold">{(d.volume / 1000).toFixed(0)}K</span></p>
    </div>
  );
};

export default function PriceCharts() {
  const [selected, setSelected] = useState("BTC");
  const [period, setPeriod] = useState("1D");

  const livePricesOn = isLivePricesEnabled();
  const asset = ASSETS.find(a => a.symbol === selected);
  const { resolution, limit } = PERIOD_PARAMS[period];

  const { data: rawCandles, isLoading, isError, error } = useQuery({
    queryKey: ["ohlcv", selected, period],
    queryFn: () => fetchOHLCV(selected, resolution, limit),
    enabled: livePricesOn,
    staleTime: 60_000,
  });

  // Map CryptoCompare candles to chart format
  const data = (rawCandles ?? []).map(d => ({
    open: d.open,
    close: d.close,
    high: d.high,
    low: d.low,
    volume: d.volumefrom,
    price: d.close,
    time: new Date(d.time * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  }));

  const prices = data.map(d => d.price);
  const yMin = prices.length ? Math.min(...prices) * 0.998 : 0;
  const yMax = prices.length ? Math.max(...prices) * 1.002 : 1;
  const yRange = yMax - yMin || 1;
  const firstPrice = data[0]?.price;
  const lastPrice = data[data.length - 1]?.price;
  const change = firstPrice && lastPrice ? ((lastPrice - firstPrice) / firstPrice * 100).toFixed(2) : "0.00";
  const isUp = parseFloat(change) >= 0;
  const chartH = 300;

  const ticks = data.length
    ? data.filter((_, i) => i % Math.floor(data.length / 6) === 0).map(d => d.time)
    : [];

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div><h1 className="text-xl font-bold">Price Charts</h1><p className="text-sm text-muted-foreground">Candlestick charts for major assets</p></div>

      {/* Live prices off banner */}
      {!livePricesOn && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Live prices are disabled. Enable them to view real chart data.</span>
          <button
            onClick={() => { setLivePricesEnabled(true); window.location.reload(); }}
            className="shrink-0 rounded-lg bg-yellow-500/20 px-3 py-1.5 text-xs font-semibold text-yellow-600 hover:bg-yellow-500/30 transition-colors"
          >
            Enable
          </button>
        </div>
      )}

      {/* Asset selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {ASSETS.map(a => (
          <button key={a.symbol} onClick={() => livePricesOn && setSelected(a.symbol)}
            disabled={!livePricesOn}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold shrink-0 transition-colors ${selected === a.symbol ? "border-transparent text-white" : "border-border bg-card text-muted-foreground hover:text-foreground"} ${!livePricesOn ? "opacity-40 cursor-not-allowed" : ""}`}
            style={selected === a.symbol ? { backgroundColor: a.color } : {}}>
            {a.symbol}
            <span className={`text-[10px] ${a.change24h >= 0 ? "text-green-400" : "text-red-400"}`}>
              {a.change24h >= 0 ? "+" : ""}{a.change24h}%
            </span>
          </button>
        ))}
      </div>

      {/* Price header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-3xl font-bold">${lastPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "—"}</p>
          <div className={`flex items-center gap-1 mt-0.5 text-sm font-medium ${isUp ? "text-green-500" : "text-destructive"}`}>
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
        {PERIODS.map(p => (
          <button key={p} onClick={() => setPeriod(p)} disabled={!livePricesOn}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"} ${!livePricesOn ? "opacity-40 cursor-not-allowed" : ""}`}>{p}</button>
        ))}
      </div>

      {/* Loading / error states */}
      {livePricesOn && isLoading && (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          <svg className="animate-spin h-5 w-5 mr-2 text-primary" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading chart data…
        </div>
      )}
      {livePricesOn && isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load chart data: {error?.message ?? "unknown error"}
        </div>
      )}

      {/* Candlestick chart */}
      {(!livePricesOn || (!isLoading && !isError)) && (
        <div className={`p-4 rounded-xl border border-border bg-card ${!livePricesOn ? "opacity-40 pointer-events-none" : ""}`}>
          <ResponsiveContainer width="100%" height={chartH}>
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="time" ticks={ticks} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis domain={[yMin, yMax]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0)}`} axisLine={false} tickLine={false} width={52} />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
              {firstPrice && <ReferenceLine y={firstPrice} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeOpacity={0.4} />}
              <Bar dataKey="close" shape={(props) => <CandlestickBar {...props} open={props.open} close={props.close} high={props.high} low={props.low} chartHeight={chartH} yMin={yMin} yRange={yRange} />} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Volume bar */}
      {(!livePricesOn || (!isLoading && !isError)) && (
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
