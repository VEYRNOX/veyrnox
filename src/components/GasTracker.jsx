import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/lib/WalletProvider";
import { Zap, RefreshCw, TrendingDown, TrendingUp, Minus } from "lucide-react";

// Solana does NOT use the EVM gwei/gas-limit model, so it can't be forced into
// the SLOW/AVG/FAST tiers the other chains use. A Solana fee is a FIXED base
// fee of 5,000 lamports per signature (a protocol constant = 0.000005 SOL),
// plus an OPTIONAL priority fee quoted in micro-lamports per compute unit that
// the market sets under congestion. We render those two SOL-native numbers
// instead. The base fee is the protocol constant; the priority fee is read
// live from devnet via getRecentPrioritizationFees (real testnet data, not a
// hardcoded guess — on an idle testnet it legitimately reads ~0).
const SOL_BASE_FEE_LAMPORTS = 5000;
const SOL_DEVNET_RPC = "https://api.devnet.solana.com";

async function fetchFees() {
  const [btcRes, ethRes, solRes] = await Promise.allSettled([
    fetch("https://mempool.space/api/v1/fees/recommended").then(r => r.json()),
    fetch("https://api.etherscan.io/api?module=gastracker&action=gasoracle").then(r => r.json()),
    fetch(SOL_DEVNET_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getRecentPrioritizationFees", params: [[]] }),
    }).then(r => r.json()),
  ]);

  const btc = btcRes.status === "fulfilled" ? btcRes.value : null;
  const eth = ethRes.status === "fulfilled" && ethRes.value?.result ? ethRes.value.result : null;

  // Median of the recent per-slot prioritization fees = a representative
  // priority rate. Null (not 0) if the RPC was unreachable, so the UI can show
  // "—" for the priority cell while the fixed base fee still renders.
  let solPriority = null;
  if (solRes.status === "fulfilled" && Array.isArray(solRes.value?.result)) {
    const vals = solRes.value.result
      .map(f => f.prioritizationFee)
      .filter(n => Number.isFinite(n))
      .sort((a, b) => a - b);
    if (vals.length) solPriority = vals[Math.floor(vals.length / 2)];
  }

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
    sol: { baseLamports: SOL_BASE_FEE_LAMPORTS, priorityMicroLamports: solPriority },
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
  if (level === "low") return "text-success";
  if (level === "high") return "text-destructive";
  return "text-caution";
}

function congestionIcon(level) {
  if (level === "low") return <TrendingDown className="h-3 w-3 text-success" />;
  if (level === "high") return <TrendingUp className="h-3 w-3 text-destructive" />;
  return <Minus className="h-3 w-3 text-caution" />;
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
      <div className="flex-1 max-w-52 grid grid-cols-3 gap-2 text-right">
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

// Solana-native fee row: a fixed base fee + a live priority rate, NOT the
// SLOW/AVG/FAST tiers used for EVM/BTC, because Solana's fee model is different.
function SolFeeRow({ baseLamports, priorityMicroLamports }) {
  const baseSol = baseLamports != null ? (baseLamports / 1e9).toFixed(6) : null;
  const priorityKnown = priorityMicroLamports != null;
  // Congestion is driven by the real priority rate: idle testnet (~0) reads low.
  const congestion = !priorityKnown ? "medium" : priorityMicroLamports > 0 ? "medium" : "low";
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-2 w-16 shrink-0">
        <span className="text-base">◎</span>
        <span className="text-xs font-semibold">SOL</span>
      </div>
      <div className="flex items-center gap-1 w-20 shrink-0">
        {congestionIcon(congestion)}
        <span className={`text-xs font-medium ${congestionColor(congestion)}`}>
          {CONGESTION_LABELS[congestion]}
        </span>
      </div>
      <div className="flex-1 max-w-52 grid grid-cols-2 gap-2 text-right">
        <div>
          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Base / sig</p>
          <p className="text-xs font-mono font-semibold">
            {baseLamports != null ? baseLamports.toLocaleString() : "—"}
            <span className="text-[9px] text-muted-foreground ml-0.5">lamports</span>
          </p>
          {baseSol != null && (
            <p className="text-[8px] text-muted-foreground font-mono">≈ {baseSol} SOL</p>
          )}
        </div>
        <div>
          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Priority</p>
          <p className="text-xs font-mono font-semibold">
            {priorityKnown ? priorityMicroLamports.toLocaleString() : "—"}
            <span className="text-[9px] text-muted-foreground ml-0.5">µlam/CU</span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function GasTracker() {
  // I3 guard (VULN-15 fix): GasTracker polls 3 external services every 30 s.
  // In a decoy or hidden session that would produce detectable timed network
  // bursts, violating I3 (deniable sessions make zero backend calls). Disable
  // all fetching in those sessions — the component renders a blank / loading
  // state, which is preferable to leaking session activity to a network observer.
  const { isDecoy, isHidden } = useWallet();
  const i3Active = !isDecoy && !isHidden;

  const { data: fees, isLoading, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ["gas-fees"],
    queryFn: fetchFees,
    refetchInterval: i3Active ? 30_000 : false,
    staleTime: 20_000,
    enabled: i3Active,
  });

  const ethCongestion = getCongestion(fees?.eth?.standard, { low: 20, high: 60 });
  const btcCongestion = getCongestion(fees?.btc?.standard, { low: 10, high: 40 });

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
          aria-label="Refresh gas fees"
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
          <SolFeeRow
            baseLamports={fees?.sol?.baseLamports}
            priorityMicroLamports={fees?.sol?.priorityMicroLamports}
          />
        </div>
      )}
    </div>
  );
}