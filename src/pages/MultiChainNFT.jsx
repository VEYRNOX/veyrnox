import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Image, Plus, TrendingUp, TrendingDown, Grid3X3, List, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const CHAINS = [
  { id: "ethereum", label: "Ethereum", icon: "Ξ", color: "bg-blue-500/10 text-blue-400", marketplace: "https://opensea.io/assets/ethereum" },
  { id: "solana", label: "Solana", icon: "◎", color: "bg-purple-500/10 text-purple-400", marketplace: "https://magiceden.io" },
  { id: "polygon", label: "Polygon", icon: "⬟", color: "bg-purple-600/10 text-purple-500", marketplace: "https://opensea.io/assets/matic" },
  { id: "base", label: "Base", icon: "🔵", color: "bg-blue-400/10 text-blue-300", marketplace: "https://opensea.io/assets/base" },
  { id: "arbitrum", label: "Arbitrum", icon: "🔷", color: "bg-blue-600/10 text-blue-500", marketplace: "https://opensea.io/assets/arbitrum" },
];

const STATUS_STYLES = { holding: "bg-secondary text-muted-foreground", listed: "bg-caution/10 text-caution", sold: "bg-success/10 text-success" };

export default function MultiChainNFT() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [viewMode, setViewMode] = useState("grid");
  const [filterChain, setFilterChain] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [form, setForm] = useState({ name: "", collection: "", token_id: "", contract_address: "", chain: "ethereum", image_url: "", purchase_price: "", current_floor: "", status: "holding", note: "" });

  const { data: nfts = [], isError } = useQuery({ queryKey: ["nfts"], queryFn: () => base44.entities.NFTAsset.list("-created_date") });

  const filtered = nfts
    .filter(n => filterChain === "all" || n.chain === filterChain)
    .filter(n => filterStatus === "all" || n.status === filterStatus);

  const totalValue = nfts.filter(n => n.status === "holding" || n.status === "listed").reduce((s, n) => s + (n.current_floor || 0), 0);
  const totalCost = nfts.reduce((s, n) => s + (n.purchase_price || 0), 0);
  const unrealizedPnL = totalValue - totalCost;
  const chainCounts = CHAINS.reduce((m, c) => ({ ...m, [c.id]: nfts.filter(n => n.chain === c.id).length }), {});

  const add = useMutation({
    mutationFn: () => {
      return base44.entities.NFTAsset.create({ ...form, purchase_price: parseFloat(form.purchase_price) || 0, current_floor: parseFloat(form.current_floor) || 0 });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["nfts"] }); setShowAdd(false); setForm({ name: "", collection: "", token_id: "", contract_address: "", chain: "ethereum", image_url: "", purchase_price: "", current_floor: "", status: "holding", note: "" }); toast.success("NFT added"); },
  });

  const remove = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.NFTAsset.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["nfts"] }); toast.success("NFT removed"); },
  });

  const updateStatus = useMutation({
    mutationFn: (/** @type {any} */ vars) => base44.entities.NFTAsset.update(vars.id, { status: vars.status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nfts"] }),
  });

  const chain = (id) => CHAINS.find(c => c.id === id);

  const NFTCard = ({ n }) => {
    const pnl = (n.current_floor || 0) - (n.purchase_price || 0);
    const pnlPct = n.purchase_price ? (pnl / n.purchase_price * 100).toFixed(1) : 0;
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden group">
        <div className="relative aspect-square bg-secondary overflow-hidden flex items-center justify-center">
          {n.image_url ? (
            <img src={n.image_url} alt={n.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          ) : (
            <Image className="h-10 w-10 text-muted-foreground opacity-40" aria-hidden="true" />
          )}
          <div className="absolute top-2 left-2"><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${chain(n.chain)?.color || "bg-secondary text-muted-foreground"}`}>{chain(n.chain)?.icon} {chain(n.chain)?.label}</span></div>
          <div className="absolute top-2 right-2"><span className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[n.status]}`}>{n.status}</span></div>
        </div>
        <div className="p-3 space-y-1">
          <p className="text-xs text-muted-foreground truncate">{n.collection}</p>
          <p className="text-sm font-semibold truncate">{n.name}</p>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Floor: {n.current_floor || 0} ETH</span>
            <span className={pnl >= 0 ? "text-success" : "text-destructive"}>{pnl >= 0 ? "+" : ""}{pnlPct}%</span>
          </div>
          <div className="flex gap-1 pt-1">
            <Button variant="ghost" size="sm" className="flex-1 h-6 text-[10px]" onClick={() => updateStatus.mutate({ id: n.id, status: n.status === "holding" ? "listed" : "holding" })}>{n.status === "listed" ? "Delist" : "List"}</Button>
            <Button variant="ghost" size="sm" aria-label="Remove NFT" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => remove.mutate(n.id)}><Trash2 className="h-3 w-3" /></Button>
            <Button variant="ghost" size="sm" aria-label="View on marketplace" className="h-6 w-6 p-0 text-muted-foreground" onClick={() => window.open(`${chain(n.chain)?.marketplace}/${n.contract_address}/${n.token_id}`, "_blank")}><ExternalLink className="h-3 w-3" /></Button>
          </div>
        </div>
      </div>
    );
  };

  const NFTRow = ({ n }) => {
    const pnl = (n.current_floor || 0) - (n.purchase_price || 0);
    return (
      <div className="p-3 rounded-xl border border-border bg-card flex items-center gap-3">
        <div className="h-12 w-12 rounded-lg bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
          {n.image_url ? (
            <img src={n.image_url} alt={n.name} className="h-full w-full object-cover" />
          ) : (
            <Image className="h-5 w-5 text-muted-foreground opacity-40" aria-hidden="true" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{n.name}</p>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${chain(n.chain)?.color}`}>{chain(n.chain)?.label}</span>
            <span className="text-xs text-muted-foreground">{n.collection}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold">{n.current_floor || 0} ETH</p>
          <p className={`text-xs ${pnl >= 0 ? "text-success" : "text-destructive"}`}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(4)} ETH</p>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize shrink-0 ${STATUS_STYLES[n.status]}`}>{n.status}</span>
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Image className="h-6 w-6 text-primary" /> Multi-Chain NFTs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track your NFT portfolio across all chains</p>
        </div>
        <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1.5" /> Add NFT</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[{ label: "Portfolio Value", value: `${totalValue.toFixed(3)} ETH`, icon: Image, color: "text-primary" },
          { label: "Total Cost", value: `${totalCost.toFixed(3)} ETH`, icon: TrendingDown, color: "text-muted-foreground" },
          { label: "Unrealised P&L", value: `${unrealizedPnL >= 0 ? "+" : ""}${unrealizedPnL.toFixed(3)} ETH`, icon: unrealizedPnL >= 0 ? TrendingUp : TrendingDown, color: unrealizedPnL >= 0 ? "text-success" : "text-destructive" }].map(s => (
          <div key={s.label} className="p-3 rounded-xl border border-border bg-card text-center">
            <s.icon className={`h-4 w-4 mx-auto mb-1 ${s.color}`} />
            <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Chain breakdown */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setFilterChain("all")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 ${filterChain === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>All ({nfts.length})</button>
        {CHAINS.filter(c => chainCounts[c.id] > 0).map(c => (
          <button key={c.id} onClick={() => setFilterChain(c.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 ${filterChain === c.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
            {c.icon} {c.label} ({chainCounts[c.id]})
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 text-xs w-32" aria-label="Filter by status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {["holding","listed","sold"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-1 ml-auto">
          <Button variant={viewMode === "grid" ? "default" : "outline"} size="icon" aria-label="Grid view" className="h-8 w-8" onClick={() => setViewMode("grid")}><Grid3X3 className="h-3.5 w-3.5" /></Button>
          <Button variant={viewMode === "list" ? "default" : "outline"} size="icon" aria-label="List view" className="h-8 w-8" onClick={() => setViewMode("list")}><List className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {isError ? (
        <div className="text-center py-12 text-muted-foreground">
          <Image className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm text-destructive">Couldn't load your NFTs. Please try again.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Image className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No NFTs yet. Add your first NFT to get started.</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{filtered.map(n => <NFTCard key={n.id} n={n} />)}</div>
      ) : (
        <div className="space-y-2">{filtered.map(n => <NFTRow key={n.id} n={n} />)}</div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add NFT</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>NFT Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Bored Ape #1234" className="mt-1.5" /></div>
              <div><Label>Collection</Label><Input value={form.collection} onChange={e => setForm(f => ({ ...f, collection: e.target.value }))} placeholder="BAYC" className="mt-1.5" /></div>
            </div>
            <div><Label id="nft-chain-label">Chain</Label>
              <Select value={form.chain} onValueChange={v => setForm(f => ({ ...f, chain: v }))}>
                <SelectTrigger className="mt-1.5" aria-labelledby="nft-chain-label"><SelectValue /></SelectTrigger>
                <SelectContent>{CHAINS.map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Token ID</Label><Input value={form.token_id} onChange={e => setForm(f => ({ ...f, token_id: e.target.value }))} className="mt-1.5" /></div>
              <div><Label id="nft-status-label">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="mt-1.5" aria-labelledby="nft-status-label"><SelectValue /></SelectTrigger>
                  <SelectContent>{["holding","listed","sold"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Purchase Price (ETH)</Label><Input type="number" value={form.purchase_price} onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))} placeholder="0.00" className="mt-1.5" /></div>
              <div><Label>Current Floor (ETH)</Label><Input type="number" value={form.current_floor} onChange={e => setForm(f => ({ ...f, current_floor: e.target.value }))} placeholder="0.00" className="mt-1.5" /></div>
            </div>
            <div><Label>Contract Address</Label><Input value={form.contract_address} onChange={e => setForm(f => ({ ...f, contract_address: e.target.value }))} placeholder="0x..." className="mt-1.5 font-mono text-xs" /></div>
            <div><Label>Image URL (optional)</Label><Input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="https://..." className="mt-1.5" /></div>
            <Button className="w-full" onClick={() => add.mutate()} disabled={!form.name || !form.collection || add.isPending}>Add NFT</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}