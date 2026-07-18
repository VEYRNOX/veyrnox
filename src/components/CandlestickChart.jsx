// src/components/CandlestickChart.jsx
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine,
} from "@/lib/recharts";
import { fetchOHLCV } from "@/lib/ohlcv";
import { isLivePricesEnabled, setLivePricesEnabled } from "@/lib/priceFeed";
import { PERIOD_PARAMS, formatCandleTime } from "@/lib/chartPeriods";
import { isDeniabilityOrDemoActive } from "@/wallet-core/deniabilitySession";

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

/**
 * Recharts injects `{ active, payload }` at runtime when this is passed as
 * `<Tooltip content={<CustomTooltip />} />`, so the props are optional at the
 * type level — otherwise the propless usage site fails typecheck (TS2739).
 * @param {{ active?: boolean, payload?: any[] }} [props]
 */
const CustomTooltip = ({ active, payload } = {}) => {
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
      {d.volume > 0 && (
        <p className="mt-1">
          <span className="text-muted-foreground">Vol </span>
          <span className="font-semibold">{d.volume >= 1000 ? `${(d.volume / 1000).toFixed(0)}K` : d.volume.toFixed(2)}</span>
        </p>
      )}
    </div>
  );
};

const CHART_H = 280;

export default function CandlestickChart({ symbol, period }) {
  // I3: a deniability/demo session makes zero chart egress and renders the
  // innocuous "live prices are disabled" state — identical to prices-off, no
  // visual tell (belt-and-braces with the runtime guard inside fetchOHLCV).
  const livePricesOn = isLivePricesEnabled() && !isDeniabilityOrDemoActive();
  const { resolution, limit } = PERIOD_PARAMS[period] || PERIOD_PARAMS["1D"];

  const { data: rawCandles, isLoading, isError } = useQuery({
    queryKey: ["ohlcv", symbol, period],
    queryFn: () => fetchOHLCV(symbol, resolution, limit),
    enabled: livePricesOn,
    staleTime: 60_000,
  });

  const data = (rawCandles ?? []).map((d) => ({
    open: d.open, close: d.close, high: d.high, low: d.low,
    volume: d.volumefrom,
    price: d.close,
    time: formatCandleTime(d.time, period),
  }));

  const prices = data.map((d) => d.price);
  const yMin = prices.length ? Math.min(...prices) * 0.998 : 0;
  const yMax = prices.length ? Math.max(...prices) * 1.002 : 1;
  const yRange = yMax - yMin || 1;
  const firstPrice = data[0]?.price;
  const tickStep = Math.max(1, Math.floor(data.length / 6));
  const ticks = data.length ? data.filter((_, i) => i % tickStep === 0).map((d) => d.time) : [];

  return (
    <div data-testid="candlestick-chart" className="p-4 rounded-xl border border-border bg-card">
      {!livePricesOn && (
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="text-xs text-muted-foreground text-center">Live prices are disabled — enable them to view the chart.</p>
          <button
            onClick={() => { setLivePricesEnabled(true); window.location.reload(); }}
            className="rounded-lg bg-primary/10 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
          >
            Enable live prices
          </button>
        </div>
      )}
      {livePricesOn && isLoading && (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          <svg className="motion-safe:animate-spin h-5 w-5 mr-2 text-primary" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading chart…
        </div>
      )}
      {livePricesOn && isError && (
        <p className="text-xs text-destructive text-center py-6">
          {/* Generic copy on purpose: raw provider errors (HTTP codes, guard
              strings) must never render — see the H2 sanitisation pattern. */}
          Chart unavailable — price sources didn't respond. Try again in a minute.
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
