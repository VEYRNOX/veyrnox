import { useNavigate } from "react-router-dom";
import { Shield, TrendingUp, Layers, ChevronRight } from "lucide-react";
import IncompleteBalanceNote from "@/components/IncompleteBalanceNote";
import { calculatePortfolioHealth } from "@/lib/portfolioHealthCalc";

function ScoreRing({ score }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const progress = (score / 100) * circ;
  const color = score >= 75 ? "hsl(var(--success))" : score >= 50 ? "hsl(var(--caution))" : "hsl(var(--destructive))";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-secondary" />
        <circle
          cx="40" cy="40" r={r} fill="none"
          stroke={color} strokeWidth="6"
          strokeDasharray={`${progress} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-xl font-bold leading-none" style={{ color }}>{score}</p>
        <p className="text-[9px] text-muted-foreground">/100</p>
      </div>
    </div>
  );
}

export default function PortfolioHealthScore({
  wallets = [],
  portfolio = null,
  isVaultKekEnrolled = false,
  hasPasskeyOrBiometric = false,
  isDeniability = false,
}) {
  const navigate = useNavigate();

  const health = calculatePortfolioHealth({
    wallets,
    portfolio,
    kekEnrolled: isVaultKekEnrolled,
    passkey: hasPasskeyOrBiometric,
    isDeniability,
  });

  // I3 + I4 fail-closed: suppress score display if indeterminate or deniability
  if (health.isDeniability) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">Portfolio health unavailable in this session</p>
      </div>
    );
  }

  if (health.isIncomplete) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <IncompleteBalanceNote />
      </div>
    );
  }

  // Map factor objects to display format (add max from calculation)
  const factorMaxes = { security: 40, diversification: 35, growth: 25 };
  const factorIcons = { security: Shield, diversification: Layers, growth: TrendingUp };
  const factorActions = { security: "/security", diversification: "/", growth: "/analytics" };

  const displayFactors = health.factors.map((f) => ({
    ...f,
    max: factorMaxes[f.key] || f.max,
    icon: factorIcons[f.key],
    action: factorActions[f.key],
  }));

  const labelColor = health.total >= 75 ? "text-success" : health.total >= 50 ? "text-caution" : "text-destructive";

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Portfolio Health</p>
          <p className={`text-sm font-bold mt-0.5 ${labelColor}`}>{health.label}</p>
        </div>
        <ScoreRing score={health.total} />
      </div>

      <div className="space-y-2">
        {displayFactors.map((f) => {
          const Icon = f.icon;
          const pct = (f.score / f.max) * 100;
          return (
            <button
              key={f.key}
              onClick={() => navigate(f.action)}
              className="w-full flex items-center gap-2.5 group hover:bg-secondary rounded-lg px-2 py-1.5 transition-colors"
            >
              <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between mb-0.5">
                  <span className="text-[11px] text-muted-foreground">{f.label}</span>
                  <span className="text-[11px] text-muted-foreground">{f.score}/{f.max}</span>
                </div>
                <div className="h-1 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${pct}%`,
                      background:
                        pct === 100
                          ? "hsl(var(--success))"
                          : pct > 0
                            ? "hsl(var(--caution))"
                            : "hsl(var(--destructive) / 0.25)",
                    }}
                  />
                </div>
              </div>
              <ChevronRight className="h-3 w-3 text-muted-foreground/50 group-hover:text-muted-foreground" />
            </button>
          );
        })}
      </div>
    </div>
  );
}