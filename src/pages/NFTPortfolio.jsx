// @ts-nocheck
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Image, Plus, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const CHAIN_COLORS = { ethereum: "bg-secondary text-muted-foreground", solana: "bg-secondary text-muted-foreground", polygon: "bg-secondary text-muted-foreground", base: "bg-secondary text-muted-foreground" };
const STATUS_COLORS = { holding: "bg-success/10 text-success", listed: "bg-caution/10 text-caution", sold: "bg-muted text-muted-foreground" };

export default function NFTPortfolio() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", collection: "", token_id: "", contract_address: "", chain: "ethereum", image_url: "", purchase_price: "", current_floor: "", status: "holding", note: "" });

  const { data: nfts = [], isLoading, isError } = useQuery({
    queryKey: ["nft-assets"],
    queryFn: () => base44.entities.NFTAsset.list("-created_date"),
  });

  const addNFT = useMutation({
    mutationFn: () => base44.entities.NFTAsset.create({
      ...form,
      purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : null,
      current_floor: form.current_floor ? parseFloat(form.current_floor) : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nft-assets"] });
      setShowAdd(false);
      setForm({ name: "", collection: "", token_id: "", contract_address: "", chain: "ethereum", image_url: "", purchase_price: "", current_floor: "", status: "holding", note: "" });
      toast.success("NFT added");
    },
  });

  const deleteNFT = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.NFTAsset.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nft-assets"] }),
  });

  const totalValueETH = nfts.filter(n => n.status !== "sold").reduce((s, n) => s + (n.current_floor || n.purchase_price || 0), 0);
  const totalPnlETH = nfts.reduce((s, n) => s + ((n.current_floor || 0) - (n.purchase_price || 0)), 0);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">NFT Portfolio</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track your NFT holdings</p>
        </div>
        <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1.5" /> Add NFT</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Holdings", value: `${nfts.filter(n => n.status === "holding").length}` },
          { label: "Portfolio Value", value: `${totalValueETH.toFixed(3)} ETH` },
          { label: "Unrealised P&L", value: `${totalPnlETH >= 0 ? "+" : ""}${totalPnlETH.toFixed(3)} ETH`, positive: totalPnlETH >= 0 },
        ].map(s => (
          <div key={s.label} className="p-4 rounded-xl border border-border bg-card text-center">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-base font-bold ${s.positive === false ? "text-destructive" : s.positive ? "text-success" : ""}`}>{s.value}</p>
            {s.sub && <p className="text-xs text-muted-foreground">{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* NFT Grid */}
      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : isError ? (
        <div className="text-center py-16 text-muted-foreground">
          <Image className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm text-destructive">Couldn't load your NFTs. Please try again.</p>
        </div>
      ) : nfts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Image className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No NFTs tracked yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {nfts.map(nft => {
            const pnl = (nft.current_floor || 0) - (nft.purchase_price || 0);
            return (
              <div key={nft.id} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="aspect-square bg-secondary flex items-center justify-center relative">
                  {nft.image_url ? (
                    <img src={nft.image_url} alt={nft.name} className="w-full h-full object-cover" />
                  ) : (
                    <Image className="h-8 w-8 text-muted-foreground opacity-40" />
                  )}
                  <span className={`absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[nft.status]}`}>{nft.status}</span>
                </div>
                <div className="p-3 space-y-1">
                  <p className="text-sm font-semibold truncate">{nft.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{nft.collection}</p>
                  <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full capitalize ${CHAIN_COLORS[nft.chain]}`}>{nft.chain}</span>
                  {nft.current_floor && (
                    <p className="text-xs font-medium pt-1">{nft.current_floor} ETH floor</p>
                  )}
                  {nft.purchase_price && nft.current_floor && (
                    <div className={`flex items-center gap-1 text-xs ${pnl >= 0 ? "text-success" : "text-destructive"}`}>
                      {pnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {pnl >= 0 ? "+" : ""}{pnl.toFixed(3)} ETH
                    </div>
                  )}
                  <Button variant="ghost" size="icon" aria-label="Delete NFT" className="text-destructive hover:bg-destructive/10 h-6 w-6 mt-1" onClick={() => deleteNFT.mutate(nft.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add NFT</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            {[
              { label: "NFT Name *", key: "name", placeholder: "Bored Ape #1234" },
              { label: "Collection *", key: "collection", placeholder: "Bored Ape Yacht Club" },
              { label: "Token ID", key: "token_id", placeholder: "1234" },
              { label: "Contract Address", key: "contract_address", placeholder: "0x..." },
              { label: "Image URL", key: "image_url", placeholder: "https://..." },
              { label: "Purchase Price (ETH)", key: "purchase_price", placeholder: "0.08", type: "number" },
              { label: "Current Floor (ETH)", key: "current_floor", placeholder: "0.12", type: "number" },
            ].map(f => (
              <div key={f.key}>
                <Label>{f.label}</Label>
                <Input type={f.type || "text"} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} className="mt-1" />
              </div>
            ))}
            <div>
              <Label id="nftp-chain-label">Chain</Label>
              <Select value={form.chain} onValueChange={v => setForm(p => ({ ...p, chain: v }))}>
                <SelectTrigger className="mt-1" aria-labelledby="nftp-chain-label"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["ethereum", "solana", "polygon", "base"].map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label id="nftp-status-label">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger className="mt-1" aria-labelledby="nftp-status-label"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["holding", "listed", "sold"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={() => addNFT.mutate()} disabled={!form.name || !form.collection || addNFT.isPending}>Add NFT</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}