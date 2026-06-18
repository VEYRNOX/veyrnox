import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Clock, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function PortfolioRewind() {
  const navigate = useNavigate();
  const { data: wallets = [] } = useQuery({ queryKey: ["wallets"], queryFn: () => base44.entities.Wallet.list() });

  const nativeBreakdown = wallets.reduce((acc, w) => {
    acc[w.currency] = (acc[w.currency] || 0) + (w.balance || 0);
    return acc;
  }, {});

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Portfolio Rewind</h1>
        <p className="text-sm text-muted-foreground">Compare your portfolio across points in time</p>
      </div>

      <div className="p-5 rounded-xl border border-yellow-500/30 bg-yellow-500/5 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-yellow-400" />
          <p className="text-sm font-semibold text-yellow-400">Historical price data not available</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Portfolio Rewind requires a historical price feed to calculate what your holdings were worth
          at a past date. The previous version fabricated this data using hardcoded price multipliers
          (e.g. "BTC was 0.85× its current price 30 days ago") — those numbers were invented, not real.
        </p>
        <p className="text-xs text-muted-foreground">
          A real implementation would require an authenticated historical price API.
          That integration is on the roadmap and will be audited before release.
        </p>
      </div>

      <div className="p-4 rounded-xl border border-border bg-card space-y-2">
        <p className="text-sm font-semibold">Current Native Holdings</p>
        <p className="text-xs text-muted-foreground">Use Portfolio Snapshots to save and compare holdings over time.</p>
        {Object.keys(nativeBreakdown).length === 0
          ? <p className="text-sm text-muted-foreground">No wallets yet</p>
          : Object.entries(nativeBreakdown).map(([cur, bal]) => (
            <div key={cur} className="flex justify-between text-sm">
              <span className="font-mono text-muted-foreground">{cur}</span>
              <span className="font-semibold">{bal.toFixed(6)}</span>
            </div>
          ))}
      </div>

      <Button variant="outline" className="w-full gap-2" onClick={() => navigate("/snapshots")}>
        <Camera className="h-4 w-4" /> Go to Portfolio Snapshots
      </Button>
    </div>
  );
}
