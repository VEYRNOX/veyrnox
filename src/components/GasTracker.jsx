import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/lib/WalletProvider";
import { DEMO } from "@/api/demoClient";
import { Zap, RefreshCw } from "lucide-react";

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

function getCongestion(standard, thresholds) {
  if (standard == null) return "medium";
  if (standard <= thresholds.low) return "low";
  if (standard >= thresholds.high) return "high";
  return "medium";
}

function CongestionBadge({ level }) {
  const styles =
    level === "low"
      ? "bg-success/10 text-success border-success/20"
      : level === "high"
      ? "bg-destructive/10 text-destructive border-destructive/20"
      : "bg-caution/10 text-caution border-caution/20";
  const label = level === "low" ? "Low" : level === "high" ? "High" : "Avg";
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-px rounded border ${styles}`}>
      {label}
    </span>
  );
}

function SkeletonRow({ last }) {
  return (
    <div className={`flex items-center justify-between py-3 ${last ? "" : "border-b border-border"}`}>
      <div className="flex items-center gap-2.5">
        <div className="w-6 h-5 rounded bg-muted animate-pulse" />
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <div className="w-8 h-3.5 rounded bg-muted animate-pulse" />
            <div className="w-9 h-4 rounded-full bg-muted animate-pulse" />
          </div>
          <div className="w-24 h-2.5 rounded bg-muted animate-pulse" />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="w-16 h-2.5 rounded bg-muted animate-pulse ml-auto" />
        <div className="w-20 h-4 rounded bg-muted animate-pulse" />
      </div>
    </div>
  );
}

function FeeRow({ glyph, name, slow, standard, fast, unit, congestion }) {
  const recommended = formatFee(standard);
  const slowFmt = formatFee(slow);
  const fastFmt = formatFee(fast);
  const hasTierDetail = slowFmt != null || fastFmt != null;

  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-base leading-none shrink-0 w-6 text-center font-mono" aria-hidden="true">
          {glyph}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold">{name}</span>
            <CongestionBadge level={congestion} />
          </div>
          {hasTierDetail && (
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5 tabular-nums">
              {slowFmt != null ? `${slowFmt} slow` : null}
              {slowFmt != null && fastFmt != null ? " · " : null}
              {fastFmt != null ? `${fastFmt} fast` : null}
              {" "}{unit}
            </p>
          )}
        </div>
      </div>
      <div className="text-right shrink-0 pl-4">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Recommended</p>
        <p className="text-sm font-mono font-semibold tabular-nums">
          {recommended ?? "—"}
          {recommended != null && (
            <span className="text-[10px] text-muted-foreground font-normal ml-1">{unit}</span>
          )}
        </p>
      </div>
    </div>
  );
}

// Solana-native fee row: a fixed base fee + a live priority rate, NOT the
// SLOW/AVG/FAST tiers used for EVM/BTC, because Solana's fee model is different.
function SolFeeRow({ baseLamports, priorityMicroLamports }) {
  const baseSol = baseLamports != null ? (baseLamports / 1e9).toFixed(6) : null;
  const priorityKnown = priorityMicroLamports != null;
  const congestion = !priorityKnown ? "medium" : priorityMicroLamports > 0 ? "medium" : "low";
  const hasPriority = priorityKnown && priorityMicroLamports > 0;

  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-base leading-none shrink-0 w-6 text-center font-mono" aria-hidden="true">
          ◎
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold">SOL</span>
            <CongestionBadge level={congestion} />
          </div>
          {hasPriority && (
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5 tabular-nums">
              +{priorityMicroLamports.toLocaleString()} µlam/CU priority
            </p>
          )}
        </div>
      </div>
      <div className="text-right shrink-0 pl-4">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Per tx</p>
        <p className="text-sm font-mono font-semibold tabular-nums">
          {baseSol ?? "—"}
          {baseSol != null && (
            <span className="text-[10px] text-muted-foreground font-normal ml-1">SOL</span>
          )}
        </p>
      </div>
    </div>
  );
}

export default function GasTracker() {
  // I3 guard (VULN-15 fix): GasTracker polls 3 external services every 30 s
  // (mempool.space, api.etherscan.io, api.devnet.solana.com). In a decoy or
  // hidden session that would produce detectable timed network bursts, violating
  // I3 (deniable sessions make zero backend calls). Disable all fetching in those
  // sessions — the component renders a blank / loading state, which is preferable
  // to leaking session activity to a network observer.
  //
  // DEMO suppression (M-6 class, mirrors src/notify/useReceiveDetector.js): a
  // demo tour (veyrnox-demo=1, no unlocked vault) is NOT a decoy/hidden session,
  // so isDecoy/isHidden are both false and the I3 gate alone lets these live
  // fetches through. DEMO is a module-load-time constant boolean; folding !DEMO
  // into the egress gate makes a demo tour fire ZERO real backend calls. The
  // disabled state renders the same network-silent UI — NO mock/fake fee data.
  const { isDecoy, isHidden } = useWallet();
  const i3Active = !isDecoy && !isHidden;
  const egressAllowed = i3Active && !DEMO;

  const { data: fees, isLoading, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ["gas-fees"],
    queryFn: fetchFees,
    refetchInterval: egressAllowed ? 30_000 : false,
    staleTime: 20_000,
    enabled: egressAllowed,
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
        <div>
          <SkeletonRow last={false} />
          <SkeletonRow last={false} />
          <SkeletonRow last />
        </div>
      ) : (
        <div>
          <FeeRow
            glyph="₿"
            name="BTC"
            slow={fees?.btc?.slow}
            standard={fees?.btc?.standard}
            fast={fees?.btc?.fast}
            unit="sat/vB"
            congestion={btcCongestion}
          />
          <FeeRow
            glyph="Ξ"
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