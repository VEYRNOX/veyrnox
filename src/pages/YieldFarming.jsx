import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Sprout, Plus, Flame, TrendingUp, Layers, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import moment from "moment";

const POOLS = [
  { protocol: "Uniswap v3", pool: "ETH/USDC", chain: "ethereum", apy: 18.4, tvl: "892M", risk: "low", assets: ["ETH","USDC"], icon: "🦄" },
  { protocol: "Curve", pool: "3pool", chain: "ethereum", apy: 6.2, tvl: "2.1B", risk: "low", assets: ["USDC","USDT","DAI"], icon: "🌀" },
  { protocol: "Raydium", pool: "SOL/USDC", chain: "solana", apy: 34.7, tvl: "124M", risk: "medium", assets: ["SOL","USDC"], icon: "⚡" },
  { protocol: "Balancer", pool: "BTC/ETH/USDC", chain: "ethereum", apy: 12.1, tvl: "310M", risk: "medium", assets: ["BTC","ETH","USDC"], icon: "⚖️" },
  { protocol: "Orca", pool: "SOL/ETH", chain: "solana", apy: 41.2, tvl: "56M", risk: "high", assets: ["SOL","ETH"], icon: "🐋" },
  { protocol: "Aerodrome", pool: "ETH/USDC", chain: "base", apy: 28.9, tvl: "78M", risk: "medium", assets: ["ETH","USDC"], icon: "✈️" },
  { protocol: "Velodrome", pool: "USDC/USDT", chain: "optimism", apy: 8.4, tvl: "245M", risk: "low", assets: ["USDC","USDT"], icon: "🚗" },
  { protocol: "GMX", pool: "GLP", chain: "arbitrum", apy: 22.3, tvl: "430M", risk: "high", assets: ["ETH","BTC","USDC"], icon: "🎯" },
];

const RISK_COLORS = { low: "text-green-400 bg-green-500/10", medium: "text-yellow-400 bg-yellow-500/10", high: "text-destructive bg-destructive/10" };
const CHAIN_COLORS = { ethereum: "bg-blue-500/10 text-blue-400", solana: "bg-purple-500/10 text-purple-400", base: "bg-blue-400/10 text-blue-300", optimism: "bg-red-500/10 text-red-400", arbitrum: "bg-blue-600/10 text-blue-500", polygon: "bg-purple-600/10 text-purple-500" };

export default function YieldFarming() {
  const queryClient = useQueryClient();
  const [showDeposit, setShowDeposit] = useState(null);
  const [amount, setAmount] = useState("");
  const [filterChain, setFilterChain] = useState("all");
  const [filterRisk, setFilterRisk] = useState("all");
  const [sortBy, setSortBy] = useState("apy");

  const { data: myPositions = [] } = useQuery({ queryKey: ["yield-farms"], queryFn: () => base44.entities.YieldFarmPosition.list("-created_date") });

  const activePositions = myPositions.filter(p => p.status === "active");
  const totalDeposited = activePositions.reduce((s, p) => s + (p.deposited_usd || 0), 0);
  const totalEarned = activePositions.reduce((s, p) => s + (p.rewards_earned_usd || 0), 0);
  const avgAPY = activePositions.length ? activePositions.reduce((s, p) => s + p.apy, 0) / activePositions.length : 0;

  const deposit = useMutation({
    mutationFn: () => base44.entities.YieldFarmPosition.create({
      protocol: showDeposit.protocol, pool_name: showDeposit.pool, chain: showDeposit.chain,
      asset_a: showDeposit.assets[0], asset_b: showDeposit.assets[1] || "",
      deposited_usd: parseFloat(amount), apy: showDeposit.apy, rewards_earned_usd: 0, status: "active",
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["yield-farms"] }); setShowDeposit(null); setAmount(""); toast.success("Deposited into pool"); },
  });

  const withdraw = useMutation({
    mutationFn: (id) => base44.entities.YieldFarmPosition.update(id, { status: "withdrawn" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["yield-farms"] }); toast.success("Withdrawn from pool"); },
  });

  const filtered = POOLS
    .filter(p => filterChain === "all" || p.chain === filterChain)
    .filter(p => filterRisk === "all" || p.risk === filterRisk)
    .sort((a, b) => sortBy === "apy" ? b.apy - a.apy : b.tvl.localeCompare(a.tvl));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Sprout className="h-6 w-6 text-primary" /> Yield Farming</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Discover and manage DeFi liquidity pools</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[{ label: "Deposited", value: `$${totalDeposited.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: "text-primary", icon: Layers },
          { label: "Total Earned", value: `$${totalEarned.toFixed(2)}`, color: "text-green-400", icon: TrendingUp },
          { label: "Avg APY", value: `${avgAPY.toFixed(1)}%`, color: "text-yellow-400", icon: Flame }].map(s => (
          <div key={s.label} className="p-3 rounded-xl border border-border bg-card text-center">
            <s.icon className={`h-4 w-4 mx-auto mb-1 ${s.color}`} />
            <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="discover">
        <TabsList className="w-full bg-secondary">
          <TabsTrigger value="discover" className="flex-1">Discover Pools</TabsTrigger>
          <TabsTrigger value="my" className="flex-1">My Positions ({activePositions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="discover" className="mt-3 space-y-3">
          {/* Filters */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Select value={filterChain} onValueChange={setFilterChain}>
              <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="Chain" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Chains</SelectItem>
                {["ethereum","solana","base","arbitrum","optimism","polygon"].map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterRisk} onValueChange={setFilterRisk}>
              <SelectTrigger className="h-7 text-xs w-28"><SelectValue placeholder="Risk" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risk</SelectItem>
                {["low","medium","high"].map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="apy">Sort: APY</SelectItem>
                <SelectItem value="tvl">Sort: TVL</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            {filtered.map(pool => (
              <div key={`${pool.protocol}-${pool.pool}`} className="p-4 rounded-xl border border-border bg-card flex items-center gap-3">
                <span className="text-2xl">{pool.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold">{pool.protocol} · {pool.pool}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize ${CHAIN_COLORS[pool.chain]}`}>{pool.chain}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize ${RISK_COLORS[pool.risk]}`}>{pool.risk}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">TVL: ${pool.tvl}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-green-400">{pool.apy}%</p>
                  <p className="text-[10px] text-muted-foreground">APY</p>
                </div>
                <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs" onClick={() => setShowDeposit(pool)}>Deposit</Button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="my" className="mt-3 space-y-3">
          {activePositions.length === 0 ? <p className="text-center text-muted-foreground py-8 text-sm">No active positions</p> : activePositions.map(p => (
            <div key={p.id} className="p-4 rounded-xl border border-border bg-card space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{p.protocol} · {p.pool_name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{p.chain} · {moment(p.created_date).fromNow()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">${p.deposited_usd.toLocaleString()}</p>
                  <p className="text-xs text-green-400">{p.apy}% APY</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Rewards earned: <span className="text-green-400 font-semibold">${p.rewards_earned_usd.toFixed(2)}</span></span>
                <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => withdraw.mutate(p.id)}>Withdraw</Button>
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={!!showDeposit} onOpenChange={() => setShowDeposit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Deposit — {showDeposit?.protocol} {showDeposit?.pool}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="p-3 rounded-lg bg-secondary space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">APY</span><span className="font-bold text-green-400">{showDeposit?.apy}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">TVL</span><span>${showDeposit?.tvl}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Risk</span><span className={`capitalize ${RISK_COLORS[showDeposit?.risk]?.split(" ")[0]}`}>{showDeposit?.risk}</span></div>
            </div>
            <div><Label>Amount (USD)</Label><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="mt-1.5" /></div>
            {amount && <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20 text-center text-xs text-green-400">Est. daily earnings: ${((parseFloat(amount) * showDeposit?.apy / 100) / 365).toFixed(4)}</div>}
            <Button className="w-full" onClick={() => deposit.mutate()} disabled={!amount || deposit.isPending}>Deposit</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}