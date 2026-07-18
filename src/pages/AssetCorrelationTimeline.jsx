// @ts-nocheck
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { fetchOHLCV } from "@/lib/ohlcv";
import { isDeniabilityOrDemoActive } from "@/wallet-core/deniabilitySession";
import { isLivePricesEnabled, setLivePricesEnabled } from "@/lib/priceFeed";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "@/lib/recharts";
import { Newspaper, TrendingUp, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pearson correlation coefficient between two equal-length number arrays.
 * Returns 0 when there are fewer than 2 points or zero variance.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const meanA = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const meanB = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - meanA, y = b[i] - meanB;
    num += x * y; da += x * x; db += y * y;
  }
  return (da && db) ? num / Math.sqrt(da * db) : 0;
}

/**
 * Compute rolling Pearson correlation over a sliding window.
 * Returns an array of length (closes.length - window + 1).
 * @param {number[]} a
 * @param {number[]} b
 * @param {number} window
 * @returns {number[]}
 */
function rollingCorr(a, b, window = 7) {
  const n = Math.min(a.length, b.length);
  const out = [];
  for (let i = window - 1; i < n; i++) {
    out.push(pearson(a.slice(i - window + 1, i + 1), b.slice(i - window + 1, i + 1)));
  }
  return out;
}

/** Format a unix timestamp (seconds) as "Jun 15" */
function fmtDate(ts) {
  return new Date(ts * 1000).toLocaleDateString("en-GB", { month: "short", day: "numeric" });
}

const PAIRS = [
  { key: "btc-eth", label: "BTC–ETH", color: "hsl(var(--primary))" },
  { key: "btc-sol", label: "BTC–SOL", color: "hsl(var(--chart-5))" },
  { key: "eth-sol", label: "ETH–SOL", color: "hsl(var(--chart-2))" },
];

const WINDOW = 7; // rolling window in days

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------
const CorrTooltip = ({ active = undefined, payload = undefined, label = undefined }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl p-3 text-xs shadow-lg space-y-1">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.stroke }}>
          <span className="font-semibold">{p.name}</span>{" "}
          <span className="font-mono">{Number(p.value).toFixed(3)}</span>
        </p>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function AssetCorrelationTimeline() {
  // I3: a deniability/demo session makes zero chart egress (belt-and-braces
  // with the runtime guard inside fetchOHLCV itself).
  const livePricesOn = isLivePricesEnabled() && !isDeniabilityOrDemoActive();

  // News sentiment (always fetched — no price data required)
  const { data: newsSentiments = [], isError: newsError } = useQuery({
    queryKey: ["news-sentiments"],
    queryFn: () => base44.entities.NewsSentiment.list("-created_date", 20),
  });

  // OHLCV queries — gated on live prices being enabled
  const btcQ = useQuery({
    queryKey: ["ohlcv-corr", "BTC"],
    queryFn: () => fetchOHLCV("BTC", "day", 30),
    enabled: livePricesOn,
    staleTime: 5 * 60_000,
  });
  const ethQ = useQuery({
    queryKey: ["ohlcv-corr", "ETH"],
    queryFn: () => fetchOHLCV("ETH", "day", 30),
    enabled: livePricesOn,
    staleTime: 5 * 60_000,
  });
  const solQ = useQuery({
    queryKey: ["ohlcv-corr", "SOL"],
    queryFn: () => fetchOHLCV("SOL", "day", 30),
    enabled: livePricesOn,
    staleTime: 5 * 60_000,
  });

  const isLoading = btcQ.isLoading || ethQ.isLoading || solQ.isLoading;
  const isError = btcQ.isError || ethQ.isError || solQ.isError;
  // Generic copy on purpose: raw provider errors (HTTP codes, guard strings)
  // must never render — see the H2 sanitisation pattern.
  const errorMsg = "price sources didn't respond. Try again in a minute.";

  // Build chart data when all three series are ready
  let chartData = null;
  if (livePricesOn && !isLoading && !isError && btcQ.data && ethQ.data && solQ.data) {
    const btcClose = btcQ.data.map((d) => d.close);
    const ethClose = ethQ.data.map((d) => d.close);
    const solClose = solQ.data.map((d) => d.close);

    // Align on btc timestamps (all three share the same daily UTC buckets)
    const times = btcQ.data.map((d) => d.time);

    const corrBtcEth = rollingCorr(btcClose, ethClose, WINDOW);
    const corrBtcSol = rollingCorr(btcClose, solClose, WINDOW);
    const corrEthSol = rollingCorr(ethClose, solClose, WINDOW);

    // Rolling output starts at index (WINDOW - 1) relative to the raw series
    chartData = corrBtcEth.map((v, i) => ({
      date: fmtDate(times[i + WINDOW - 1]),
      "btc-eth": parseFloat(v.toFixed(4)),
      "btc-sol": parseFloat(corrBtcSol[i].toFixed(4)),
      "eth-sol": parseFloat(corrEthSol[i].toFixed(4)),
    }));
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Asset Correlation Timeline</h1>
        <p className="text-sm text-muted-foreground">
          7-day rolling Pearson correlation — BTC, ETH, SOL (30-day window)
        </p>
      </div>

      {/* Live prices off banner — same style as PriceCharts.jsx lines 106-116 */}
      {!livePricesOn && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-caution/30 bg-caution/10 px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            Live prices are disabled. Enable them to view real correlation data.
          </span>
          <button
            onClick={() => { setLivePricesEnabled(true); window.location.reload(); }}
            className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Enable
          </button>
        </div>
      )}

      {/* Loading spinner */}
      {livePricesOn && isLoading && (
        <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
          <svg className="animate-spin h-5 w-5 mr-2 text-primary" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading OHLCV data for BTC, ETH, SOL…
        </div>
      )}

      {/* Error state */}
      {livePricesOn && isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Failed to load price data: {errorMsg}</span>
        </div>
      )}

      {/* Correlation chart */}
      {chartData && chartData.length > 0 && (
        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Rolling Correlation
            </p>
            <p className="text-xs text-muted-foreground">{WINDOW}-day window</p>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3">
            {PAIRS.map((p) => (
              <div key={p.key} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-5 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                <span className="text-xs text-muted-foreground">{p.label}</span>
              </div>
            ))}
          </div>

          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[-1, 1]}
                ticks={[-1, -0.5, 0, 0.5, 1]}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v) => v.toFixed(1)}
                axisLine={false}
                tickLine={false}
                label={{
                  value: "Correlation",
                  angle: -90,
                  position: "insideLeft",
                  offset: 12,
                  style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" },
                }}
                width={58}
              />
              <Tooltip content={<CorrTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeOpacity={0.5} />
              {PAIRS.map((p) => (
                <Line
                  key={p.key}
                  type="monotone"
                  dataKey={p.key}
                  name={p.label}
                  stroke={p.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>

          <p className="text-xs text-muted-foreground">
            Values near +1 = assets moved together. Near 0 = uncorrelated. Near −1 = inverse.
            Source: CryptoCompare daily close prices.
          </p>
        </div>
      )}

      {/* News sentiment error */}
      {newsError && (
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Couldn't load sentiment records — they may not all be shown.</span>
        </div>
      )}

      {/* News sentiment list */}
      {newsSentiments.length > 0 && (
        <div className="p-4 rounded-xl border border-border bg-card space-y-2">
          <p className="text-sm font-bold flex items-center gap-2">
            <Newspaper className="h-4 w-4" /> News Sentiment Records
          </p>
          <p className="text-xs text-muted-foreground">Records saved from the AI Refresh feature</p>
          {newsSentiments.slice(0, 5).map((n) => (
            <div
              key={n.id}
              className="flex items-start gap-2 text-xs py-1 border-b border-border/50 last:border-0"
            >
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                  n.sentiment?.includes("bullish")
                    ? "bg-success/10 text-success"
                    : n.sentiment?.includes("bearish")
                    ? "bg-destructive/10 text-destructive"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {n.asset}
              </span>
              <div className="flex-1">
                <p className="text-muted-foreground">{n.headline}</p>
                <p className="text-[10px] text-muted-foreground/60">
                  {formatDistanceToNow(new Date(n.published_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state — only when no chart is showing AND no news */}
      {!livePricesOn && newsSentiments.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Newspaper className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No sentiment records yet</p>
          <p className="text-xs mt-1">
            Records appear here when saved via the News Sentiment AI Refresh
          </p>
        </div>
      )}
    </div>
  );
}
