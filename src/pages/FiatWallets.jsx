import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, RefreshCw, ArrowLeftRight, DollarSign, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const CURRENCIES = ["USD", "EUR", "GBP", "AUD", "CAD", "JPY", "CHF", "SGD"];
const CURRENCY_SYMBOLS = { USD: "$", EUR: "€", GBP: "£", AUD: "A$", CAD: "C$", JPY: "¥", CHF: "Fr", SGD: "S$" };
const CURRENCY_FLAGS = { USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", AUD: "🇦🇺", CAD: "🇨🇦", JPY: "🇯🇵", CHF: "🇨🇭", SGD: "🇸🇬" };

// Static fallback rates (USD base)
const STATIC_RATES = { USD: 1, EUR: 0.92, GBP: 0.79, AUD: 1.53, CAD: 1.37, JPY: 149.5, CHF: 0.89, SGD: 1.35 };

export default function FiatWallets() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [rates, setRates] = useState(STATIC_RATES);
  const [loadingRates, setLoadingRates] = useState(false);
  const [form, setForm] = useState({ currency: "EUR", balance: "", label: "" });
  const [convertForm, setConvertForm] = useState({ from: "USD", to: "EUR", amount: "" });

  const { data: balances = [] } = useQuery({ queryKey: ["fiat-balances"], queryFn: () => base44.entities.FiatBalance.list() });

  const fetchRates = async () => {
    setLoadingRates(true);
    try {
      const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
      const data = await res.json();
      if (data.rates) setRates({ USD: 1, ...data.rates });
    } catch {
      // fallback to static
    } finally { setLoadingRates(false); }
  };

  useEffect(() => { fetchRates(); }, []);

  const totalInUSD = balances.reduce((s, b) => s + (b.balance || 0) / (rates[b.currency] || 1), 0);

  const addBalance = useMutation({
    mutationFn: () => base44.entities.FiatBalance.create({ currency: form.currency, balance: parseFloat(form.balance), label: form.label || form.currency, last_rate_usd: rates[form.currency] || 1 }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["fiat-balances"] }); setShowAdd(false); setForm({ currency: "EUR", balance: "", label: "" }); toast.success("Fiat balance added"); },
  });

  const deleteBalance = useMutation({
    mutationFn: (id) => base44.entities.FiatBalance.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fiat-balances"] }),
  });

  const convertedAmount = convertForm.amount
    ? ((parseFloat(convertForm.amount) / (rates[convertForm.from] || 1)) * (rates[convertForm.to] || 1)).toFixed(2)
    : "";

  const executeConvert = useMutation({
    mutationFn: async () => {
      const fromBal = balances.find(b => b.currency === convertForm.from);
      if (!fromBal || fromBal.balance < parseFloat(convertForm.amount)) throw new Error("Insufficient balance");
      const toBal = balances.find(b => b.currency === convertForm.to);
      await base44.entities.FiatBalance.update(fromBal.id, { balance: fromBal.balance - parseFloat(convertForm.amount) });
      if (toBal) await base44.entities.FiatBalance.update(toBal.id, { balance: toBal.balance + parseFloat(convertedAmount) });
      else await base44.entities.FiatBalance.create({ currency: convertForm.to, balance: parseFloat(convertedAmount), label: convertForm.to, last_rate_usd: rates[convertForm.to] || 1 });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["fiat-balances"] }); setShowConvert(false); setConvertForm({ from: "USD", to: "EUR", amount: "" }); toast.success("Conversion successful"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><DollarSign className="h-6 w-6 text-primary" /> Fiat Wallets</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Multi-currency fiat balances with live rates</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchRates} disabled={loadingRates}><RefreshCw className={`h-4 w-4 ${loadingRates ? "animate-spin" : ""}`} /></Button>
          <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1.5" /> Add</Button>
        </div>
      </div>

      {/* Total card */}
      <div className="p-5 rounded-xl border border-border bg-card text-center space-y-1">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Total Value</p>
        <p className="text-3xl font-bold">${totalInUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
        <p className="text-xs text-muted-foreground">{balances.length} currencies · Live rates</p>
        <Button variant="outline" size="sm" className="mt-2 gap-2" onClick={() => setShowConvert(true)}>
          <ArrowLeftRight className="h-3.5 w-3.5" /> Convert Currency
        </Button>
      </div>

      {/* Currency list */}
      {balances.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No fiat balances yet. Add your first currency.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {balances.map(b => {
            const usdValue = b.balance / (rates[b.currency] || 1);
            const pct = totalInUSD > 0 ? (usdValue / totalInUSD * 100).toFixed(1) : 0;
            return (
              <div key={b.id} className="p-4 rounded-xl border border-border bg-card flex items-center gap-3">
                <span className="text-2xl">{CURRENCY_FLAGS[b.currency] || "💵"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{b.label || b.currency}</p>
                    <p className="text-sm font-bold">{CURRENCY_SYMBOLS[b.currency] || ""}{b.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">1 USD = {(rates[b.currency] || 1).toFixed(4)} {b.currency}</p>
                    <p className="text-xs text-muted-foreground">${usdValue.toFixed(2)} · {pct}%</p>
                  </div>
                  <div className="h-1 bg-secondary rounded-full mt-1.5">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="text-xs text-destructive hover:bg-destructive/10 shrink-0 h-7 px-2" onClick={() => deleteBalance.mutate(b.id)}>×</Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Live rates grid */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5" /> Live Exchange Rates (vs USD)
        </p>
        <div className="grid grid-cols-4 gap-2">
          {CURRENCIES.filter(c => c !== "USD").map(c => (
            <div key={c} className="p-2 rounded-lg border border-border bg-card text-center">
              <p className="text-[10px] text-muted-foreground">{c}</p>
              <p className="text-xs font-bold">{(rates[c] || STATIC_RATES[c] || 1).toFixed(3)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Fiat Balance</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Currency</Label>
              <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{CURRENCY_FLAGS[c]} {c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Balance</Label><Input type="number" value={form.balance} onChange={e => setForm(f => ({ ...f, balance: e.target.value }))} placeholder="0.00" className="mt-1.5" /></div>
            <div><Label>Label (optional)</Label><Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder={form.currency} className="mt-1.5" /></div>
            <Button className="w-full" onClick={() => addBalance.mutate()} disabled={!form.currency || !form.balance || addBalance.isPending}>Add Balance</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Convert dialog */}
      <Dialog open={showConvert} onOpenChange={setShowConvert}>
        <DialogContent>
          <DialogHeader><DialogTitle>Convert Currency</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>From</Label>
                <Select value={convertForm.from} onValueChange={v => setConvertForm(f => ({ ...f, from: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{CURRENCY_FLAGS[c]} {c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>To</Label>
                <Select value={convertForm.to} onValueChange={v => setConvertForm(f => ({ ...f, to: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{CURRENCY_FLAGS[c]} {c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Amount ({convertForm.from})</Label><Input type="number" value={convertForm.amount} onChange={e => setConvertForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="mt-1.5" /></div>
            {convertedAmount && (
              <div className="p-3 rounded-lg bg-secondary text-center">
                <p className="text-xs text-muted-foreground">You'll receive</p>
                <p className="text-xl font-bold">{CURRENCY_SYMBOLS[convertForm.to]}{convertedAmount} {convertForm.to}</p>
                <p className="text-xs text-muted-foreground">Rate: 1 {convertForm.from} = {((rates[convertForm.to] || 1) / (rates[convertForm.from] || 1)).toFixed(4)} {convertForm.to}</p>
              </div>
            )}
            <Button className="w-full" onClick={() => executeConvert.mutate()} disabled={!convertForm.amount || !convertedAmount || executeConvert.isPending}>Convert</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}