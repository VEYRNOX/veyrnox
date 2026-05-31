import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, ShieldCheck, Users, Clock, CheckCircle2, XCircle, Zap, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import moment from "moment";

const STATUS_COLORS = { pending: "text-yellow-400 bg-yellow-500/10", approved: "text-green-400 bg-green-500/10", rejected: "text-destructive bg-destructive/10", executed: "text-blue-400 bg-blue-500/10" };

export default function MultiSigWallets() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showPropose, setShowPropose] = useState(null); // wallet object
  const [signerInput, setSignerInput] = useState("");
  const [form, setForm] = useState({ name: "", currency: "ETH", required_signatures: 2, total_signers: 3, signers: [] });
  const [txForm, setTxForm] = useState({ to_address: "", amount: "", note: "" });

  const { data: wallets = [] } = useQuery({ queryKey: ["multisig-wallets"], queryFn: () => base44.entities.MultiSigWallet.list("-created_date") });
  const { data: transactions = [] } = useQuery({ queryKey: ["multisig-txs"], queryFn: () => base44.entities.MultiSigTransaction.list("-created_date") });

  const createWallet = useMutation({
    mutationFn: () => {
      const addr = "0x" + Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
      return base44.entities.MultiSigWallet.create({ ...form, address: addr, balance: 0 });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["multisig-wallets"] }); setShowCreate(false); setForm({ name: "", currency: "ETH", required_signatures: 2, total_signers: 3, signers: [] }); toast.success("Multi-sig wallet created"); },
  });

  const proposeTx = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();
      return base44.entities.MultiSigTransaction.create({ wallet_id: showPropose.id, to_address: txForm.to_address, amount: parseFloat(txForm.amount), currency: showPropose.currency, note: txForm.note, required_signatures: showPropose.required_signatures, signatures: [user.email], status: "pending", proposed_by: user.email });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["multisig-txs"] }); setShowPropose(null); setTxForm({ to_address: "", amount: "", note: "" }); toast.success("Transaction proposed — awaiting signatures"); },
  });

  const signTx = useMutation({
    mutationFn: async (tx) => {
      const user = await base44.auth.me();
      if (tx.signatures?.includes(user.email)) { toast.error("Already signed"); return; }
      const newSigs = [...(tx.signatures || []), user.email];
      const approved = newSigs.length >= tx.required_signatures;
      return base44.entities.MultiSigTransaction.update(tx.id, { signatures: newSigs, status: approved ? "approved" : "pending", ...(approved ? { executed_at: new Date().toISOString() } : {}) });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["multisig-txs"] }); toast.success("Signature added"); },
  });

  const rejectTx = useMutation({
    mutationFn: (id) => base44.entities.MultiSigTransaction.update(id, { status: "rejected" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["multisig-txs"] }),
  });

  const addSigner = () => { if (signerInput && !form.signers.includes(signerInput)) { setForm(f => ({ ...f, signers: [...f.signers, signerInput] })); setSignerInput(""); } };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /> Multi-Sig Wallets</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Require multiple approvals for transactions</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1.5" /> New</Button>
      </div>

      <Tabs defaultValue="wallets">
        <TabsList className="w-full bg-secondary">
          <TabsTrigger value="wallets" className="flex-1">Wallets ({wallets.length})</TabsTrigger>
          <TabsTrigger value="pending" className="flex-1">Pending ({transactions.filter(t => t.status === "pending").length})</TabsTrigger>
          <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
        </TabsList>

        <TabsContent value="wallets" className="mt-3 space-y-3">
          {wallets.length === 0 && <p className="text-center text-muted-foreground py-12 text-sm">No multi-sig wallets yet</p>}
          {wallets.map(w => (
            <div key={w.id} className="p-4 rounded-xl border border-border bg-card space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{w.name}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">{w.address}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{w.balance} {w.currency}</p>
                  <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">{w.required_signatures}-of-{w.total_signers}</span>
                </div>
              </div>
              {w.signers?.length > 0 && (
                <div className="flex flex-wrap gap-1">{w.signers.map(s => <span key={s} className="text-[10px] bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">{s}</span>)}</div>
              )}
              <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setShowPropose(w)}>
                <Zap className="h-3.5 w-3.5" /> Propose Transaction
              </Button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="pending" className="mt-3 space-y-3">
          {transactions.filter(t => t.status === "pending").map(tx => (
            <div key={tx.id} className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-semibold">{tx.amount} {tx.currency}</p>
                  <p className="text-xs font-mono text-muted-foreground truncate">{tx.to_address}</p>
                  {tx.note && <p className="text-xs text-muted-foreground">{tx.note}</p>}
                </div>
                <div className="flex items-center gap-1 text-xs text-yellow-400"><Clock className="h-3.5 w-3.5" /> {tx.signatures?.length || 0}/{tx.required_signatures}</div>
              </div>
              <div className="flex gap-2 mt-1">
                <Button size="sm" className="flex-1 gap-1.5" onClick={() => signTx.mutate(tx)}><CheckCircle2 className="h-3.5 w-3.5" /> Sign</Button>
                <Button variant="destructive" size="sm" className="flex-1 gap-1.5" onClick={() => rejectTx.mutate(tx.id)}><XCircle className="h-3.5 w-3.5" /> Reject</Button>
              </div>
            </div>
          ))}
          {transactions.filter(t => t.status === "pending").length === 0 && <p className="text-center text-muted-foreground py-12 text-sm">No pending transactions</p>}
        </TabsContent>

        <TabsContent value="history" className="mt-3 space-y-2">
          {transactions.filter(t => t.status !== "pending").map(tx => (
            <div key={tx.id} className="px-4 py-3 rounded-xl border border-border bg-card flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{tx.amount} {tx.currency}</p>
                <p className="text-xs text-muted-foreground">{moment(tx.created_date).fromNow()}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[tx.status]}`}>{tx.status}</span>
            </div>
          ))}
          {transactions.filter(t => t.status !== "pending").length === 0 && <p className="text-center text-muted-foreground py-12 text-sm">No transaction history</p>}
        </TabsContent>
      </Tabs>

      {/* Create wallet dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Multi-Sig Wallet</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Wallet Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1.5" placeholder="Team Treasury" /></div>
            <div><Label>Currency</Label>
              <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{["BTC", "ETH", "USDT", "BNB", "SOL", "USDC", "XRP", "DOGE", "ADA", "TRX"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Required Sigs</Label><Input type="number" min="1" value={form.required_signatures} onChange={e => setForm(f => ({ ...f, required_signatures: parseInt(e.target.value) }))} className="mt-1.5" /></div>
              <div><Label>Total Signers</Label><Input type="number" min="1" value={form.total_signers} onChange={e => setForm(f => ({ ...f, total_signers: parseInt(e.target.value) }))} className="mt-1.5" /></div>
            </div>
            <div>
              <Label>Add Signers (email)</Label>
              <div className="flex gap-2 mt-1.5">
                <Input value={signerInput} onChange={e => setSignerInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addSigner()} placeholder="signer@example.com" />
                <Button variant="outline" onClick={addSigner}><Plus className="h-4 w-4" /></Button>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">{form.signers.map(s => <span key={s} className="text-xs bg-secondary px-2 py-0.5 rounded-full text-muted-foreground cursor-pointer" onClick={() => setForm(f => ({ ...f, signers: f.signers.filter(x => x !== s) }))}>{s} ×</span>)}</div>
            </div>
            <Button className="w-full" onClick={() => createWallet.mutate()} disabled={!form.name || createWallet.isPending}>Create Wallet</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Propose tx dialog */}
      <Dialog open={!!showPropose} onOpenChange={() => setShowPropose(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Propose Transaction — {showPropose?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Recipient Address</Label><Input value={txForm.to_address} onChange={e => setTxForm(f => ({ ...f, to_address: e.target.value }))} className="mt-1.5 font-mono text-sm" placeholder="0x..." /></div>
            <div><Label>Amount ({showPropose?.currency})</Label><Input type="number" value={txForm.amount} onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))} className="mt-1.5" placeholder="0.00" /></div>
            <div><Label>Note</Label><Input value={txForm.note} onChange={e => setTxForm(f => ({ ...f, note: e.target.value }))} className="mt-1.5" /></div>
            <div className="p-3 rounded-lg bg-secondary text-xs text-muted-foreground">Requires {showPropose?.required_signatures} of {showPropose?.total_signers} signatures to execute.</div>
            <Button className="w-full" onClick={() => proposeTx.mutate()} disabled={!txForm.to_address || !txForm.amount || proposeTx.isPending}>Propose Transaction</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}