import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ArrowRight, GitMerge, Clock, CheckCircle2, XCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import moment from "moment";

const CHAINS = [
  { id: "ethereum", label: "Ethereum", icon: "Ξ", color: "bg-blue-500/10 text-blue-400" },
  { id: "polygon", label: "Polygon", icon: "⬟", color: "bg-purple-600/10 text-purple-500" },
  { id: "arbitrum", label: "Arbitrum", icon: "🔷", color: "bg-blue-600/10 text-blue-500" },
  { id: "optimism", label: "Optimism", icon: "🔴", color: "bg-red-500/10 text-red-400" },
  { id: "base", label: "Base", icon: "🔵", color: "bg-blue-400/10 text-blue-300" },
  { id: "bsc", label: "BNB Chain", icon: "🟡", color: "bg-yellow-500/10 text-yellow-400" },
  { id: "solana", label: "Solana", icon: "◎", color: "bg-purple-500/10 text-purple-400" },
];

const BRIDGES = [
  { name: "Stargate", fee_pct: 0.06, time: 2, supported_chains: ["ethereum","polygon","arbitrum","optimism","base","bsc"] },
  { name: "Hop", fee_pct: 0.04, time: 5, supported_chains: ["ethereum","polygon","arbitrum","optimism"] },
  { name: "Across", fee_pct: 0.05, time: 3, supported_chains: ["ethereum","polygon","arbitrum","optimism","base"] },
  { name: "Synapse", fee_pct: 0.05, time: 4, supported_chains: ["ethereum","polygon","arbitrum","optimism","bsc"] },
  { name: "Wormhole", fee_pct: 0.08, time: 10, supported_chains: ["ethereum","solana","polygon","base"] },
  { name: "deBridge", fee_pct: 0.03, time: 2, supported_chains: ["ethereum","polygon","arbitrum","optimism","bsc","solana"] },
];

const ASSETS = ["ETH", "USDC", "USDT", "WBTC", "MATIC", "BNB"];

const STATUS_CONFIG = {
  pending: { icon: Clock, color: "text-yellow-400", label: "Pending" },
  in_progress: { icon: Zap, color: "text-blue-400", label: "In Progress" },
  completed: { icon: CheckCircle2, color: "text-green-400", label: "Completed" },
  failed: { icon: XCircle, color: "text-destructive", label: "Failed" },
};

const chain = (id) => CHAINS.find(c => c.id === id);

export default function CrossChainBridge() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ from_chain: "ethereum", to_chain: "arbitrum", asset: "USDC", amount: "", bridge_protocol: "Stargate" });

  const { data: history = [] } = useQuery({ queryKey: ["bridge-txs"], queryFn: () => base44.entities.BridgeTransaction.list("-created_date") });

  const selectedBridge = BRIDGES.find(b => b.name === form.bridge_protocol);
  const fee = form.amount ? (parseFloat(form.amount) * (selectedBridge?.fee_pct || 0) / 100).toFixed(4) : 0;
  const receive = form.amount ? (parseFloat(form.amount) - parseFloat(fee)).toFixed(4) : 0;

  const availableBridges = BRIDGES.filter(b =>
    form.from_chain !== form.to_chain &&
    b.supported_chains.includes(form.from_chain) &&
    b.supported_chains.includes(form.to_chain)
  );

  const bridge = useMutation({
    mutationFn: () => base44.entities.BridgeTransaction.create({
      from_chain: form.from_chain, to_chain: form.to_chain, asset: form.asset,
      amount: parseFloat(form.amount), bridge_protocol: form.bridge_protocol,
      bridge_fee: parseFloat(fee), estimated_time_mins: selectedBridge?.time || 5,
      status: "pending",
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bridge-txs"] }); setForm(f => ({ ...f, amount: "" })); toast.success("Bridge transaction initiated"); },
  });

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><GitMerge className="h-6 w-6 text-primary" /> Cross-Chain Bridge</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Transfer assets between blockchains</p>
      </div>

      <Tabs defaultValue="bridge">
        <TabsList className="w-full bg-secondary">
          <TabsTrigger value="bridge" className="flex-1">Bridge</TabsTrigger>
          <TabsTrigger value="history" className="flex-1">History ({history.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="bridge" className="mt-4 space-y-4">
          {/* Chain selector */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Label className="text-xs">From</Label>
              <Select value={form.from_chain} onValueChange={v => setForm(f => ({ ...f, from_chain: v }))}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue>{chain(form.from_chain) && <span className="flex items-center gap-1.5"><span>{chain(form.from_chain).icon}</span>{chain(form.from_chain).label}</span>}</SelectValue>
                </SelectTrigger>
                <SelectContent>{CHAINS.map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground mt-5 shrink-0" />
            <div className="flex-1">
              <Label className="text-xs">To</Label>
              <Select value={form.to_chain} onValueChange={v => setForm(f => ({ ...f, to_chain: v }))}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue>{chain(form.to_chain) && <span className="flex items-center gap-1.5"><span>{chain(form.to_chain).icon}</span>{chain(form.to_chain).label}</span>}</SelectValue>
                </SelectTrigger>
                <SelectContent>{CHAINS.filter(c => c.id !== form.from_chain).map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><Label>Asset</Label>
              <Select value={form.asset} onValueChange={v => setForm(f => ({ ...f, asset: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{ASSETS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Amount</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="mt-1.5" /></div>
          </div>

          {/* Bridge selection */}
          <div>
            <Label>Bridge Protocol</Label>
            <div className="mt-1.5 space-y-2">
              {availableBridges.length === 0 ? <p className="text-xs text-muted-foreground">No bridges available for this route</p> :
                availableBridges.map(b => (
                  <button key={b.name} onClick={() => setForm(f => ({ ...f, bridge_protocol: b.name }))}
                    className={`w-full p-3 rounded-xl border text-left transition-colors ${form.bridge_protocol === b.name ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{b.name}</p>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>Fee: {b.fee_pct}%</span>
                        <span>~{b.time} min</span>
                      </div>
                    </div>
                  </button>
                ))}
            </div>
          </div>

          {/* Summary */}
          {form.amount && parseFloat(form.amount) > 0 && (
            <div className="p-4 rounded-xl border border-border bg-secondary space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">You send</span><span className="font-semibold">{form.amount} {form.asset}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Bridge fee</span><span className="text-destructive">-{fee} {form.asset}</span></div>
              <div className="flex justify-between border-t border-border pt-2"><span className="font-semibold">You receive</span><span className="font-bold text-green-400">{receive} {form.asset}</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Estimated time</span><span>~{selectedBridge?.time} minutes</span></div>
            </div>
          )}

          <Button className="w-full" onClick={() => bridge.mutate()} disabled={!form.amount || !form.bridge_protocol || form.from_chain === form.to_chain || bridge.isPending}>
            Bridge {form.amount || ""} {form.asset}
          </Button>
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-3">
          {history.length === 0 ? <p className="text-center text-muted-foreground py-10 text-sm">No bridge transactions yet</p> :
            history.map(tx => {
              const st = STATUS_CONFIG[tx.status] || STATUS_CONFIG.pending;
              return (
                <div key={tx.id} className="p-4 rounded-xl border border-border bg-card space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{chain(tx.from_chain)?.icon}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm">{chain(tx.to_chain)?.icon}</span>
                      <span className="text-sm font-semibold">{tx.amount} {tx.asset}</span>
                    </div>
                    <div className="flex items-center gap-1"><st.icon className={`h-3.5 w-3.5 ${st.color}`} /><span className={`text-xs ${st.color}`}>{st.label}</span></div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{tx.bridge_protocol} · Fee: {tx.bridge_fee} {tx.asset}</span>
                    <span>{moment(tx.created_date).fromNow()}</span>
                  </div>
                </div>
              );
            })}
        </TabsContent>
      </Tabs>
    </div>
  );
}