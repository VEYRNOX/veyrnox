import { useState, useMemo } from "react";
import { ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";
import { TOP_CRYPTOS } from "@/lib/cryptos";

// Top 10 by market cap, derived from the canonical source so every feature
// stays in sync. `price` mirrors the canonical reference `usd`.
const ASSETS = TOP_CRYPTOS.map(c => ({
  symbol: c.symbol, name: c.name, price: c.usd, change24h: c.change24h, color: c.color, mcap: c.mcap,
}));

const PERIODS = ["1H", "4H", "1D", "1W", "1M"];

function generateOHLCV(basePrice, count, volatility = 0.02) {
  const data = [];
  let price = basePrice;
  const now = Date.now();
  for (let i = count; i >= 0; i--) {
    const change = (Math.random() - 0.48) * volatility;
    const open = price;
    price = price * (1 + change);
    const high = Math.max(open, price) * (1 + Math.random() * volatility * 0.5);
    const low = Math.min(open, price) * (1 - Math.random() * volatility * 0.5);
    const volume = Math.random() * basePrice * 10000;
    data.push({ open, close: price, high, low, volume, price, time: new Date(now - i * 3600000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) });
  }
  return data;
}

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

  const asset = ASSETS.find(a => a.symbol === selected);
  const countMap = { "1H": 60, "4H": 48, "1D": 72, "1W": 84, "1M": 90 };
  const volMap = { "1H": 0.008, "4H": 0.015, "1D": 0.025, "1W": 0.04, "1M": 0.06 };

  const data = useMemo(() => generateOHLCV(asset.price, countMap[period], volMap[period]), [selected, period]);

  const prices = data.map(d => d.price);
  const yMin = Math.min(...prices) * 0.998;
  const yMax = Math.max(...prices) * 1.002;
  const yRange = yMax - yMin;
  const firstPrice = data[0]?.price;
  const lastPrice = data[data.length - 1]?.price;
  const change = ((lastPrice - firstPrice) / firstPrice * 100).toFixed(2);
  const isUp = parseFloat(change) >= 0;
  const chartH = 300;

  const ticks = data.filter((_, i) => i % Math.floor(data.length / 6) === 0).map(d => d.time);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div><h1 className="text-xl font-bold">Price Charts</h1><p className="text-sm text-muted-foreground">Candlestick charts for major assets</p></div>

      {/* Asset selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {ASSETS.map(a => (
          <button key={a.symbol} onClick={() => setSelected(a.symbol)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold shrink-0 transition-colors ${selected === a.symbol ? "border-transparent text-white" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
            style={selected === a.symbol ? { backgroundColor: a.color } : {}}>
            {a.symbol}
            <span className={`text-[10px] ${a.change24h >= 0 ? "text-green-400" : "text-red-400"} ${selected === a.symbol ? "" : ""}`}>
              {a.change24h >= 0 ? "+" : ""}{a.change24h}%
            </span>
          </button>
        ))}
      </div>

      {/* Price header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-3xl font-bold">${lastPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
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
          <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{p}</button>
        ))}
      </div>

      {/* Candlestick chart */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <ResponsiveContainer width="100%" height={chartH}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="time" ticks={ticks} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis domain={[yMin, yMax]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0)}`} axisLine={false} tickLine={false} width={52} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
            <ReferenceLine y={firstPrice} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeOpacity={0.4} />
            <Bar dataKey="close" shape={(props) => <CandlestickBar {...props} open={props.open} close={props.close} high={props.high} low={props.low} chartHeight={chartH} yMin={yMin} yRange={yRange} />} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Volume bar */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <p className="text-xs text-muted-foreground mb-2 font-semibold">Volume</p>
        <ResponsiveContainer width="100%" height={60}>
          <ComposedChart data={data}>
            <Bar dataKey="volume" fill="hsl(var(--primary))" opacity={0.4} radius={[2, 2, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}