import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { TrendingDown, DollarSign, Leaf, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

const USD_RATES = { BTC: 68000, ETH: 3200, USDT: 1, BNB: 590, SOL: 165, USDC: 1, XRP: 0.52, DOGE: 0.16, ADA: 0.45, TRX: 0.13 };
const COST_BASIS = { BTC: 45000, ETH: 2100, SOL: 95, USDC: 1, USDT: 1 };

export default function TaxHarvesting() {
  const { data: wallets = [], isLoading } = useQuery({ queryKey: ["wallets"], queryFn: () => base44.entities.Wallet.list() });

  const positions = wallets.map(w => {
    const currentPrice = USD_RATES[w.currency] || 0;
    const costBasis = COST_BASIS[w.currency] || currentPrice;
    const currentValue = (w.balance || 0) * currentPrice;
    const costBasisValue = (w.balance || 0) * costBasis;
    const unrealizedPnL = currentValue - costBasisValue;
    const pnlPct = costBasisValue > 0 ? (unrealizedPnL / costBasisValue) * 100 : 0;
    return { ...w, currentPrice, costBasis, currentValue, costBasisValue, unrealizedPnL, pnlPct };
  });

  const losers = positions.filter(p => p.unrealizedPnL < -50).sort((a, b) => a.unrealizedPnL - b.unrealizedPnL);
  const totalHarvestable = losers.reduce((s, p) => s + Math.abs(p.unrealizedPnL), 0);
  const estimatedTaxSaving = totalHarvestable * 0.20; // 20% CGT estimate

  const winners = positions.filter(p => p.unrealizedPnL > 50).sort((a, b) => b.unrealizedPnL - a.unrealizedPnL);

  if (isLoading) return <div className="flex justify-center py-20"><div className="h-8 w-8 rounded-full border-4 border-border border-t-primary animate-spin" /></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div><h1 className="text-xl font-bold">Tax Loss Harvesting</h1><p className="text-sm text-muted-foreground">Identify positions to sell for tax efficiency</p></div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Harvestable Losses", value: `$${totalHarvestable.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: <TrendingDown className="h-4 w-4 text-destructive" />, color: "text-destructive" },
          { label: "Est. Tax Saving (20%)", value: `$${estimatedTaxSaving.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: <Leaf className="h-4 w-4 text-green-500" />, color: "text-green-500" },
        ].map(s => (
          <div key={s.label} className="p-4 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 mb-1">{s.icon}<p className="text-xs text-muted-foreground">{s.label}</p></div>
            <p className={`font-bold text-xl ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 flex items-start gap-2 text-xs">
        <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-muted-foreground">Tax loss harvesting involves selling assets at a loss to offset capital gains. Consult a tax advisor. Wash-sale rules may apply.</p>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold flex items-center gap-2"><TrendingDown className="h-4 w-4 text-destructive" /> Loss Harvesting Opportunities</p>
        {losers.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground border border-dashed rounded-xl">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-60" />
            <p className="font-medium text-foreground">No losses to harvest</p>
            <p className="text-sm">All positions are currently profitable</p>
          </div>
        ) : losers.map(p => (
          <div key={p.id} className="p-4 rounded-xl border border-destructive/20 bg-card">
            <div className="flex items-center justify-between mb-2">
              <div><p className="font-semibold">{p.name || p.currency}</p><p className="text-xs text-muted-foreground">{p.balance} {p.currency}</p></div>
              <div className="text-right">
                <p className="font-bold text-destructive">${Math.abs(p.unrealizedPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })} loss</p>
                <p className="text-xs text-muted-foreground">{p.pnlPct.toFixed(1)}%</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground mb-3">
              <div><p>Cost Basis</p><p className="text-foreground font-medium">${p.costBasis.toLocaleString()}</p></div>
              <div><p>Current</p><p className="text-foreground font-medium">${p.currentPrice.toLocaleString()}</p></div>
              <div><p>Est. Tax Save</p><p className="text-green-500 font-medium">${(Math.abs(p.unrealizedPnL) * 0.2).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p></div>
            </div>
            <Button size="sm" variant="outline" className="w-full text-xs border-destructive/30 text-destructive hover:bg-destructive/10">
              Harvest — Sell {p.currency} at Loss
            </Button>
          </div>
        ))}
      </div>

      {winners.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold flex items-center gap-2"><DollarSign className="h-4 w-4 text-green-500" /> Offsettable Gains</p>
          <p className="text-xs text-muted-foreground">These gains can be offset by harvested losses</p>
          {winners.map(p => (
            <div key={p.id} className="p-3 rounded-xl border border-border bg-card flex items-center justify-between">
              <div><p className="text-sm font-medium">{p.name || p.currency}</p><p className="text-xs text-muted-foreground">{p.balance} {p.currency}</p></div>
              <p className="font-semibold text-green-500">+${p.unrealizedPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}