import { useWallet } from "@/lib/WalletProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { Zap } from "lucide-react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from "@/lib/recharts";

const VOLATILITY = { BTC: 0.65, ETH: 0.75, SOL: 0.85, USDC: 0.01, USDT: 0.01 };

function getRiskLabel(score) {
  if (score <= 3) return { label: "Low Risk", color: "text-success", bg: "bg-success" };
  if (score <= 6) return { label: "Medium Risk", color: "text-caution", bg: "bg-caution" };
  if (score <= 8) return { label: "High Risk", color: "text-caution", bg: "bg-caution" };
  return { label: "Very High Risk", color: "text-destructive", bg: "bg-destructive" };
}

export default function PortfolioRiskScore() {
  const { isUnlocked } = useWallet();
  const { portfolio } = useAnalytics();

  const assetTotals = portfolio?.assetTotals ?? {};
  const totalUSD = portfolio?.grandTotal ?? 0;
  const assetValues = Object.fromEntries(
    Object.entries(assetTotals).map(([sym, v]) => [sym, v?.usd ?? 0])
  );

  // Concentration (Herfindahl index)
  const shares = Object.values(assetValues).map(v => totalUSD > 0 ? v / totalUSD : 0);
  const hhi = shares.reduce((s, p) => s + p * p, 0);
  const concentrationScore = parseFloat(Math.min(10, hhi * 10).toFixed(1));

  // Volatility (weighted avg using reference table)
  const weightedVol = Object.entries(assetValues).reduce(
    (s, [cur, val]) => s + (val / (totalUSD || 1)) * (VOLATILITY[cur] || 0.5), 0
  );
  const volatilityScore = parseFloat(Math.min(10, weightedVol * 10).toFixed(1));

  // Diversification (inverse of asset count)
  const numAssets = Object.keys(assetValues).filter(k => (assetValues[k] ?? 0) > 0).length;
  const diversificationScore = parseFloat(Math.max(0, 10 - numAssets * 2).toFixed(1));

  const overallScore = parseFloat(((concentrationScore + volatilityScore + diversificationScore) / 3).toFixed(1));
  const risk = getRiskLabel(overallScore);

  const radarData = [
    { subject: "Concentration", score: concentrationScore },
    { subject: "Volatility", score: volatilityScore },
    { subject: "Diversification", score: diversificationScore },
  ];

  const recs = [];
  if (concentrationScore > 6) recs.push("Diversify — a single asset dominates your portfolio.");
  if (volatilityScore > 7) recs.push("Consider adding stablecoins to reduce volatility exposure.");
  if (diversificationScore > 5) recs.push("Hold more than 3 different assets to spread risk.");
  if (recs.length === 0) recs.push("Your portfolio risk profile looks healthy. Keep it up!");

  if (!isUnlocked) {
    return (
      <div className="max-w-2xl mx-auto pt-10 text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Portfolio Risk Score</h1>
        <p className="text-sm text-muted-foreground">Unlock your wallet to see your risk score.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Portfolio Risk Score</h1>
        <p className="text-sm text-muted-foreground">Real-time risk assessment based on your holdings</p>
      </div>

      {/* Score card */}
      <div className="p-6 rounded-xl border border-border bg-card text-center">
        <p className="text-xs text-muted-foreground mb-2">Overall Risk Score</p>
        <p className={`text-6xl font-black ${risk.color}`}>{overallScore}</p>
        <p className="text-sm text-muted-foreground mt-1">out of 10</p>
        <div className="w-full bg-secondary rounded-full h-3 mt-4">
          <div className={`h-3 rounded-full transition-all ${risk.bg}`} style={{ width: `${overallScore * 10}%` }} />
        </div>
        <p className={`mt-3 font-semibold ${risk.color}`}>{risk.label}</p>
      </div>

      {/* Radar */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <p className="text-sm font-semibold mb-4">Risk Breakdown</p>
        <ResponsiveContainer width="100%" height={250}>
          <RadarChart data={radarData}>
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
            <Radar dataKey="score" stroke="#f97316" fill="#f97316" fillOpacity={0.25} />
            <Tooltip />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Factor cards */}
      <div className="grid grid-cols-2 gap-3">
        {radarData.map(d => {
          const r = getRiskLabel(d.score);
          return (
            <div key={d.subject} className="p-3 rounded-xl border border-border bg-card">
              <p className="text-xs text-muted-foreground">{d.subject}</p>
              <p className={`text-xl font-bold mt-0.5 ${r.color}`}>{d.score.toFixed(1)}</p>
              <p className={`text-[10px] font-medium mt-0.5 ${r.color}`}>{r.label}</p>
            </div>
          );
        })}
      </div>

      {/* Recommendations */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-2">
        <p className="text-sm font-semibold flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Recommendations</p>
        {recs.map((r, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="text-primary mt-0.5">→</span><span>{r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
