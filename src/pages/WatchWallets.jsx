// @ts-nocheck
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Eye, Plus, Trash2, Copy, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import CoinLogo from "@/components/CoinLogo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdvisorSnapshot } from "@/lib/useAdvisorSnapshot";
import EmptyState from "@/components/EmptyState";
import { useWallet } from "@/lib/WalletProvider";
import { isDeniabilityOrDemoActive } from "@/wallet-core/deniabilitySession";
import { DEMO } from "@/api/demoClient";


// K-2 / I3 (#2537): same two-chokepoint shape as SavingsGoals / Dashboard —
// gate every read of the SHARED veyrnox-appdata store and refuse every mutation
// before it lands.
const denyInDeniable = () => {
  throw Object.assign(new Error("Not available in this session"), { code: "DENIABILITY_BLOCKED" });
};

export default function WatchWallets() {
  // K-2 / I3 (#2537): this entity lives in the SHARED veyrnox-appdata IndexedDB
  // with no per-session partition, so ungated a decoy/hidden/demo session reads
  // and writes the REAL user's rows. isDecoy/isHidden are React state and lag
  // the module-level flag, so fold in the canonical predicate too. Fail closed.
  const { isDecoy, isHidden } = useWallet();
  const deniable = DEMO || isDecoy || isHidden || isDeniabilityOrDemoActive();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(null);
  const [form, setForm] = useState({ name: "", address: "", network: "Ethereum", currency: "ETH", note: "", is_watch_only: true });

  const { data: walletsRaw = [], isError } = useQuery({ queryKey: ["watch-wallets"], queryFn: () => base44.entities.Wallet.filter({ is_watch_only: true }), enabled: !deniable });
  const wallets = deniable ? [] : walletsRaw;
  const displayed = wallets;

  const create = useMutation({
    mutationFn: (/** @type {any} */ d) => {
      if (deniable) denyInDeniable();
      return base44.entities.Wallet.create({ ...d, balance: 0, is_watch_only: true });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["watch-wallets"] }); setOpen(false); setForm({ name: "", address: "", network: "Ethereum", currency: "ETH", note: "", is_watch_only: true }); },
  });

  const remove = useMutation({
    mutationFn: (/** @type {any} */ id) => {
      if (deniable) denyInDeniable();
      return base44.entities.Wallet.delete(id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watch-wallets"] }),
  });

  const copyAddr = (addr, id) => { navigator.clipboard.writeText(addr); setCopied(id); setTimeout(() => setCopied(null), 1500); };

  const EXPLORERS = { Ethereum: "https://etherscan.io/address/", Bitcoin: "https://blockstream.info/address/", Solana: "https://solscan.io/account/", Polygon: "https://polygonscan.com/address/" };

  useAdvisorSnapshot({
    watch_wallets: {
      wallet_count: displayed.length,
      error: isError,
    },
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Eye className="h-5 w-5 text-primary" /> Watch-only Wallets</h1>
          <p className="text-sm text-muted-foreground">Monitor any public address — no private keys needed</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Watch Address</Button>
      </div>

      <div className="p-3 rounded-xl bg-secondary/30 border border-border text-xs text-muted-foreground">
        Watch-only mode lets you monitor any wallet balance and transactions without importing private keys or seed phrases. Your keys are never required.
      </div>

      {isError ? (
        <div role="alert" className="text-center py-14 text-sm text-destructive">Couldn&apos;t load your watched wallets. The addresses you added are still saved — this is a read failure, not a loss. Pull to refresh or try again.</div>
      ) : displayed.length === 0 ? (
        <EmptyState
          kind="wallets"
          title="No watched wallets"
          description="Watch any public address to follow its balance and transactions. No private key or seed phrase is ever needed, and watching does not give you the ability to spend from it."
          action={<Button onClick={() => setOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Watch an address</Button>}
        />
      ) : (
        <div className="space-y-3">
          {displayed.map(w => {
            const explorer = EXPLORERS[w.network];
            return (
              <div key={w.id} className="p-4 rounded-xl border border-border bg-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <CoinLogo symbol={w.currency} size={32} />
                      <div>
                        <p className="font-medium text-sm">{w.name}</p>
                        <span className="text-xs bg-secondary text-muted-foreground px-1.5 py-0.5 rounded font-semibold">Watch-only · {w.network}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <p className="text-xs font-mono text-muted-foreground truncate flex-1">{w.address}</p>
                      <button onClick={() => copyAddr(w.address, w.id)} aria-label={`Copy ${w.name} address`} className="shrink-0 text-muted-foreground hover:text-foreground">
                        {copied === w.id ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                      {explorer && (
                        <a href={`${explorer}${encodeURIComponent(w.address)}`} target="_blank" rel="noreferrer" aria-label={`View ${w.name} on block explorer`} className="shrink-0 text-muted-foreground hover:text-primary">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                    {w.note && <p className="text-xs text-muted-foreground mt-1">{w.note}</p>}
                  </div>
                  <div className="text-end shrink-0">
                    <p className="font-bold">{w.balance > 0 ? w.balance.toFixed(4) : "—"} {w.currency}</p>
                    <button onClick={() => remove.mutate(w.id)} aria-label={`Remove ${w.name} from watch list`} className="mt-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Watch an Address</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label htmlFor="watch-wallet-label">Label / Name</Label><Input id="watch-wallet-label" className="mt-1.5" placeholder="Vitalik.eth or My Cold Wallet" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label htmlFor="watch-wallet-address">Wallet Address</Label><Input id="watch-wallet-address" className="mt-1.5 font-mono text-xs" placeholder="0x... or bc1q..." value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label id="watch-network-label">Network</Label>
                <Select value={form.network} onValueChange={v => setForm(f => ({ ...f, network: v }))}>
                  <SelectTrigger className="mt-1.5" aria-labelledby="watch-network-label"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Ethereum","Bitcoin","Solana","Polygon","BSC"].map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label id="watch-asset-label">Asset</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger className="mt-1.5" aria-labelledby="watch-asset-label"><SelectValue /></SelectTrigger>
                  <SelectContent>{["BTC", "ETH", "USDT", "BNB", "SOL", "USDC", "XRP", "DOGE", "ADA", "TRX"].map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label htmlFor="watch-wallet-note">Note (optional)</Label><Input id="watch-wallet-note" className="mt-1.5" placeholder="e.g. Ethereum founder wallet" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
            <Button className="w-full" disabled={!form.name || !form.address || create.isPending} onClick={() => create.mutate(form)}>Watch Address</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}