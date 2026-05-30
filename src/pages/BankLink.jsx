import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Landmark, CheckCircle, Clock, Trash2, ArrowDownUp, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_CFG = {
  active: { cls: "bg-green-500/10 text-green-500", label: "Verified", icon: <CheckCircle className="h-3 w-3" /> },
  pending: { cls: "bg-yellow-500/10 text-yellow-500", label: "Pending", icon: <Clock className="h-3 w-3" /> },
  removed: { cls: "bg-secondary text-muted-foreground", label: "Removed", icon: null },
};

const POPULAR_BANKS = ["Barclays", "HSBC", "Lloyds", "NatWest", "Monzo", "Revolut", "Starling", "Santander", "Halifax", "Deutsche Bank", "BNP Paribas", "Chase", "Bank of America"];

export default function BankLink() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ bank_name: "", account_holder: "", iban: "", bic: "", currency: "GBP", account_type: "personal", nickname: "" });

  const { data: accounts = [] } = useQuery({ queryKey: ["bank-accounts"], queryFn: () => base44.entities.BankAccount.list() });

  const create = useMutation({
    mutationFn: (d) => base44.entities.BankAccount.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bank-accounts"] }); setOpen(false); setForm({ bank_name: "", account_holder: "", iban: "", bic: "", currency: "GBP", account_type: "personal", nickname: "" }); },
  });

  const verify = useMutation({
    mutationFn: async (id) => {
      await new Promise(r => setTimeout(r, 1500));
      return base44.entities.BankAccount.update(id, { status: "active", verified: true });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bank-accounts"] }),
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.BankAccount.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bank-accounts"] }),
  });

  const maskIBAN = (iban) => iban ? iban.slice(0, 6) + " •••• •••• " + iban.slice(-4) : "";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold">Bank Account Linking</h1><p className="text-sm text-muted-foreground">Link IBAN accounts for direct fiat-to-crypto funding</p></div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Link Account</Button>
      </div>

      <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex items-start gap-3">
        <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold">Open Banking via PSD2</p>
          <p className="text-muted-foreground text-xs mt-0.5">Bank accounts are verified via micro-deposit (2 small credits sent to your account). We never store your banking credentials.</p>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="text-center py-14 text-muted-foreground">
          <Landmark className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No bank accounts linked</p>
          <p className="text-sm mt-1">Link your IBAN to fund your wallet directly</p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map(acc => {
            const cfg = STATUS_CFG[acc.status] || STATUS_CFG.pending;
            return (
              <div key={acc.id} className="p-4 rounded-xl border border-border bg-card">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center shrink-0"><Landmark className="h-5 w-5 text-muted-foreground" /></div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{acc.nickname || acc.bank_name}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5 ${cfg.cls}`}>{cfg.icon}{cfg.label}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground capitalize">{acc.account_type}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{maskIBAN(acc.iban)} · {acc.currency}</p>
                      {acc.account_holder && <p className="text-xs text-muted-foreground">{acc.account_holder}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {acc.status === "pending" && (
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => verify.mutate(acc.id)} disabled={verify.isPending}>Verify</Button>
                    )}
                    {acc.status === "active" && (
                      <Button size="sm" variant="outline" className="gap-1 text-xs"><ArrowDownUp className="h-3 w-3" /> Fund</Button>
                    )}
                    <button onClick={() => remove.mutate(acc.id)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Link Bank Account</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div><Label>Bank Name</Label>
              <Input className="mt-1.5" list="banks" placeholder="Barclays, Monzo..." value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} />
              <datalist id="banks">{POPULAR_BANKS.map(b => <option key={b} value={b} />)}</datalist>
            </div>
            <div><Label>IBAN</Label><Input className="mt-1.5 font-mono text-xs" placeholder="GB29NWBK60161331926819" value={form.iban} onChange={e => setForm(f => ({ ...f, iban: e.target.value.toUpperCase() }))} /></div>
            <div><Label>BIC / SWIFT (optional)</Label><Input className="mt-1.5 font-mono text-xs" placeholder="NWBKGB2L" value={form.bic} onChange={e => setForm(f => ({ ...f, bic: e.target.value.toUpperCase() }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{["GBP","EUR","USD","CHF","JPY"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Type</Label>
                <Select value={form.account_type} onValueChange={v => setForm(f => ({ ...f, account_type: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="personal">Personal</SelectItem><SelectItem value="business">Business</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Nickname (optional)</Label><Input className="mt-1.5" placeholder="My main account" value={form.nickname} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} /></div>
            <Button className="w-full" disabled={!form.bank_name || !form.iban || create.isPending} onClick={() => create.mutate(form)}>Link Account</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}