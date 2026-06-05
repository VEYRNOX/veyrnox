import { USD_RATES } from "@/lib/cryptos";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Zap } from "lucide-react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from "recharts";

const VOLATILITY = { BTC: 0.65, ETH: 0.75, SOL: 0.85, USDC: 0.01, USDT: 0.01 };

function getRiskLabel(score) {
  if (score <= 3) return { label: "Low Risk", color: "text-green-500", bg: "bg-green-500" };
  if (score <= 6) return { label: "Medium Risk", color: "text-yellow-500", bg: "bg-yellow-500" };
  if (score <= 8) return { label: "High Risk", color: "text-orange-500", bg: "bg-orange-500" };
  return { label: "Very High Risk", color: "text-destructive", bg: "bg-destructive" };
}

export default function PortfolioRiskScore() {
  const { data: wallets = [] } = useQuery({ queryKey: ["wallets"], queryFn: () => base44.entities.Wallet.list() });
  const { data: staking = [] } = useQuery({ queryKey: ["staking"], queryFn: () => base44.entities.StakingPosition.filter({ status: "active" }) });
  const { data: loans = [] } = useQuery({ queryKey: ["loans"], queryFn: () => base44.entities.CryptoLoan.filter({ status: "active" }) });

  const totalUSD = wallets.reduce((s, w) => s + (w.balance || 0) * (USD_RATES[w.currency] || 1), 0);
  const assetValues = wallets.reduce((acc, w) => { const v = (w.balance || 0) * (USD_RATES[w.currency] || 1); acc[w.currency] = (acc[w.currency] || 0) + v; return acc; }, {});

  // Concentration risk (Herfindahl index)
  const shares = Object.values(assetValues).map(v => totalUSD > 0 ? v / totalUSD : 0);
  const hhi = shares.reduce((s, p) => s + p * p, 0);
  const concentrationScore = Math.min(10, hhi * 10);

  // Volatility risk
  const weightedVol = Object.entries(assetValues).reduce((s, [cur, val]) => s + (val / (totalUSD || 1)) * (VOLATILITY[cur] || 0.5), 0);
  const volatilityScore = Math.min(10, weightedVol * 10);

  // Leverage risk
  const loanExposure = loans.reduce((s, l) => s + (l.borrow_amount || 0), 0);
  const leverageScore = Math.min(10, (loanExposure / (totalUSD || 1)) * 20);

  // Staking lock risk
  const stakedUSD = staking.reduce((s, p) => s + (p.amount || 0) * (USD_RATES[p.asset] || 1), 0);
  const liquidityScore = Math.min(10, (stakedUSD / (totalUSD || 1)) * 10);

  // Diversification score (inverse)
  const numAssets = Object.keys(assetValues).length;
  const diversificationScore = Math.max(0, 10 - numAssets * 2);

  const overallScore = parseFloat(((concentrationScore + volatilityScore + leverageScore + liquidityScore + diversificationScore) / 5).toFixed(1));
  const risk = getRiskLabel(overallScore);

  const radarData = [
    { subject: "Concentration", score: concentrationScore },
    { subject: "Volatility", score: volatilityScore },
    { subject: "Leverage", score: leverageScore },
    { subject: "Liquidity", score: liquidityScore },
    { subject: "Diversification", score: diversificationScore },
  ];

  const recs = [];
  if (concentrationScore > 6) recs.push("Diversify — a single asset dominates your portfolio.");
  if (volatilityScore > 7) recs.push("Consider adding stablecoins to reduce volatility exposure.");
  if (leverageScore > 4) recs.push("High loan-to-portfolio ratio. Consider repaying loans.");
  if (liquidityScore > 5) recs.push("Large portion of assets are locked in staking — ensure you have liquid funds.");
  if (diversificationScore > 5) recs.push("Hold more than 3 different assets to spread risk.");
  if (recs.length === 0) recs.push("Your portfolio risk profile looks healthy. Keep it up!");

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