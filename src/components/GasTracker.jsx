import { useQuery } from "@tanstack/react-query";
import { Zap, RefreshCw, TrendingDown, TrendingUp, Minus } from "lucide-react";

async function fetchFees() {
  const [btcRes, ethRes] = await Promise.allSettled([
    fetch("https://mempool.space/api/v1/fees/recommended").then(r => r.json()),
    fetch("https://api.etherscan.io/api?module=gastracker&action=gasoracle").then(r => r.json()),
  ]);

  const btc = btcRes.status === "fulfilled" ? btcRes.value : null;
  const eth = ethRes.status === "fulfilled" && ethRes.value?.result ? ethRes.value.result : null;

  return {
    btc: btc ? {
      slow: btc.hourFee,
      standard: btc.halfHourFee,
      fast: btc.fastestFee,
    } : null,
    eth: eth ? {
      slow: parseFloat(eth.SafeGasPrice),
      standard: parseFloat(eth.ProposeGasPrice),
      fast: parseFloat(eth.FastGasPrice),
    } : null,
    // Solana is NOT built as a chain yet (no signing stack) — these are STATIC
    // PLACEHOLDER fees, not live data. Expressed in lamports (1 SOL = 1e9
    // lamports), the unit Solana fees are actually quoted in: the 5,000-lamport
    // base fee per signature, with a priority-fee estimate for "fast". Showing
    // lamports keeps the numbers readable instead of "0.000005 SOL".
    sol: { slow: 5000, standard: 5000, fast: 250000 },
  };
}

// Format a fee value for display: tiny fractions get fixed decimals; whole
// numbers (sat/vB, Gwei, lamports) get thousands separators so large values
// like 250,000 stay readable. Non-finite (e.g. a failed fetch) renders as "—".
function formatFee(val) {
  if (val == null || (typeof val === "number" && !Number.isFinite(val))) return null;
  if (typeof val !== "number") return val;
  return val < 0.01 ? val.toFixed(6) : val.toLocaleString();
}

function congestionColor(level) {
  if (level === "low") return "text-green-400";
  if (level === "high") return "text-destructive";
  return "text-yellow-400";
}

function congestionIcon(level) {
  if (level === "low") return <TrendingDown className="h-3 w-3 text-green-400" />;
  if (level === "high") return <TrendingUp className="h-3 w-3 text-destructive" />;
  return <Minus className="h-3 w-3 text-yellow-400" />;
}

function getCongestion(standard, thresholds) {
  if (standard == null) return "medium";
  if (standard <= thresholds.low) return "low";
  if (standard >= thresholds.high) return "high";
  return "medium";
}

const CONGESTION_LABELS = { low: "Low", medium: "Average", high: "Congested" };

function FeeRow({ icon, name, slow, standard, fast, unit, congestion }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-2 w-16 shrink-0">
        <span className="text-base">{icon}</span>
        <span className="text-xs font-semibold">{name}</span>
      </div>
      <div className="flex items-center gap-1 w-20 shrink-0">
        {congestionIcon(congestion)}
        <span className={`text-xs font-medium ${congestionColor(congestion)}`}>
          {CONGESTION_LABELS[congestion]}
        </span>
      </div>
      <div className="flex-1 grid grid-cols-3 gap-1 text-right">
        {[["Slow", slow], ["Avg", standard], ["Fast", fast]].map(([label, val]) => {
          const display = formatFee(val);
          return (
            <div key={label}>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className="text-xs font-mono font-semibold">
                {display != null ? display : "—"}
                {display != null && <span className="text-[9px] text-muted-foreground ml-0.5">{unit}</span>}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function GasTracker() {
  const { data: fees, isLoading, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ["gas-fees"],
    queryFn: fetchFees,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const ethCongestion = getCongestion(fees?.eth?.standard, { low: 20, high: 60 });
  const btcCongestion = getCongestion(fees?.btc?.standard, { low: 10, high: 40 });
  const solCongestion = "low";

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Network Gas Tracker</span>
        </div>
        <button
          onClick={() => refetch()}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>
      {lastUpdated && (
        <p className="text-[10px] text-muted-foreground mb-3">Updated {lastUpdated} · refreshes every 30s</p>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div>
          <FeeRow
            icon="₿"
            name="BTC"
            slow={fees?.btc?.slow}
            standard={fees?.btc?.standard}
            fast={fees?.btc?.fast}
            unit="sat/vB"
            congestion={btcCongestion}
          />
          <FeeRow
            icon="Ξ"
            name="ETH"
            slow={fees?.eth?.slow}
            standard={fees?.eth?.standard}
            fast={fees?.eth?.fast}
            unit="Gwei"
            congestion={ethCongestion}
          />
          <FeeRow
            icon="◎"
            name="SOL"
            slow={fees?.sol?.slow}
            standard={fees?.sol?.standard}
            fast={fees?.sol?.fast}
            unit="lamports"
            congestion={solCongestion}
          />
        </div>
      )}
    </div>
  );
}