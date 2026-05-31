import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Landmark, Plus, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import moment from "moment";
import { TOP_SYMBOLS } from "@/lib/cryptos";

// Demo APYs. Money-market coverage is intentionally uneven across the 10 assets:
// majors/stables are everywhere; MakerDAO stays limited to ETH/BTC/stables (its
// real scope). Assets a protocol doesn't list render as "—" in the table below.
const PROTOCOLS = [
  { name: "Aave", lend_apy: { USDC: 4.2, USDT: 3.8, ETH: 2.1, BTC: 1.8, SOL: 3.4, BNB: 2.6, XRP: 1.2, DOGE: 0.9, ADA: 1.5, TRX: 2.0 }, borrow_apy: { USDC: 6.1, USDT: 5.9, ETH: 3.2, BTC: 2.9, SOL: 5.1, BNB: 4.1, XRP: 2.4, DOGE: 2.0, ADA: 3.0, TRX: 3.6 }, color: "#B6509E", icon: "🔷" },
  { name: "Compound", lend_apy: { USDC: 3.9, USDT: 3.5, ETH: 1.9, BTC: 1.5, SOL: 2.9, BNB: 2.3, XRP: 1.0, DOGE: 0.7, ADA: 1.3, TRX: 1.8 }, borrow_apy: { USDC: 5.8, USDT: 5.4, ETH: 2.9, BTC: 2.5, SOL: 4.6, BNB: 3.8, XRP: 2.2, DOGE: 1.8, ADA: 2.7, TRX: 3.3 }, color: "#00D395", icon: "🟢" },
  { name: "MakerDAO", lend_apy: { USDC: 5.0, USDT: 4.5, ETH: 2.5, BTC: 2.0 }, borrow_apy: { USDC: 7.0, USDT: 6.5, ETH: 4.0, BTC: 3.5 }, color: "#F4B731", icon: "🟡" },
  { name: "Euler", lend_apy: { USDC: 4.8, USDT: 4.1, ETH: 2.3, BTC: 1.9, SOL: 3.1, BNB: 2.4, XRP: 1.1, DOGE: 0.8, ADA: 1.4, TRX: 1.9 }, borrow_apy: { USDC: 6.5, USDT: 6.0, ETH: 3.5, BTC: 3.0, SOL: 4.8, BNB: 3.9, XRP: 2.3, DOGE: 1.9, ADA: 2.8, TRX: 3.4 }, color: "#627EEA", icon: "🔵" },
];

const ASSETS = TOP_SYMBOLS;

export default function LendingBorrowing() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState("lend");
  const [form, setForm] = useState({ type: "lend", protocol: "Aave", asset: "USDC", amount: "", collateral_asset: "ETH", collateral_amount: "" });

  const { data: positions = [] } = useQuery({ queryKey: ["lending"], queryFn: () => base44.entities.LendingPosition.list("-created_date") });

  const lendPositions = positions.filter(p => p.type === "lend" && p.status === "active");
  const borrowPositions = positions.filter(p => p.type === "borrow" && p.status === "active");

  const totalLent = lendPositions.reduce((s, p) => s + (p.amount || 0), 0);
  const totalBorrowed = borrowPositions.reduce((s, p) => s + (p.amount || 0), 0);
  const avgLendAPY = lendPositions.length ? lendPositions.reduce((s, p) => s + p.apy, 0) / lendPositions.length : 0;

  const selectedProtocol = PROTOCOLS.find(p => p.name === form.protocol);
  const apy = form.type === "lend"
    ? selectedProtocol?.lend_apy[form.asset] || 0
    : selectedProtocol?.borrow_apy[form.asset] || 0;

  const create = useMutation({
    mutationFn: () => base44.entities.LendingPosition.create({
      type: form.type, protocol: form.protocol, asset: form.asset,
      amount: parseFloat(form.amount), apy,
      ...(form.type === "borrow" ? { collateral_asset: form.collateral_asset, collateral_amount: parseFloat(form.collateral_amount), health_factor: 1.8 } : {}),
      interest_accrued: 0, status: "active",
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["lending"] }); setShowCreate(false); setForm({ type: "lend", protocol: "Aave", asset: "USDC", amount: "", collateral_asset: "ETH", collateral_amount: "" }); toast.success("Position opened"); },
  });

  const close = useMutation({
    mutationFn: (id) => base44.entities.LendingPosition.update(id, { status: "closed" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["lending"] }); toast.success("Position closed"); },
  });

  const PositionCard = ({ p }) => (
    <div className={`p-4 rounded-xl border bg-card space-y-2 ${p.type === "borrow" && p.health_factor < 1.2 ? "border-destructive/50" : "border-border"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>{PROTOCOLS.find(x => x.name === p.protocol)?.icon}</span>
          <div>
            <p className="text-sm font-semibold">{p.protocol} · {p.asset}</p>
            <p className="text-xs text-muted-foreground">{moment(p.created_date).fromNow()}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold">{p.amount} {p.asset}</p>
          <p className={`text-xs font-semibold ${p.type === "lend" ? "text-green-400" : "text-destructive"}`}>{p.apy}% APY</p>
        </div>
      </div>
      {p.type === "borrow" && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Collateral: {p.collateral_amount} {p.collateral_asset}</span>
          <span className={`font-semibold ${p.health_factor < 1.2 ? "text-destructive" : "text-green-400"}`}>Health: {p.health_factor?.toFixed(2)}</span>
        </div>
      )}
      {p.type === "borrow" && p.health_factor < 1.2 && (
        <div className="flex gap-2 items-center text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> Liquidation risk — add collateral</div>
      )}
      <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={() => close.mutate(p.id)}>Close Position</Button>
    </div>
  );

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Landmark className="h-6 w-6 text-primary" /> Lending / Borrowing</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Earn yield or borrow against your crypto</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1.5" /> Open</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[{ label: "Total Lent", value: `$${totalLent.toFixed(0)}`, icon: TrendingUp, color: "text-green-400" },
          { label: "Total Borrowed", value: `$${totalBorrowed.toFixed(0)}`, icon: TrendingDown, color: "text-destructive" },
          { label: "Avg Lend APY", value: `${avgLendAPY.toFixed(1)}%`, icon: CheckCircle2, color: "text-primary" }].map(s => (
          <div key={s.label} className="p-3 rounded-xl border border-border bg-card text-center">
            <s.icon className={`h-4 w-4 mx-auto mb-1 ${s.color}`} />
            <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Protocol APY table */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <p className="text-sm font-semibold">Live APY Rates</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-border">
              <th className="text-left py-1.5 text-muted-foreground font-normal">Protocol</th>
              {ASSETS.map(a => <th key={a} className="text-center py-1.5 text-muted-foreground font-normal">{a}</th>)}
            </tr></thead>
            <tbody>{PROTOCOLS.map(p => (
              <tr key={p.name} className="border-b border-border/50 last:border-0">
                <td className="py-1.5 font-semibold">{p.icon} {p.name}</td>
                {ASSETS.map(a => (
                  <td key={a} className="py-1.5 text-center">
                    <div className="text-green-400">{p.lend_apy[a] || "—"}%</div>
                    <div className="text-destructive text-[10px]">{p.borrow_apy[a] || "—"}%</div>
                  </td>
                ))}
              </tr>
            ))}</tbody>
          </table>
          <p className="text-[10px] text-muted-foreground mt-1"><span className="text-green-400">Green</span> = Lend APY · <span className="text-destructive">Red</span> = Borrow APY</p>
        </div>
      </div>

      {/* Positions */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full bg-secondary">
          <TabsTrigger value="lend" className="flex-1">Lending ({lendPositions.length})</TabsTrigger>
          <TabsTrigger value="borrow" className="flex-1">Borrowing ({borrowPositions.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="lend" className="mt-3 space-y-3">
          {lendPositions.length === 0 ? <p className="text-center text-muted-foreground py-8 text-sm">No active lending positions</p> : lendPositions.map(p => <PositionCard key={p.id} p={p} />)}
        </TabsContent>
        <TabsContent value="borrow" className="mt-3 space-y-3">
          {borrowPositions.length === 0 ? <p className="text-center text-muted-foreground py-8 text-sm">No active borrowing positions</p> : borrowPositions.map(p => <PositionCard key={p.id} p={p} />)}
        </TabsContent>
      </Tabs>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Open Position</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-2">
              {["lend","borrow"].map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))} className={`p-2.5 rounded-xl border text-sm font-semibold capitalize transition-colors ${form.type === t ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"}`}>{t === "lend" ? "🟢 Lend" : "🔴 Borrow"}</button>
              ))}
            </div>
            <div><Label>Protocol</Label>
              <Select value={form.protocol} onValueChange={v => setForm(f => ({ ...f, protocol: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{PROTOCOLS.map(p => <SelectItem key={p.name} value={p.name}>{p.icon} {p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Asset</Label>
              <Select value={form.asset} onValueChange={v => setForm(f => ({ ...f, asset: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{ASSETS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Amount</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="mt-1.5" /></div>
            {form.type === "borrow" && <>
              <div><Label>Collateral Asset</Label>
                <Select value={form.collateral_asset} onValueChange={v => setForm(f => ({ ...f, collateral_asset: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{ASSETS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Collateral Amount</Label><Input type="number" value={form.collateral_amount} onChange={e => setForm(f => ({ ...f, collateral_amount: e.target.value }))} placeholder="0.00" className="mt-1.5" /></div>
            </>}
            {apy > 0 && <div className="p-3 rounded-lg bg-secondary text-center text-sm">APY: <span className={`font-bold ${form.type === "lend" ? "text-green-400" : "text-destructive"}`}>{apy}%</span></div>}
            <Button className="w-full" onClick={() => create.mutate()} disabled={!form.amount || create.isPending}>Open Position</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}