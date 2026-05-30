import { useState } from "react";
import { Globe, ArrowRight, Send, Copy, Check, ExternalLink, Layers, Vote, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const COSMOS_CHAINS = [
  { id: "cosmoshub", name: "Cosmos Hub", symbol: "ATOM", prefix: "cosmos", balance: 45.2, price: 9.5, color: "#8B5CF6", staked: 20.0, apy: 19.2 },
  { id: "osmosis", name: "Osmosis", symbol: "OSMO", prefix: "osmo", balance: 320.0, price: 0.88, color: "#FF60AF", staked: 150.0, apy: 22.5 },
  { id: "juno", name: "Juno", symbol: "JUNO", prefix: "juno", balance: 85.0, price: 0.42, color: "#F97316", staked: 30.0, apy: 16.8 },
  { id: "celestia", name: "Celestia", symbol: "TIA", prefix: "celestia", balance: 12.5, price: 8.2, color: "#7C3AED", staked: 5.0, apy: 14.1 },
  { id: "injective", name: "Injective", symbol: "INJ", prefix: "inj", balance: 8.4, price: 24.5, color: "#06B6D4", staked: 3.0, apy: 11.5 },
  { id: "akash", name: "Akash", symbol: "AKT", prefix: "akash", balance: 200.0, price: 4.1, color: "#EF4444", staked: 100.0, apy: 24.0 },
];

const IBC_CHANNELS = [
  { from: "Cosmos Hub", to: "Osmosis", channel: "channel-141", status: "open", latency: "~20s" },
  { from: "Osmosis", to: "Cosmos Hub", channel: "channel-0", status: "open", latency: "~20s" },
  { from: "Cosmos Hub", to: "Juno", channel: "channel-207", status: "open", latency: "~30s" },
  { from: "Celestia", to: "Osmosis", channel: "channel-6994", status: "open", latency: "~25s" },
];

export default function CosmosIBC() {
  const [tab, setTab] = useState("portfolio");
  const [ibcOpen, setIbcOpen] = useState(false);
  const [ibcForm, setIbcForm] = useState({ from: "Cosmos Hub", to: "Osmosis", token: "ATOM", amount: "" });
  const [copied, setCopied] = useState(null);

  const totalUSD = COSMOS_CHAINS.reduce((s, c) => s + c.balance * c.price, 0);
  const totalStaked = COSMOS_CHAINS.reduce((s, c) => s + (c.staked || 0) * c.price, 0);

  const copy = (text, id) => { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1500); };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/10 border border-purple-500/20">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Globe className="h-5 w-5 text-purple-400" /> Cosmos / IBC
            </h1>
            <p className="text-sm text-muted-foreground">Interchain assets via IBC protocol</p>
          </div>
          <Button onClick={() => setIbcOpen(true)} className="gap-2 bg-purple-600 hover:bg-purple-700">
            <ArrowRight className="h-4 w-4" /> IBC Transfer
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center text-xs">
          <div className="p-3 rounded-xl bg-white/5">
            <p className="text-muted-foreground">Total Balance</p>
            <p className="text-lg font-bold">${totalUSD.toFixed(0)}</p>
          </div>
          <div className="p-3 rounded-xl bg-white/5">
            <p className="text-muted-foreground">Staked Value</p>
            <p className="text-lg font-bold text-green-400">${totalStaked.toFixed(0)}</p>
          </div>
          <div className="p-3 rounded-xl bg-white/5">
            <p className="text-muted-foreground">Chains</p>
            <p className="text-lg font-bold">{COSMOS_CHAINS.length}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-secondary/30 rounded-xl">
        {[["portfolio","Portfolio"],["staking","Staking"],["ibc","IBC Channels"]].map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === t ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}>{l}</button>
        ))}
      </div>

      {tab === "portfolio" && (
        <div className="space-y-2">
          {COSMOS_CHAINS.map(c => {
            const addr = `${c.prefix}1${Array.from(c.id).reduce((a,ch) => a * 31 + ch.charCodeAt(0),0).toString(16).padStart(38,"0").slice(0,38)}`;
            return (
              <div key={c.id} className="p-4 rounded-xl border border-border bg-card">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ backgroundColor: c.color }}>{c.symbol.slice(0,3)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{c.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-[10px] font-mono text-muted-foreground truncate">{addr.slice(0,20)}...</p>
                      <button onClick={() => copy(addr, c.id)}>{copied === c.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}</button>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold">{c.balance} {c.symbol}</p>
                    <p className="text-xs text-muted-foreground">${(c.balance * c.price).toFixed(2)}</p>
                  </div>
                </div>
                {c.staked > 0 && (
                  <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                    <span>Staked: <span className="text-green-500 font-semibold">{c.staked} {c.symbol}</span></span>
                    <span className="text-green-500 font-semibold">{c.apy}% APY</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "staking" && (
        <div className="space-y-3">
          {COSMOS_CHAINS.filter(c => c.staked > 0).map(c => (
            <div key={c.id} className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: c.color }}>{c.symbol.slice(0,2)}</div>
                  <p className="font-semibold text-sm">{c.name}</p>
                </div>
                <span className="text-green-500 text-sm font-bold">{c.apy}% APY</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-center">
                <div className="p-2 rounded-lg bg-secondary"><p className="text-muted-foreground">Staked</p><p className="font-semibold">{c.staked} {c.symbol}</p></div>
                <div className="p-2 rounded-lg bg-secondary"><p className="text-muted-foreground">USD Value</p><p className="font-semibold">${(c.staked * c.price).toFixed(0)}</p></div>
                <div className="p-2 rounded-lg bg-secondary"><p className="text-muted-foreground">Rewards/mo</p><p className="font-semibold text-green-500">+{(c.staked * c.apy / 100 / 12).toFixed(2)}</p></div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs">Stake More</Button>
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs text-green-500">Claim Rewards</Button>
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs text-destructive">Unstake</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "ibc" && (
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-secondary/30 text-xs text-muted-foreground">
            IBC (Inter-Blockchain Communication) enables trustless token transfers between Cosmos chains. Funds arrive in ~20-30 seconds.
          </div>
          {IBC_CHANNELS.map((ch, i) => (
            <div key={i} className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold">{ch.from}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-semibold">{ch.to}</span>
                <span className="ml-auto px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 text-[10px] font-semibold">{ch.status}</span>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Channel: <span className="font-mono">{ch.channel}</span></span>
                <span>Latency: {ch.latency}</span>
              </div>
            </div>
          ))}
          <Button className="w-full gap-2 bg-purple-600 hover:bg-purple-700" onClick={() => setIbcOpen(true)}><ArrowRight className="h-4 w-4" /> New IBC Transfer</Button>
        </div>
      )}

      <Dialog open={ibcOpen} onOpenChange={setIbcOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>IBC Transfer</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>From Chain</Label>
                <Select value={ibcForm.from} onValueChange={v => setIbcForm(f => ({ ...f, from: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{COSMOS_CHAINS.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>To Chain</Label>
                <Select value={ibcForm.to} onValueChange={v => setIbcForm(f => ({ ...f, to: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{COSMOS_CHAINS.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Token</Label>
              <Select value={ibcForm.token} onValueChange={v => setIbcForm(f => ({ ...f, token: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{COSMOS_CHAINS.map(c => <SelectItem key={c.symbol} value={c.symbol}>{c.symbol}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Recipient Address</Label><Input className="mt-1.5 font-mono text-xs" placeholder="cosmos1... or osmo1..." /></div>
            <div><Label>Amount</Label><Input type="number" className="mt-1.5" placeholder="0.00" value={ibcForm.amount} onChange={e => setIbcForm(f => ({ ...f, amount: e.target.value }))} /></div>
            <div className="p-3 rounded-xl bg-secondary/30 text-xs text-muted-foreground">
              <p>IBC Timeout: 10 minutes · Relayer Fee: ~0.01 {ibcForm.token}</p>
              <p className="mt-1">Estimated arrival: ~20-30 seconds</p>
            </div>
            <Button className="w-full bg-purple-600 hover:bg-purple-700">Send via IBC</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}