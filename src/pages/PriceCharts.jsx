import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { TrendingUp, TrendingDown, BarChart2, RefreshCw } from "lucide-react";
import { TOP_CRYPTOS } from "@/lib/cryptos";
import { isLivePricesEnabled, useLivePrices } from "@/lib/priceFeed";

const ASSETS = TOP_CRYPTOS.map(c => ({
  symbol: c.symbol, name: c.name, change24h: c.change24h, color: c.color, mcap: c.mcap,
}));

const PERIODS = ["1H", "4H", "1D", "1W", "1M"];

const PERIOD_CFG = {
  "1H": { endpoint: "histominute", limit: 60,  fmt: t => new Date(t * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) },
  "4H": { endpoint: "histominute", limit: 240, fmt: t => new Date(t * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) },
  "1D": { endpoint: "histohour",   limit: 24,  fmt: t => new Date(t * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) },
  "1W": { endpoint: "histohour",   limit: 168, fmt: t => new Date(t * 1000).toLocaleDateString("en-GB", { month: "short", day: "numeric" }) },
  "1M": { endpoint: "histoday",    limit: 30,  fmt: t => new Date(t * 1000).toLocaleDateString("en-GB", { month: "short", day: "numeric" }) },
};

async function fetchOHLCV(symbol, period) {
  const { endpoint, limit, fmt } = PERIOD_CFG[period];
  const res = await fetch(`https://min-api.cryptocompare.com/data/v2/${endpoint}?fsym=${symbol}&tsym=USD&limit=${limit}`);
  if (!res.ok) throw new Error("Fetch failed");
  const json = await res.json();
  if (json.Response !== "Success") throw new Error(json.Message || "API error");
  return json.Data.Data
    .filter(d => d.close > 0)
    .map(d => ({ time: fmt(d.time), open: d.open, high: d.high, low: d.low, close: d.close, price: d.close, volume: d.volumefrom }));
}

const CandlestickBar = (props) => {
  const { x, width, open, close, high, low, chartHeight, yMin, yRange } = props;
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

const CustomTooltip = ({ active, payload }) => {
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

  const liveOn = isLivePricesEnabled();
  const { prices } = useLivePrices();

  const { data: ohlcv = [], isLoading, isError } = useQuery({
    queryKey: ["ohlcv", selected, period],
    queryFn: () => fetchOHLCV(selected, period),
    enabled: liveOn,
    staleTime: 60_000,
  });

  const asset = ASSETS.find(a => a.symbol === selected);
  const spotPrice = prices?.[selected] ?? null;

  const allPrices = ohlcv.flatMap(d => [d.high, d.low]).filter(Boolean);
  const yMin = allPrices.length ? Math.min(...allPrices) * 0.998 : 0;
  const yMax = allPrices.length ? Math.max(...allPrices) * 1.002 : 1;
  const yRange = yMax - yMin || 1;
  const firstPrice = ohlcv[0]?.close;
  const lastPrice = ohlcv[ohlcv.length - 1]?.close;
  const displayPrice = spotPrice ?? lastPrice ?? null;
  const change = firstPrice && lastPrice ? ((lastPrice - firstPrice) / firstPrice * 100).toFixed(2) : null;
  const isUp = change != null ? parseFloat(change) >= 0 : true;
  const chartH = 300;
  const ticks = ohlcv.filter((_, i) => i % Math.max(1, Math.floor(ohlcv.length / 6)) === 0).map(d => d.time);

  const AssetSelector = ({ showChange }) => (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {ASSETS.map(a => (
        <button key={a.symbol} onClick={() => setSelected(a.symbol)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold shrink-0 transition-colors ${selected === a.symbol ? "border-transparent text-white" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
          style={selected === a.symbol ? { backgroundColor: a.color } : {}}>
          {a.symbol}
          {showChange && a.change24h != null && (
            <span className={`text-[10px] ${a.change24h >= 0 ? "text-green-400" : "text-red-400"}`}>
              {a.change24h >= 0 ? "+" : ""}{a.change24h}%
            </span>
          )}
        </button>
      ))}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold">Price Charts</h1>
        <p className="text-sm text-muted-foreground">Candlestick charts · CryptoCompare</p>
      </div>

      {!liveOn ? (
        <>
          <AssetSelector showChange={false} />
          <div className="rounded-2xl border border-border bg-card p-10 text-center space-y-3 text-muted-foreground">
            <BarChart2 className="h-10 w-10 mx-auto opacity-30" />
            <p className="font-medium text-foreground">Live prices are off</p>
            <p className="text-sm">Enable live prices in <span className="font-medium text-foreground">Settings → Live Prices</span> to see real candlestick charts.</p>
          </div>
        </>
      ) : (
        <>
          <AssetSelector showChange={true} />

          {/* Price header */}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold">
                {displayPrice != null ? `$${displayPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
              </p>
              <div className={`flex items-center gap-1 mt-0.5 text-sm font-medium ${change != null ? (isUp ? "text-green-500" : "text-destructive") : "text-muted-foreground"}`}>
                {change != null ? (
                  <>{isUp ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />} {isUp ? "+" : ""}{change}% · {period}</>
                ) : (
                  <span>{period}</span>
                )}
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>Mkt Cap {asset.mcap}</p>
              <p className="mt-0.5">{asset.name}</p>
            </div>
          </div>

          {/* Period selector */}
          <div className="flex gap-1">
            {PERIODS.map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {p}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="p-4 rounded-xl border border-border bg-card h-80 flex items-center justify-center text-muted-foreground gap-2 text-sm">
              <RefreshCw className="h-4 w-4 animate-spin" /> Loading chart data…
            </div>
          ) : isError ? (
            <div className="p-4 rounded-xl border border-border bg-card h-80 flex items-center justify-center text-muted-foreground text-sm">
              Failed to load chart data — check your connection and try again.
            </div>
          ) : (
            <>
              {/* Candlestick chart */}
              <div className="p-4 rounded-xl border border-border bg-card">
                <ResponsiveContainer width="100%" height={chartH}>
                  <ComposedChart data={ohlcv} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="time" ticks={ticks} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[yMin, yMax]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0)}`} axisLine={false} tickLine={false} width={52} />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
                    {firstPrice && <ReferenceLine y={firstPrice} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeOpacity={0.4} />}
                    <Bar dataKey="close" shape={(props) => <CandlestickBar {...props} chartHeight={chartH} yMin={yMin} yRange={yRange} />} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Volume bar */}
              <div className="p-4 rounded-xl border border-border bg-card">
                <p className="text-xs text-muted-foreground mb-2 font-semibold">Volume</p>
                <ResponsiveContainer width="100%" height={60}>
                  <ComposedChart data={ohlcv}>
                    <Bar dataKey="volume" fill="hsl(var(--primary))" opacity={0.4} radius={[2, 2, 0, 0]} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
