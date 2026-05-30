import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Users, TrendingUp, TrendingDown, Star, UserCheck, UserPlus, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const DEMO_TRADERS = [
  { display_name: "CryptoWhale_X", monthly_return: 24.5, all_time_return: 312, win_rate: 78, followers: 4821, risk_level: "high", assets: ["BTC","ETH","SOL"], bio: "Momentum trader. 5+ years DeFi experience." },
  { display_name: "StableGains", monthly_return: 8.2, all_time_return: 94, win_rate: 89, followers: 12403, risk_level: "low", assets: ["ETH","USDC"], bio: "Conservative yield strategies. Capital preservation first." },
  { display_name: "DeFi_Alpha", monthly_return: 18.9, all_time_return: 228, win_rate: 71, followers: 3102, risk_level: "medium", assets: ["ETH","SOL","USDC"], bio: "DeFi protocol specialist. LP and yield farming expert." },
  { display_name: "SolanaMaxi", monthly_return: 31.2, all_time_return: 480, win_rate: 65, followers: 2890, risk_level: "high", assets: ["SOL"], bio: "All-in Solana ecosystem trader." },
  { display_name: "BTC_Accumulator", monthly_return: 11.4, all_time_return: 156, win_rate: 82, followers: 7654, risk_level: "low", assets: ["BTC"], bio: "Long-term Bitcoin accumulation via DCA." },
];

const RISK_COLORS = { low: "text-green-400 bg-green-500/10", medium: "text-yellow-400 bg-yellow-500/10", high: "text-red-400 bg-red-500/10" };

export default function SocialTrading() {
  const queryClient = useQueryClient();
  const [following, setFollowing] = useState({});
  const [copyTarget, setCopyTarget] = useState(null);
  const [allocation, setAllocation] = useState("");
  const [filter, setFilter] = useState("all");

  const follow = (name) => {
    setFollowing(f => ({ ...f, [name]: !f[name] }));
    toast.success(following[name] ? `Unfollowed ${name}` : `Following ${name}`);
  };

  const startCopy = useMutation({
    mutationFn: () => base44.entities.SocialTrader.create({
      ...copyTarget,
      is_following: true,
      copy_allocation_usd: Number(allocation),
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["social-traders"] }); setCopyTarget(null); setAllocation(""); toast.success(`Copying ${copyTarget.display_name}!`); },
  });

  const { data: copying = [] } = useQuery({ queryKey: ["social-traders"], queryFn: () => base44.entities.SocialTrader.filter({ is_following: true }) });

  const filtered = DEMO_TRADERS.filter(t => filter === "all" || t.risk_level === filter);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Users className="h-6 w-6 text-primary" /> Social Trading</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Follow and copy top-performing traders automatically</p>
      </div>

      {copying.length > 0 && (
        <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
          <p className="text-xs font-semibold text-primary">Active Copy Trades ({copying.length})</p>
          {copying.map(t => (
            <div key={t.id} className="flex items-center justify-between text-sm">
              <span className="font-medium">{t.display_name}</span>
              <span className="text-muted-foreground">${t.copy_allocation_usd?.toLocaleString()} allocated</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        {["all","low","medium","high"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs capitalize transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map(trader => (
          <div key={trader.display_name} className="p-4 rounded-xl border border-border bg-card space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary text-sm">
                  {trader.display_name[0]}
                </div>
                <div>
                  <p className="font-semibold text-sm flex items-center gap-1.5">{trader.display_name}
                    {trader.win_rate > 80 && <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />}
                  </p>
                  <p className="text-xs text-muted-foreground">{trader.followers.toLocaleString()} followers</p>
                </div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${RISK_COLORS[trader.risk_level]}`}>{trader.risk_level} risk</span>
            </div>
            <p className="text-xs text-muted-foreground">{trader.bio}</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-secondary rounded-lg p-2">
                <p className={`text-sm font-bold ${trader.monthly_return >= 0 ? "text-green-400" : "text-destructive"}`}>+{trader.monthly_return}%</p>
                <p className="text-[10px] text-muted-foreground">30d return</p>
              </div>
              <div className="bg-secondary rounded-lg p-2">
                <p className="text-sm font-bold text-primary">+{trader.all_time_return}%</p>
                <p className="text-[10px] text-muted-foreground">All-time</p>
              </div>
              <div className="bg-secondary rounded-lg p-2">
                <p className="text-sm font-bold text-blue-400">{trader.win_rate}%</p>
                <p className="text-[10px] text-muted-foreground">Win rate</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => follow(trader.display_name)}>
                {following[trader.display_name] ? <><UserCheck className="h-3 w-3 mr-1 text-green-400" />Following</> : <><UserPlus className="h-3 w-3 mr-1" />Follow</>}
              </Button>
              <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => setCopyTarget(trader)}>
                <Zap className="h-3 w-3 mr-1" /> Copy Trade
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!copyTarget} onOpenChange={() => setCopyTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Copy {copyTarget?.display_name}</DialogTitle></DialogHeader>
          {copyTarget && (
            <div className="space-y-4 pt-2">
              <div className="p-3 rounded-lg bg-secondary text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Monthly Return</span><span className="text-green-400 font-bold">+{copyTarget.monthly_return}%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Win Rate</span><span className="font-bold">{copyTarget.win_rate}%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Risk Level</span><span className="capitalize">{copyTarget.risk_level}</span></div>
              </div>
              <div><Label>Copy Allocation (USD)</Label><Input type="number" value={allocation} onChange={e => setAllocation(e.target.value)} placeholder="e.g. 500" className="mt-1.5" /></div>
              <Button className="w-full" onClick={() => startCopy.mutate()} disabled={!allocation || startCopy.isPending}>Start Copying</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}