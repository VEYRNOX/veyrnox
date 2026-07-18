// @ts-nocheck
// components/SpendingPatternsCard.jsx
//
// Dashboard CONTAINER for the Spending Patterns tile. It owns the active-set-
// scoped, ON-DEMAND history fetch and feeds the pure presentational tile
// (SpendingPatternsTile) the output of analytics/spendByPeriod.
//
// PRIVACY (why this is collapsed by default): listing an address's history
// queries the BTC/SOL indexer for that address — disclosing the address and that
// this client/IP is watching it (lib/txHistory.js). That module's rule is that
// such queries run ONLY on demand, never in the background. A dashboard tile that
// auto-fetched on every load would be exactly the background disclosure it
// forbids — so this card fetches nothing until the user explicitly taps to view
// (one deliberate disclosure, the same posture as opening the History page).
//
// DENIABILITY (I3): reads only the active (decoy OR real) wallet's own derived
// address — no cross-set path, no isDecoy branch. The render logic is identical
// in both modes, so a decoy session's card is structurally indistinguishable.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Loader2, ChevronDown, ChevronUp, Info } from "lucide-react";
import { DEMO } from "@/api/demoClient";
import { useWallet } from "@/lib/WalletProvider";
import { getAsset } from "@/wallet-core/assets";
import { fetchAssetHistory } from "@/lib/txHistory";
import { spendByPeriod } from "@/analytics/spendByPeriod";
import { spendingQueryConfig } from "@/components/spendingQueryConfig";
import SpendingPatternsTile from "@/components/SpendingPatternsTile";
import Spinner from "@/components/Spinner";

// Assets whose history can be listed in-app. EVM has no JSON-RPC list method and
// we add no third-party indexer, so its tile would always be indeterminate — the
// card offers the two chains that actually have on-demand history.
const HISTORY_ASSETS = ["BTC", "SOL"];

// Resolve the active wallet's derived address for an asset's family from the
// unlocked WalletProvider context (mirrors FeeAnalytics). Demo mode uses local
// sample history instead, so no address is needed there.
function addressFor(asset, wallet) {
  if (asset.family === "btc") return wallet.btcAccount?.address || null;
  if (asset.family === "solana") return wallet.solAccount?.address || null;
  return wallet.accounts?.[0]?.address || null;
}

export default function SpendingPatternsCard() {
  const wallet = useWallet();
  const [expanded, setExpanded] = useState(false); // no fetch until the user opens it
  const [symbol, setSymbol] = useState("BTC");
  const [granularity, setGranularity] = useState("month");

  const asset = useMemo(() => getAsset(symbol) || getAsset("BTC"), [symbol]);
  const address = DEMO ? null : addressFor(asset, wallet);

  // The on-demand fetch gate (enabled === expanded) lives in spendingQueryConfig
  // so the I2 property is unit-tested. Nothing is queried while collapsed.
  const { data, isLoading, isError } = useQuery({
    ...spendingQueryConfig({ expanded, assetSymbol: asset.symbol, address, demo: DEMO }),
    queryFn: () => fetchAssetHistory({ asset, address, demo: DEMO }),
  });

  // Re-aggregating on a granularity change needs no refetch — same data, recomputed.
  const result = useMemo(
    () => (data ? spendByPeriod(data, /** @type {"month"|"week"} */ (granularity)) : null),
    [data, granularity],
  );

  // Collapsed: a calm disclosure affordance. Nothing has been queried yet.
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full rounded-2xl border border-border bg-card p-4 flex items-center justify-between gap-3 hover:bg-secondary/40 transition-colors text-left"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <TrendingUp className="h-4 w-4 text-primary shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Spending patterns</span>
            <span className="block text-[11px] text-muted-foreground">
              Reads this wallet&rsquo;s send history on demand — nothing is queried until you open it.
            </span>
          </span>
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>
    );
  }

  return (
    <div className="space-y-2">
      {/* Controls: which chain (each switch is one on-demand read) + period unit. */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {HISTORY_ASSETS.map((s) => (
            <button
              key={s}
              onClick={() => setSymbol(s)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                s === symbol ? "bg-primary text-primary-foreground border-transparent" : "bg-card border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex gap-1.5">
            {["month", "week"].map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors capitalize ${
                  g === granularity ? "bg-secondary text-foreground border-border" : "bg-card border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <button onClick={() => setExpanded(false)} aria-label="Collapse spending patterns" className="p-1 text-muted-foreground hover:text-foreground" title="Collapse">
            <ChevronUp className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* On-demand fetch states. A read error is honest (not a zero chart). */}
      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-4 flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Spinner size="sm" label={`Reading ${asset.symbol} history…`} /> Reading {asset.symbol} history…
        </div>
      ) : isError ? (
        // A failed read is indeterminate — never a fabricated zero (I4 fail-closed).
        <SpendingPatternsTile status="indeterminate" buckets={[]} granularity={granularity} assetSymbol={asset.symbol} />
      ) : result ? (
        <SpendingPatternsTile
          status={result.status}
          buckets={result.buckets}
          granularity={result.granularity}
          assetSymbol={asset.symbol}
        />
      ) : null}

      {/* Honest one-line disclosure of the phone-home this read performed. */}
      <p className="flex items-start gap-1.5 text-[10px] text-muted-foreground px-1">
        <Info className="h-3 w-3 shrink-0 mt-0.5" />
        {DEMO
          ? "Demo mode — computed from local sample history; nothing was queried."
          : `Computed on-device from ${asset.symbol} history read on demand for this wallet's address — no fiat, nothing stored.`}
      </p>
    </div>
  );
}
