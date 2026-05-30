import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ShieldAlert, ShieldCheck, Plus, Trash2, AlertTriangle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MOCK = [
  { id: "m1", token_symbol: "USDC", token_contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", spender_name: "Uniswap V3", spender_address: "0xE592427A0AEce92De3Edee1F18E0157C05861564", approved_amount: "Unlimited", network: "Ethereum", risk_level: "low", status: "active", last_used: "2024-01-15" },
  { id: "m2", token_symbol: "WETH", token_contract: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", spender_name: "OpenSea", spender_address: "0x1E0049783F008A0085193E00003D00cd54003c71", approved_amount: "Unlimited", network: "Ethereum", risk_level: "medium", status: "active", last_used: "2023-11-02" },
  { id: "m3", token_symbol: "DAI", token_contract: "0x6B175474E89094C44Da98b954EedeAC495271d0F", spender_name: "Unknown Protocol", spender_address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD", approved_amount: "Unlimited", network: "Ethereum", risk_level: "high", status: "active", last_used: "2022-08-20" },
  { id: "m4", token_symbol: "USDT", token_contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7", spender_name: "Aave V3", spender_address: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2", approved_amount: "10,000", network: "Ethereum", risk_level: "low", status: "revoked", last_used: "2024-03-01" },
];

const RISK_CFG = {
  low: { cls: "bg-green-500/10 text-green-500", label: "Low Risk" },
  medium: { cls: "bg-yellow-500/10 text-yellow-500", label: "Medium Risk" },
  high: { cls: "bg-destructive/10 text-destructive", label: "High Risk" },
};

export default function TokenApprovals() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("active");
  const [form, setForm] = useState({ token_symbol: "", token_contract: "", spender_name: "", spender_address: "", approved_amount: "Unlimited", network: "Ethereum", risk_level: "low" });

  const { data: dbApprovals = [] } = useQuery({ queryKey: ["token-approvals"], queryFn: () => base44.entities.TokenApproval.list() });
  const approvals = dbApprovals.length > 0 ? dbApprovals : MOCK;

  const revoke = useMutation({
    mutationFn: (id) => dbApprovals.length > 0 ? base44.entities.TokenApproval.update(id, { status: "revoked" }) : Promise.resolve(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["token-approvals"] }),
  });

  const create = useMutation({
    mutationFn: (d) => base44.entities.TokenApproval.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["token-approvals"] }); setOpen(false); },
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.TokenApproval.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["token-approvals"] }),
  });

  const visible = approvals.filter(a => filter === "all" || a.status === filter);
  const activeHigh = approvals.filter(a => a.status === "active" && a.risk_level === "high").length;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Token Approval Manager</h1>
          <p className="text-sm text-muted-foreground">Review and revoke smart contract spend approvals</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Track Approval</Button>
      </div>

      {activeHigh > 0 && (
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-destructive">{activeHigh} high-risk approval{activeHigh > 1 ? "s" : ""} detected</p>
            <p className="text-xs text-muted-foreground mt-0.5">These approvals grant unlimited access to unknown protocols. Revoke immediately.</p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {["active", "revoked", "all"].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize border transition-colors ${filter === f ? "bg-primary text-primary-foreground border-transparent" : "bg-card border-border text-muted-foreground"}`}>{f}</button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground self-center">{visible.length} approval{visible.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="space-y-3">
        {visible.map(a => {
          const risk = RISK_CFG[a.risk_level] || RISK_CFG.low;
          return (
            <div key={a.id} className={`p-4 rounded-xl border bg-card ${a.status === "revoked" ? "opacity-50" : "border-border"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold">{a.token_symbol}</span>
                    <span className="text-muted-foreground text-xs">→</span>
                    <span className="text-sm font-medium">{a.spender_name || "Unknown"}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${risk.cls}`}>{risk.label}</span>
                    {a.status === "revoked" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-semibold">Revoked</span>}
                  </div>
                  <p className="text-xs font-mono text-muted-foreground truncate">{a.spender_address}</p>
                  <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                    <span>Allowance: <span className={a.approved_amount === "Unlimited" ? "text-destructive font-semibold" : "text-foreground"}>{a.approved_amount}</span></span>
                    <span>{a.network}</span>
                    {a.last_used && <span>Last used: {a.last_used}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {a.status === "active" ? (
                    <Button size="sm" variant="destructive" className="gap-1 text-xs h-8" onClick={() => revoke.mutate(a.id)}>
                      <ShieldAlert className="h-3.5 w-3.5" /> Revoke
                    </Button>
                  ) : (
                    <ShieldCheck className="h-5 w-5 text-green-500" />
                  )}
                  {dbApprovals.length > 0 && (
                    <button onClick={() => remove.mutate(a.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Track Token Approval</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Token Symbol</Label><Input className="mt-1.5" placeholder="USDC" value={form.token_symbol} onChange={e => setForm(f => ({ ...f, token_symbol: e.target.value }))} /></div>
              <div><Label>Network</Label>
                <Select value={form.network} onValueChange={v => setForm(f => ({ ...f, network: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Ethereum","BSC","Polygon","Arbitrum","Optimism"].map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Token Contract</Label><Input className="mt-1.5 font-mono text-xs" placeholder="0x..." value={form.token_contract} onChange={e => setForm(f => ({ ...f, token_contract: e.target.value }))} /></div>
            <div><Label>Spender / Protocol Name</Label><Input className="mt-1.5" placeholder="Uniswap V3" value={form.spender_name} onChange={e => setForm(f => ({ ...f, spender_name: e.target.value }))} /></div>
            <div><Label>Spender Address</Label><Input className="mt-1.5 font-mono text-xs" placeholder="0x..." value={form.spender_address} onChange={e => setForm(f => ({ ...f, spender_address: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Approved Amount</Label><Input className="mt-1.5" placeholder="Unlimited" value={form.approved_amount} onChange={e => setForm(f => ({ ...f, approved_amount: e.target.value }))} /></div>
              <div><Label>Risk Level</Label>
                <Select value={form.risk_level} onValueChange={v => setForm(f => ({ ...f, risk_level: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full" disabled={!form.token_symbol || !form.spender_address || create.isPending} onClick={() => create.mutate(form)}>Add Approval</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}