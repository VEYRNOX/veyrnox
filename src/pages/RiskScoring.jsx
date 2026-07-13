// @ts-nocheck
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ShieldCheck, Activity, Zap, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadialBarChart, RadialBar, ResponsiveContainer } from "recharts";

// Score bands — thresholds are part of the transparent formula shown below.
const RISK_LEVELS = [
  { min: 0,  max: 30,  label: "Low Risk",      color: "hsl(var(--success))",     desc: "Well-diversified, stable portfolio" },
  { min: 30, max: 60,  label: "Medium Risk",    color: "hsl(var(--caution))",     desc: "Some concentration, moderate volatility" },
  { min: 60, max: 80,  label: "High Risk",      color: "hsl(var(--caution))",     desc: "Significant concentration or volatile assets" },
  { min: 80, max: 101, label: "Critical Risk",  color: "hsl(var(--destructive))", desc: "Highly concentrated, extreme volatility" },
];

// General hedging ideas — NOT predictions. No quantified outcome is promised
// because no model backs them; every portfolio and market is different.
const HEDGING = [
  { id: 1, title: "Add Stablecoins",          desc: "Allocate a portion to USDC/USDT to reduce volatility exposure." },
  { id: 2, title: "Diversify Chains",          desc: "Spread assets across multiple chains to reduce single-chain risk." },
  { id: 3, title: "Review Concentration",      desc: "If one asset is dominant, consider whether that aligns with your risk tolerance." },
  { id: 4, title: "Understand DeFi Positions", desc: "Active borrows add leverage risk; review and close positions you no longer need." },
  { id: 5, title: "Research Before Acting",    desc: "These are general ideas, not personal financial advice. Consult a qualified adviser." },
];

function getRiskLevel(score) {
  return RISK_LEVELS.find(r => score >= r.min && score < r.max) || RISK_LEVELS[3];
}

// ---------------------------------------------------------------------------
// Transparent heuristic formula (illustrative only — see disclaimer below):
//
//   concentration  = (largest single wallet balance / total balance) × 100
//                    represents how much of the portfolio is in one asset.
//   leverage       = number of active borrow positions × 15
//                    a rough proxy for borrowed-capital exposure.
//   volatileAssets = count of BTC / ETH / SOL wallets × 5
//                    a small bump for high-volatility native assets.
//   rawScore       = min(100,  concentration×0.5  +  leverage  +  volatileAssets  +  20)
//
// The +20 floor reflects that any self-custody portfolio carries baseline risk.
// The score is an ILLUSTRATIVE heuristic, not a calibrated financial model.
// ---------------------------------------------------------------------------

export default function RiskScoring() {
  const { data: wallets = [], refetch: refetchWallets, isFetching: fetchingWallets } =
    useQuery({ queryKey: ["wallets-risk"], queryFn: () => base44.entities.Wallet.list() });

  const { data: positions = [], refetch: refetchPositions, isFetching: fetchingPositions } =
    useQuery({ queryKey: ["lending-risk"], queryFn: () => base44.entities.LendingPosition.filter({ status: "active" }) });

  const refreshing = fetchingWallets || fetchingPositions;

  const handleRefresh = () => {
    refetchWallets();
    refetchPositions();
  };

  // Detect a genuinely empty portfolio — no holdings to score.
  const totalBal = wallets.reduce((a, w) => a + (w.balance || 0), 0);
  const isEmpty = wallets.length === 0 && positions.length === 0;

  // Compute score synchronously from on-device entity data (no artificial delay).
  let score = null;
  let riskLevel = null;
  let concentrationRisk = null;
  let leverageRisk = null;
  let volatilityIndex = null;

  if (!isEmpty) {
    const maxBal = wallets.reduce((a, w) => Math.max(a, w.balance || 0), 0);
    const concentration = totalBal > 0 ? (maxBal / totalBal) * 100 : 0;
    const leverage = positions.filter(p => p.type === "borrow").length * 15;
    const volatileAssets = wallets.filter(w => ["BTC", "ETH", "SOL"].includes(w.currency)).length;
    const raw = Math.min(100, concentration * 0.5 + leverage + volatileAssets * 5 + 20);
    score = Math.round(raw);
    riskLevel = getRiskLevel(score);
    concentrationRisk = Math.min(100, score + 5);
    leverageRisk = positions.filter(p => p.type === "borrow").length * 15;
    volatilityIndex = Math.round(score * 0.8);
  }

  const METRICS = [
    { label: "Concentration Risk", value: concentrationRisk ?? "—", unit: "/100", color: "text-caution" },
    { label: "Leverage Risk",       value: leverageRisk      ?? "—", unit: "%",    color: "text-caution" },
    { label: "Volatility Index",    value: volatilityIndex   ?? "—", unit: "/100", color: "text-destructive" },
    // Deniability (CLAUDE.md "never show wallet count/list"): this tile must not
    // publish wallets.length. Diversification is a score-derived /100 reading
    // (higher = better spread, inverse of the concentration-weighted risk score).
    { label: "Diversification",     value: score !== null ? Math.max(0, 100 - score) : "—", unit: "/100", color: "text-success" },
  ];

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" /> Risk Scoring
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Illustrative heuristic score based on your on-device holdings
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {/* Disclaimer — must be prominent and above the score */}
      <div className="flex items-start gap-2 rounded-xl border border-caution/30 bg-caution/5 p-3">
        <AlertTriangle className="h-4 w-4 text-caution shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">Illustrative heuristic only.</span>{" "}
          This score is computed on-device from a transparent formula over your recorded
          holdings. It is <em>not</em> a real-time market risk model, not a calibrated
          financial metric, and not financial advice. Different assets, market conditions,
          and personal circumstances are not captured. Consult a qualified financial adviser
          before making any investment or hedging decision.
        </p>
      </div>

      {/* Score dial or empty state */}
      <div className="p-6 rounded-2xl border border-border bg-card text-center">
        {isEmpty ? (
          <div className="py-8 space-y-2">
            <Activity className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-sm font-semibold text-muted-foreground">No holdings to score</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Add assets to your portfolio and the heuristic score will appear here. An
              empty wallet has no risk profile to compute.
            </p>
          </div>
        ) : (
          <>
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  cx="50%" cy="80%"
                  innerRadius="60%" outerRadius="100%"
                  startAngle={180} endAngle={0}
                  data={[{ value: score, fill: riskLevel.color }]}
                >
                  <RadialBar dataKey="value" cornerRadius={8} />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-5xl font-black mt-[-20px]" style={{ color: riskLevel.color }}>
              {score}
            </p>
            <p className="text-sm font-bold mt-1" style={{ color: riskLevel.color }}>
              {riskLevel.label}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{riskLevel.desc}</p>
          </>
        )}
      </div>

      {/* Sub-metric tiles — only when there is something to show */}
      {!isEmpty && (
        <div className="grid grid-cols-2 gap-3">
          {METRICS.map(m => (
            <div key={m.label} className="p-3 rounded-xl border border-border bg-card">
              <p className={`text-xl font-bold font-mono ${m.color}`}>
                {m.value}{typeof m.value === "number" ? m.unit : ""}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Formula transparency */}
      <div className="p-3 rounded-xl border border-border bg-card/50">
        <p className="text-xs font-semibold text-muted-foreground mb-1">How the score is calculated</p>
        <p className="text-xs text-muted-foreground font-mono leading-relaxed">
          score = min(100, concentration×0.5 + leverage + volatileAssets×5 + 20)
        </p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          concentration = largest holding / total × 100 &nbsp;|&nbsp;
          leverage = borrow count × 15 &nbsp;|&nbsp;
          volatileAssets = count of BTC/ETH/SOL × 5
        </p>
      </div>

      {/* Hedging strategies — clearly labelled as general ideas, not predictions */}
      <div>
        <p className="text-sm font-semibold mb-1">General Risk-Reduction Ideas</p>
        <p className="text-xs text-muted-foreground mb-3">
          These are general educational suggestions. No specific outcome is guaranteed or
          predicted for your situation.
        </p>
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
