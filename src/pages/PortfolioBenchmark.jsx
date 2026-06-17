import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { BarChart2, TrendingUp } from "lucide-react";

export default function PortfolioBenchmark() {
  const { data: wallets = [] } = useQuery({ queryKey: ["wallets"], queryFn: () => base44.entities.Wallet.list() });

  const nativeBreakdown = wallets.reduce((acc, w) => {
    acc[w.currency] = (acc[w.currency] || 0) + (w.balance || 0);
    return acc;
  }, {});

  const assetCount = Object.keys(nativeBreakdown).filter(k => nativeBreakdown[k] > 0).length;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Portfolio Benchmarking</h1>
        <p className="text-sm text-muted-foreground">Compare your returns against top benchmarks</p>
      </div>

      <div className="p-5 rounded-xl border border-yellow-500/30 bg-yellow-500/5 space-y-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-yellow-400" />
          <p className="text-sm font-semibold text-yellow-400">Benchmark data not available</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Comparing your portfolio return against BTC, ETH, and the S&P 500 requires a
          historical price feed. The previous version generated this data synthetically
          using a Math.sin seeded random walk — the "Your Portfolio" line and all benchmark
          lines were invented numbers, not derived from your transaction history or any
          real price source.
        </p>
        <p className="text-xs text-muted-foreground">
          A real implementation will integrate a historical price API and derive your
          portfolio return from actual transaction cost-basis. This is audited before release.
        </p>
      </div>

      <div className="p-4 rounded-xl border border-border bg-card space-y-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Current Holdings ({assetCount} asset{assetCount !== 1 ? "s" : ""})</p>
        </div>
        {Object.keys(nativeBreakdown).length === 0
          ? <p className="text-sm text-muted-foreground">No wallets yet</p>
          : Object.entries(nativeBreakdown).map(([cur, bal]) => (
            <div key={cur} className="flex justify-between text-sm">
              <span className="font-mono text-muted-foreground">{cur}</span>
              <span className="font-semibold">{bal.toFixed(6)}</span>
            </div>
          ))}
        <p className="text-[10px] text-muted-foreground pt-1">Native balances — no stale USD conversion</p>
      </div>
    </div>
  );
}
