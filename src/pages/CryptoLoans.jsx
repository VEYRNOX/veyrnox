import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Banknote, Plus, AlertTriangle, CheckCircle2, Trash2, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import moment from "moment";
import { USD_RATES, TOP_SYMBOLS } from "@/lib/cryptos";

export default function CryptoLoans() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ collateral_asset: "ETH", collateral_amount: "", borrow_asset: "USDC", ltv_percent: 50, protocol: "Internal" });

  const { data: loans = [], isLoading } = useQuery({
    queryKey: ["crypto-loans"],
    queryFn: () => base44.entities.CryptoLoan.list(),
  });

  const create = useMutation({
    mutationFn: (d) => {
      const collateralUsd = parseFloat(d.collateral_amount) * (USD_RATES[d.collateral_asset] || 0);
      const borrowAmount = collateralUsd * (d.ltv_percent / 100);
      const liquidationPrice = (borrowAmount / parseFloat(d.collateral_amount)) / 0.8;
      return base44.entities.CryptoLoan.create({
        ...d,
        borrow_amount: borrowAmount,
        liquidation_price: liquidationPrice,
        interest_rate: 5.5,
        health_factor: 100 / d.ltv_percent * 0.8,
        status: "active",
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["crypto-loans"] }); setOpen(false); },
  });

  const repay = useMutation({
    mutationFn: (id) => base44.entities.CryptoLoan.update(id, { status: "repaid" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crypto-loans"] }),
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.CryptoLoan.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crypto-loans"] }),
  });

  const previewBorrow = () => {
    if (!form.collateral_amount) return null;
    const usd = parseFloat(form.collateral_amount) * (USD_RATES[form.collateral_asset] || 0);
    return (usd * form.ltv_percent / 100).toFixed(2);
  };

  const activeLoans = loans.filter(l => l.status === "active");
  const totalBorrowed = activeLoans.reduce((s, l) => s + (l.borrow_amount || 0), 0);
  const totalCollateral = activeLoans.reduce((s, l) => s + (parseFloat(l.collateral_amount || 0) * (USD_RATES[l.collateral_asset] || 0)), 0);

  const healthColor = (hf) => hf >= 2 ? "text-green-500" : hf >= 1.5 ? "text-yellow-500" : "text-red-500";

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Banknote className="h-5 w-5 text-primary" /> Crypto Loans</h1>
          <p className="text-sm text-muted-foreground">Borrow against your crypto collateral</p>
        </div>
        <Button onClick={() => setOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> New Loan</Button>
      </div>

      {/* Stats */}
      {activeLoans.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Borrowed</p>
            <p className="text-xl font-bold">${totalBorrowed.toLocaleString()}</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Collateral</p>
            <p className="text-xl font-bold">${totalCollateral.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Loans List */}
      {isLoading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Loading...</div>
      ) : loans.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">🏦</p>
          <p className="text-muted-foreground text-sm mb-4">No loans yet. Borrow against your crypto.</p>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Get a Loan</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {loans.map(loan => {
            const hf = loan.health_factor || 2;
            return (
              <div key={loan.id} className="bg-card border border-border rounded-2xl p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{loan.collateral_amount} {loan.collateral_asset} → ${(loan.borrow_amount || 0).toLocaleString()} {loan.borrow_asset}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{loan.protocol} · {loan.interest_rate}% APR · LTV {loan.ltv_percent}%</p>
                  </div>
                  <Badge variant={loan.status === "active" ? "default" : loan.status === "repaid" ? "secondary" : "destructive"}>
                    {loan.status}
                  </Badge>
                </div>

                {loan.status === "active" && (
                  <div className="grid grid-cols-3 gap-2 text-center mb-3 bg-secondary rounded-xl p-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Health Factor</p>
                      <p className={`text-sm font-bold ${healthColor(hf)}`}>{hf.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Liquidation</p>
                      <p className="text-sm font-bold">${(loan.liquidation_price || 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Interest</p>
                      <p className="text-sm font-bold">${(loan.interest_accrued || 0).toFixed(2)}</p>
                    </div>
                  </div>
                )}

                {hf < 1.5 && loan.status === "active" && (
                  <div className="flex items-center gap-2 p-2 bg-red-500/10 rounded-lg mb-3">
                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                    <p className="text-xs text-red-500">Low health factor — risk of liquidation!</p>
                  </div>
                )}

                <div className="flex gap-2">
                  {loan.status === "active" && (
                    <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => repay.mutate(loan.id)}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Repay
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => remove.mutate(loan.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Get a Crypto Loan</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Collateral Asset</Label>
                <Select value={form.collateral_asset} onValueChange={v => setForm(f => ({ ...f, collateral_asset: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TOP_SYMBOLS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Collateral Amount</Label>
                <Input value={form.collateral_amount} onChange={e => setForm(f => ({ ...f, collateral_amount: e.target.value }))} placeholder="1.0" type="number" className="mt-1.5" />
              </div>
            </div>

            <div>
              <Label>LTV: {form.ltv_percent}%</Label>
              <input type="range" min="10" max="75" value={form.ltv_percent}
                onChange={e => setForm(f => ({ ...f, ltv_percent: parseInt(e.target.value) }))}
                className="w-full mt-1.5 accent-primary" />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Safer (10%)</span><span>Riskier (75%)</span>
              </div>
            </div>

            {previewBorrow() && (
              <div className="bg-primary/10 border border-primary/30 rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground mb-0.5">You will receive</p>
                <p className="text-xl font-bold text-primary">${parseFloat(previewBorrow()).toLocaleString()} {form.borrow_asset}</p>
                <p className="text-xs text-muted-foreground mt-1">5.5% APR · Interest rate fixed</p>
              </div>
            )}

            <div>
              <Label>Protocol</Label>
              <Select value={form.protocol} onValueChange={v => setForm(f => ({ ...f, protocol: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Internal","Aave","Compound","MakerDAO"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Button className="w-full" disabled={!form.collateral_amount || create.isPending}
              onClick={() => create.mutate(form)}>
              {create.isPending ? "Processing..." : "Get Loan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}