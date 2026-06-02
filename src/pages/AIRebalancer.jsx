import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44, LLM_AVAILABLE } from "@/api/base44Client";
import { Sparkles, TrendingUp, Shield, Zap, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import LocalBuildNotice from "@/components/LocalBuildNotice";

const USD_RATES = { BTC: 68000, ETH: 3200, USDT: 1, BNB: 590, SOL: 165, USDC: 1, XRP: 0.52, DOGE: 0.16, ADA: 0.45, TRX: 0.13 };

const STRATEGIES = [
  { id: "aggressive", label: "Aggressive Growth", desc: "Max exposure to high-beta assets", icon: "🚀", risk: 9 },
  { id: "balanced", label: "Balanced", desc: "Mix of growth and stability", icon: "⚖️", risk: 5 },
  { id: "conservative", label: "Conservative", desc: "Favour stablecoins and BTC", icon: "🛡️", risk: 2 },
  { id: "dca_optimised", label: "DCA Optimised", desc: "Accumulate during dips automatically", icon: "📉", risk: 4 },
];

export default function AIRebalancer() {
  const [strategy, setStrategy] = useState("balanced");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const { data: wallets = [] } = useQuery({ queryKey: ["wallets"], queryFn: () => base44.entities.Wallet.list() });
  const totalUSD = wallets.reduce((s, w) => s + (w.balance || 0) * (USD_RATES[w.currency] || 1), 0);

  const analyse = async () => {
    if (!LLM_AVAILABLE) return; // needs an LLM endpoint, not shipped in local build
    setLoading(true); setResult(null);
    const holdings = wallets.map(w => `${w.currency}: ${((w.balance || 0) * (USD_RATES[w.currency] || 1) / (totalUSD || 1) * 100).toFixed(1)}%`).join(", ");
    const selectedStrategy = STRATEGIES.find(s => s.id === strategy);
    const prompt = `You are an expert crypto portfolio manager. Analyse this portfolio: ${holdings || "BTC: 50%, ETH: 30%, SOL: 20%"}. Strategy: ${selectedStrategy?.label}. Total value: $${totalUSD.toFixed(0)}. Provide: 1) AI analysis of current allocation (2 sentences), 2) Recommended allocation (JSON object with assets and percentages summing to 100), 3) 3 specific rebalancing actions, 4) Risk assessment (1 sentence). Keep it concise and actionable.`;
    const resp = await base44.integrations.Core.InvokeLLM({ prompt, response_json_schema: { type: "object", properties: { analysis: { type: "string" }, recommended: { type: "object" }, actions: { type: "array", items: { type: "string" } }, risk: { type: "string" } } } });
    setResult(resp);
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div><h1 className="text-xl font-bold">AI Smart Rebalancer</h1><p className="text-sm text-muted-foreground">LLM-powered portfolio analysis and rebalancing recommendations</p></div>

      {/* Strategy selector */}
      <div className="grid grid-cols-2 gap-3">
        {STRATEGIES.map(s => (
          <button key={s.id} onClick={() => setStrategy(s.id)}
            className={`p-4 rounded-xl border text-left transition-all ${strategy === s.id ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-secondary/50"}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">{s.icon}</span>
              <p className="text-sm font-semibold">{s.label}</p>
            </div>
            <p className="text-xs text-muted-foreground">{s.desc}</p>
            <div className="mt-2 flex gap-0.5">
              {Array.from({ length: 10 }, (_, i) => <div key={i} className={`h-1.5 flex-1 rounded-full ${i < s.risk ? "bg-primary" : "bg-secondary"}`} />)}
            </div>
          </button>
        ))}
      </div>

      {/* Current portfolio */}
      {wallets.length > 0 && (
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Current Portfolio</p>
          <div className="space-y-1.5">
            {wallets.map(w => {
              const pct = totalUSD > 0 ? (w.balance || 0) * (USD_RATES[w.currency] || 1) / totalUSD * 100 : 0;
              return (
                <div key={w.id} className="flex items-center gap-2 text-xs">
                  <span className="w-10 font-semibold">{w.currency}</span>
                  <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-10 text-right text-muted-foreground">{pct.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!LLM_AVAILABLE && (
        <LocalBuildNotice
          feature="AI rebalancing analysis"
          detail="It needs a connection to an LLM service, which this offline-first build doesn't include. Your current portfolio above is still local and accurate."
        />
      )}

      <Button className="w-full gap-2" onClick={analyse} disabled={loading || !LLM_AVAILABLE}>
        <Sparkles className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} />
        {loading ? "AI is analysing your portfolio..." : LLM_AVAILABLE ? "Run AI Analysis" : "AI Analysis unavailable in local build"}
      </Button>

      {result && (
        <div className="space-y-4">
          {result.analysis && (
            <div className="p-4 rounded-xl border border-primary/20 bg-primary/5">
              <p className="text-xs font-semibold text-primary mb-2 flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> AI Analysis</p>
              <p className="text-sm text-muted-foreground">{result.analysis}</p>
            </div>
          )}

          {result.recommended && (
            <div className="p-4 rounded-xl border border-border bg-card">
              <p className="text-xs font-semibold mb-3 flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-green-500" /> Recommended Allocation</p>
              <div className="space-y-1.5">
                {Object.entries(result.recommended).map(([asset, pct]) => (
                  <div key={asset} className="flex items-center gap-2 text-xs">
                    <span className="w-12 font-semibold">{asset}</span>
                    <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-10 text-right font-semibold">{pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.actions?.length > 0 && (
            <div className="p-4 rounded-xl border border-border bg-card space-y-2">
              <p className="text-xs font-semibold flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-yellow-500" /> Recommended Actions</p>
              {result.actions.map((a, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                  <p className="text-muted-foreground">{a}</p>
                </div>
              ))}
            </div>
          )}

          {result.risk && (
            <div className="p-4 rounded-xl border border-border bg-card flex items-start gap-3">
              <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">{result.risk}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}