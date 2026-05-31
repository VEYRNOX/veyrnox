import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Copy, Check, Trash2, Eye, EyeOff, Share2, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const USD_RATES = { BTC: 68000, ETH: 3200, USDT: 1, BNB: 590, SOL: 165, USDC: 1, XRP: 0.52, DOGE: 0.16, ADA: 0.45, TRX: 0.13 };
const COLORS = ["#f97316", "#3b82f6", "#22c55e", "#a855f7", "#eab308"];

export default function SharedPortfolioView() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(null);
  const [form, setForm] = useState({ label: "", show_amounts: false, show_pnl: false });

  const { data: wallets = [] } = useQuery({ queryKey: ["wallets"], queryFn: () => base44.entities.Wallet.list() });
  const { data: shares = [] } = useQuery({ queryKey: ["portfolio-shares"], queryFn: () => base44.entities.PortfolioShare.list("-created_date") });

  const totalUSD = wallets.reduce((s, w) => s + (w.balance || 0) * (USD_RATES[w.currency] || 1), 0);
  const allocation = wallets.map(w => ({ name: w.currency, value: parseFloat(((w.balance || 0) * (USD_RATES[w.currency] || 1) / (totalUSD || 1) * 100).toFixed(1)) })).filter(a => a.value > 0);

  const create = useMutation({
    mutationFn: () => {
      const shareId = Math.random().toString(36).slice(2, 10);
      return base44.entities.PortfolioShare.create({ ...form, share_id: shareId, allocation_snapshot: allocation });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["portfolio-shares"] }); setOpen(false); setForm({ label: "", show_amounts: false, show_pnl: false }); },
  });

  const revoke = useMutation({
    mutationFn: (id) => base44.entities.PortfolioShare.update(id, { status: "revoked" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portfolio-shares"] }),
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.PortfolioShare.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portfolio-shares"] }),
  });

  const getShareUrl = (share) => `${window.location.origin}?portfolio=${share.share_id}`;

  const copyLink = (share) => { navigator.clipboard.writeText(getShareUrl(share)); setCopied(share.id); setTimeout(() => setCopied(null), 2000); };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Shared Portfolio View</h1>
          <p className="text-sm text-muted-foreground">Share your allocation publicly without exposing wallet addresses</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Create Link</Button>
      </div>

      {/* Portfolio preview */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <p className="text-sm font-semibold mb-3">Current Portfolio (Allocation Only)</p>
        <div className="flex items-center gap-4">
          <ResponsiveContainer width="45%" height={140}>
            <PieChart><Pie data={allocation} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value">
              {allocation.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie><Tooltip formatter={v => [`${v}%`, "Allocation"]} /></PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-1.5">
            {allocation.map((a, i) => (
              <div key={a.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{a.name}</div>
                <span className="font-semibold">{a.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Share links */}
      {shares.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Share2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No share links yet</p>
          <p className="text-sm mt-1">Create a read-only link to show your portfolio allocation to others</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shares.map(share => (
            <div key={share.id} className={`p-4 rounded-xl border bg-card ${share.status === "revoked" ? "opacity-50" : "border-border"}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{share.label}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${share.status === "active" ? "bg-green-500/10 text-green-500" : "bg-destructive/10 text-destructive"}`}>{share.status}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                    {share.show_amounts && <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> Amounts visible</span>}
                    <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> {share.views || 0} views</span>
                    <span>{new Date(share.created_date).toLocaleDateString("en-GB")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {share.status === "active" && (
                    <button onClick={() => copyLink(share)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                      {copied === share.id ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </button>
                  )}
                  {share.status === "active" && (
                    <button onClick={() => revoke.mutate(share.id)} className="p-1.5 rounded-lg hover:bg-yellow-500/10 text-muted-foreground hover:text-yellow-500 transition-colors" title="Revoke">
                      <EyeOff className="h-4 w-4" />
                    </button>
                  )}
                  <button onClick={() => remove.mutate(share.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {share.status === "active" && (
                <div className="mt-2 flex items-center gap-2 bg-secondary rounded-lg p-2 text-xs font-mono">
                  <span className="flex-1 truncate text-muted-foreground">{getShareUrl(share)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Share Link</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div><Label>Label</Label><Input className="mt-1.5" placeholder="e.g. Public Portfolio Q2 2024" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} /></div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium">Show Dollar Amounts</p><p className="text-xs text-muted-foreground">Reveal USD values to viewers</p></div>
                <Switch checked={form.show_amounts} onCheckedChange={v => setForm(f => ({ ...f, show_amounts: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium">Show Profit / Loss</p><p className="text-xs text-muted-foreground">Include profit and loss data</p></div>
                <Switch checked={form.show_pnl} onCheckedChange={v => setForm(f => ({ ...f, show_pnl: v }))} />
              </div>
            </div>
            <div className="p-3 rounded-lg bg-secondary/50 border border-border text-xs text-muted-foreground">
              ✓ Wallet addresses are never included in share links<br />
              ✓ Allocation percentages only (unless amounts enabled)<br />
              ✓ Revocable at any time
            </div>
            <Button className="w-full" disabled={!form.label || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "Creating..." : "Generate Share Link"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}