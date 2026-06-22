import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ShieldCheck, Activity, Zap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadialBarChart, RadialBar, ResponsiveContainer } from "recharts";
import { toast } from "sonner";

const RISK_LEVELS = [
  { min: 0, max: 30, label: "Low Risk", color: "hsl(var(--success))", desc: "Well-diversified, stable portfolio" },
  { min: 30, max: 60, label: "Medium Risk", color: "hsl(var(--caution))", desc: "Some concentration, moderate volatility" },
  { min: 60, max: 80, label: "High Risk", color: "hsl(var(--caution))", desc: "Significant concentration or volatile assets" },
  { min: 80, max: 101, label: "Critical Risk", color: "hsl(var(--destructive))", desc: "Highly concentrated, extreme volatility" },
];

const HEDGING = [
  { id: 1, title: "Add Stablecoins", desc: "Allocate 20%+ to USDC/USDT to reduce volatility", impact: "Reduces risk ~15 pts" },
  { id: 2, title: "Diversify Chains", desc: "Spread assets across Ethereum, Solana, and Polygon", impact: "Reduces risk ~8 pts" },
  { id: 3, title: "Enable Stop-Loss Bots", desc: "Configure auto-sell at -10% to cap downside", impact: "Reduces risk ~12 pts" },
  { id: 4, title: "DeFi Yield Farming", desc: "Convert idle assets to yield-bearing positions", impact: "Increases returns ~4%" },
  { id: 5, title: "Purchase Options Hedge", desc: "Buy put options to protect against large drops", impact: "Caps max loss at 20%" },
];

function getRiskLevel(score) {
  return RISK_LEVELS.find(r => score >= r.min && score < r.max) || RISK_LEVELS[3];
}

export default function RiskScoring() {
  const [analyzing, setAnalyzing] = useState(false);
  const [score, setScore] = useState(null);

  const { data: wallets = [] } = useQuery({ queryKey: ["wallets-risk"], queryFn: () => base44.entities.Wallet.list() });
  const { data: positions = [] } = useQuery({ queryKey: ["lending-risk"], queryFn: () => base44.entities.LendingPosition.filter({ status: "active" }) });

  const analyze = async () => {
    setAnalyzing(true);
    await new Promise(r => setTimeout(r, 2000));
    const totalBal = wallets.reduce((a, w) => a + (w.balance || 0), 0);
    const maxBal = wallets.reduce((a, w) => Math.max(a, w.balance || 0), 0);
    const concentration = totalBal > 0 ? (maxBal / totalBal) * 100 : 50;
    const leverage = positions.filter(p => p.type === "borrow").length * 15;
    const volatileAssets = wallets.filter(w => ["BTC","ETH","SOL"].includes(w.currency)).length;
    const raw = Math.min(100, concentration * 0.5 + leverage + volatileAssets * 5 + 20);
    setScore(Math.round(raw));
    setAnalyzing(false);
    toast.success("Risk analysis complete");
  };

  const riskLevel = score !== null ? getRiskLevel(score) : null;

  const METRICS = [
    { label: "Concentration Risk", value: score !== null ? Math.min(100, score + 5) : "—", unit: "/100", color: "text-caution" },
    { label: "Leverage Risk", value: score !== null ? positions.filter(p => p.type === "borrow").length * 15 : "—", unit: "%", color: "text-caution" },
    { label: "Volatility Index", value: score !== null ? Math.round(score * 0.8) : "—", unit: "/100", color: "text-destructive" },
    // Deniability (CLAUDE.md "never show wallet count/list"): this tile must not
    // publish wallets.length. Diversification is now a score-derived /100 reading
    // (higher = better spread, inverse of the concentration-weighted risk score),
    // gated on an analysis run like the other metrics — no wallet cardinality.
    { label: "Diversification", value: score !== null ? Math.max(0, 100 - score) : "—", unit: "/100", color: "text-success" },
  ];

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /> Risk Scoring</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Portfolio insurance and real-time risk analysis</p>
        </div>
        <Button onClick={analyze} disabled={analyzing}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${analyzing ? "animate-spin" : ""}`} />
          {analyzing ? "Analysing..." : "Analyse Now"}
        </Button>
      </div>

      <div className="p-6 rounded-2xl border border-border bg-card text-center">
        {score !== null ? (
          <>
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart cx="50%" cy="80%" innerRadius="60%" outerRadius="100%" startAngle={180} endAngle={0} data={[{ value: score, fill: riskLevel.color }]}>
                  <RadialBar dataKey="value" cornerRadius={8} />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-5xl font-black mt-[-20px]" style={{ color: riskLevel.color }}>{score}</p>
            <p className="text-sm font-bold mt-1" style={{ color: riskLevel.color }}>{riskLevel.label}</p>
            <p className="text-xs text-muted-foreground mt-1">{riskLevel.desc}</p>
          </>
        ) : (
          <div className="py-8">
            <Activity className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">Run an analysis to see your portfolio risk score</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {METRICS.map(m => (
          <div key={m.label} className="p-3 rounded-xl border border-border bg-card">
            <p className={`text-xl font-bold ${m.color}`}>{m.value}{typeof m.value === "number" ? m.unit : ""}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{m.label}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="text-sm font-semibold mb-3">Hedging and Protection Strategies</p>
        <div className="space-y-2">
          {HEDGING.map(h => (
            <div key={h.id} className="p-3 rounded-xl border border-border bg-card flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Zap className="h-3 w-3 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{h.title}</p>
                <p className="text-xs text-muted-foreground">{h.desc}</p>
              </div>
              <span className="text-[10px] bg-success/10 text-success px-2 py-0.5 rounded-full shrink-0">{h.impact}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}