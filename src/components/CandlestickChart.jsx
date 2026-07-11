// src/components/CandlestickChart.jsx
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine,
} from "@/lib/recharts";
import { fetchOHLCVCG as fetchOHLCV } from "@/lib/coinGecko";
import { isLivePricesEnabled } from "@/lib/priceFeed";
import { PERIOD_PARAMS } from "@/lib/chartPeriods";

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
          <p key={l}>
            <span className="text-muted-foreground">{l} </span>
            <span className={`font-semibold ${l === "C" ? (isUp ? "text-success" : "text-destructive") : ""}`}>
              ${v?.toFixed(2)}
            </span>
          </p>
        ))}
      </div>
      <p className="mt-1">
        <span className="text-muted-foreground">Vol </span>
        <span className="font-semibold">{(d.volume / 1000).toFixed(0)}K</span>
      </p>
    </div>
  );
};

const CHART_H = 280;

export default function CandlestickChart({ symbol, period }) {
  const livePricesOn = isLivePricesEnabled();
  const { resolution, limit } = PERIOD_PARAMS[period] || PERIOD_PARAMS["1D"];

  const { data: rawCandles, isLoading, isError, error } = useQuery({
    queryKey: ["ohlcv", symbol, period],
    queryFn: () => fetchOHLCV(symbol, resolution, limit),
    enabled: livePricesOn,
    staleTime: 60_000,
  });

  const data = (rawCandles ?? []).map((d) => ({
    open: d.open, close: d.close, high: d.high, low: d.low,
    volume: d.volumefrom,
    price: d.close,
    time: new Date(d.time * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  }));

  const prices = data.map((d) => d.price);
  const yMin = prices.length ? Math.min(...prices) * 0.998 : 0;
  const yMax = prices.length ? Math.max(...prices) * 1.002 : 1;
  const yRange = yMax - yMin || 1;
  const firstPrice = data[0]?.price;
  const ticks = data.length
    ? data.filter((_, i) => i % Math.floor(data.length / 6) === 0).map((d) => d.time)
    : [];

  return (
    <div data-testid="candlestick-chart" className="p-4 rounded-xl border border-border bg-card">
      {!livePricesOn && (
        <p className="text-xs text-muted-foreground text-center py-6">
          Enable live prices to view chart data.
        </p>
      )}
      {livePricesOn && isLoading && (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          <svg className="animate-spin h-5 w-5 mr-2 text-primary" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading chart…
        </div>
      )}
      {livePricesOn && isError && (
        <p className="text-xs text-destructive text-center py-6">
          Chart unavailable: {error?.message ?? "unknown error"}
        </p>
      )}
      {livePricesOn && !isLoading && !isError && (
        <ResponsiveContainer width="100%" height={CHART_H}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="time" ticks={ticks} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0)}`}
              axisLine={false} tickLine={false} width={52}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
            {firstPrice && (
              <ReferenceLine y={firstPrice} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeOpacity={0.4} />
            )}
            <Bar
              dataKey="close"
              shape={(props) => {
                const p = /** @type {any} */ (props);
                return <CandlestickBar {...p} open={p.open} close={p.close} high={p.high} low={p.low} chartHeight={CHART_H} yMin={yMin} yRange={yRange} />;
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
