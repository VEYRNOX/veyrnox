import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Info } from "lucide-react";

// Realistic correlation coefficients between major crypto assets
const CORRELATIONS = {
  BTC:  { BTC: 1.00, ETH: 0.82, SOL: 0.74, USDC: -0.05, USDT: -0.04, BNB: 0.71, ADA: 0.68 },
  ETH:  { BTC: 0.82, ETH: 1.00, SOL: 0.79, USDC: -0.06, USDT: -0.05, BNB: 0.75, ADA: 0.72 },
  SOL:  { BTC: 0.74, ETH: 0.79, SOL: 1.00, USDC: -0.07, USDT: -0.06, BNB: 0.70, ADA: 0.66 },
  USDC: { BTC: -0.05, ETH: -0.06, SOL: -0.07, USDC: 1.00, USDT: 0.98, BNB: -0.04, ADA: -0.05 },
  USDT: { BTC: -0.04, ETH: -0.05, SOL: -0.06, USDC: 0.98, USDT: 1.00, BNB: -0.03, ADA: -0.04 },
  BNB:  { BTC: 0.71, ETH: 0.75, SOL: 0.70, USDC: -0.04, USDT: -0.03, BNB: 1.00, ADA: 0.65 },
  ADA:  { BTC: 0.68, ETH: 0.72, SOL: 0.66, USDC: -0.05, USDT: -0.04, BNB: 0.65, ADA: 1.00 },
};

const ALL_ASSETS = ["BTC", "ETH", "SOL", "USDC", "USDT", "BNB", "ADA"];

function getColor(value) {
  if (value === 1) return "bg-primary/80 text-white";
  if (value >= 0.7) return "bg-red-500/70 text-white";
  if (value >= 0.4) return "bg-orange-500/60 text-white";
  if (value >= 0.1) return "bg-yellow-500/50 text-foreground";
  if (value >= -0.1) return "bg-secondary text-muted-foreground";
  return "bg-green-500/50 text-white";
}

function getLabel(value) {
  if (value === 1) return "Perfect";
  if (value >= 0.7) return "Strong +";
  if (value >= 0.4) return "Moderate +";
  if (value >= 0.1) return "Weak +";
  if (value >= -0.1) return "None";
  return "Negative";
}

export default function CorrelationMatrix() {
  const [hovered, setHovered] = useState(null);
  const { data: wallets = [] } = useQuery({ queryKey: ["wallets"], queryFn: () => base44.entities.Wallet.list() });

  const myAssets = [...new Set(wallets.map(w => w.currency).filter(c => ALL_ASSETS.includes(c)))];
  const assets = myAssets.length >= 2 ? myAssets : ALL_ASSETS;

  const hoveredVal = hovered ? CORRELATIONS[hovered[0]]?.[hovered[1]] : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Correlation Matrix</h1>
        <p className="text-sm text-muted-foreground">See how your assets move together — lower correlation means better diversification</p>
      </div>

      <div className="p-4 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 mb-4">
          <Info className="h-4 w-4 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Correlation ranges from -1 (opposite) to +1 (identical). Aim for assets with correlation below 0.5.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="p-2 text-left text-muted-foreground font-normal w-12"></th>
                {assets.map(a => <th key={a} className="p-2 text-center font-semibold w-14">{a}</th>)}
              </tr>
            </thead>
            <tbody>
              {assets.map(row => (
                <tr key={row}>
                  <td className="p-2 font-semibold pr-3 text-right">{row}</td>
                  {assets.map(col => {
                    const val = CORRELATIONS[row]?.[col] ?? 0;
                    const isHovered = hovered?.[0] === row && hovered?.[1] === col;
                    return (
                      <td key={col} className="p-1">
                        <div
                          onMouseEnter={() => setHovered([row, col])}
                          onMouseLeave={() => setHovered(null)}
                          className={`h-10 w-full rounded-lg flex items-center justify-center font-bold cursor-default transition-all ${getColor(val)} ${isHovered ? "ring-2 ring-ring scale-110" : ""}`}
                        >
                          {val.toFixed(2)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {hoveredVal !== null && (
        <div className="p-4 rounded-xl border border-border bg-card text-sm">
          <span className="font-semibold">{hovered[0]} ↔ {hovered[1]}: </span>
          <span className="text-muted-foreground">Correlation = {hoveredVal.toFixed(2)} — <span className="font-medium text-foreground">{getLabel(hoveredVal)}</span></span>
        </div>
      )}

      {/* Legend */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <p className="text-xs font-semibold mb-3">Legend</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Strong Positive (0.7–1.0)", cls: "bg-red-500/70 text-white" },
            { label: "Moderate (0.4–0.7)", cls: "bg-orange-500/60 text-white" },
            { label: "Weak (0.1–0.4)", cls: "bg-yellow-500/50 text-foreground" },
            { label: "Neutral (≈0)", cls: "bg-secondary text-muted-foreground" },
            { label: "Negative (< 0)", cls: "bg-green-500/50 text-white" },
          ].map(l => (
            <div key={l.label} className={`text-[10px] px-2 py-1 rounded-md font-medium ${l.cls}`}>{l.label}</div>
          ))}
        </div>
      </div>

      <div className="p-3 rounded-xl bg-secondary/50 border border-border">
        <p className="text-xs text-muted-foreground">💡 Tip: Adding stablecoins (USDC, USDT) to your portfolio significantly reduces overall correlation and acts as a hedge during market downturns.</p>
      </div>
    </div>
  );
}