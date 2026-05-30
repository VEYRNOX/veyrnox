import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Trophy, TrendingUp, Users, Medal } from "lucide-react";

const MOCK_LEADERS = [
  { rank: 1, name: "CryptoWhale_99", avatar: "🐳", return_30d: 34.2, return_alltime: 412.5, followers: 1240, risk: "high", badge: "🥇" },
  { rank: 2, name: "SatoshiMaster", avatar: "🧙", return_30d: 28.7, return_alltime: 289.1, followers: 892, risk: "medium", badge: "🥈" },
  { rank: 3, name: "ETH_Hodler", avatar: "💎", return_30d: 21.3, return_alltime: 198.4, followers: 654, risk: "low", badge: "🥉" },
  { rank: 4, name: "DeFi_Queen", avatar: "👑", return_30d: 18.9, return_alltime: 175.2, followers: 423, risk: "high", badge: null },
  { rank: 5, name: "BlockchainBob", avatar: "🤖", return_30d: 15.4, return_alltime: 143.7, followers: 312, risk: "medium", badge: null },
  { rank: 6, name: "AltcoinAlex", avatar: "🚀", return_30d: 12.8, return_alltime: 121.3, followers: 278, risk: "high", badge: null },
  { rank: 7, name: "StableSteve", avatar: "📊", return_30d: 9.2, return_alltime: 98.6, followers: 201, risk: "low", badge: null },
  { rank: 8, name: "YieldFarmer", avatar: "🌾", return_30d: 7.6, return_alltime: 87.4, followers: 189, risk: "medium", badge: null },
  { rank: 9, name: "NftNinja", avatar: "🗡️", return_30d: 5.3, return_alltime: 64.2, followers: 145, risk: "high", badge: null },
  { rank: 10, name: "PassiveIncome_P", avatar: "😴", return_30d: 4.1, return_alltime: 52.8, followers: 123, risk: "low", badge: null },
];

const RISK_CFG = { high: "text-destructive bg-destructive/10", medium: "text-yellow-500 bg-yellow-500/10", low: "text-green-500 bg-green-500/10" };

export default function Leaderboard() {
  const [period, setPeriod] = useState("30d");
  const [riskFilter, setRiskFilter] = useState("all");

  const { data: traders = [] } = useQuery({ queryKey: ["social-traders"], queryFn: () => base44.entities.SocialTrader.list("-monthly_return", 20) });

  const allTraders = traders.length > 0 ? traders.map((t, i) => ({ rank: i + 1, name: t.display_name, avatar: "👤", return_30d: t.monthly_return || 0, return_alltime: t.all_time_return || 0, followers: t.followers || 0, risk: t.risk_level, badge: i < 3 ? ["🥇","🥈","🥉"][i] : null })) : MOCK_LEADERS;

  const filtered = allTraders.filter(t => riskFilter === "all" || t.risk === riskFilter);
  const getReturn = (t) => period === "30d" ? t.return_30d : t.return_alltime;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div><h1 className="text-xl font-bold">Portfolio Leaderboard</h1><p className="text-sm text-muted-foreground">Top performing traders — opt-in, anonymised by default</p></div>

      <div className="grid grid-cols-3 gap-3">
        {[{ rank: 1, ...allTraders[0] }, { rank: 2, ...allTraders[1] }, { rank: 3, ...allTraders[2] }].map(t => (
          <div key={t.rank} className={`p-4 rounded-xl border text-center ${t.rank === 1 ? "border-yellow-500/30 bg-yellow-500/5" : "border-border bg-card"}`}>
            <p className="text-2xl">{t.badge}</p>
            <p className="text-xs font-medium mt-1 truncate">{t.name}</p>
            <p className="font-bold text-green-500">{t.return_30d >= 0 ? "+" : ""}{t.return_30d?.toFixed(1)}%</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1">
          {["30d", "all"].map(p => <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${period === p ? "bg-primary text-primary-foreground border-transparent" : "bg-card border-border text-muted-foreground"}`}>{p === "30d" ? "30 Days" : "All Time"}</button>)}
        </div>
        <div className="flex gap-1">
          {["all", "low", "medium", "high"].map(r => <button key={r} onClick={() => setRiskFilter(r)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize ${riskFilter === r ? "bg-primary text-primary-foreground border-transparent" : "bg-card border-border text-muted-foreground"}`}>{r}</button>)}
        </div>
      </div>

      <div className="space-y-2">
        {filtered.map(t => (
          <div key={t.rank} className={`p-4 rounded-xl border bg-card flex items-center gap-3 ${t.rank <= 3 ? "border-primary/20" : "border-border"}`}>
            <p className="text-lg w-6 text-center shrink-0">{t.badge || <span className="text-sm font-semibold text-muted-foreground">{t.rank}</span>}</p>
            <div className="text-2xl shrink-0">{t.avatar}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{t.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold capitalize ${RISK_CFG[t.risk]}`}>{t.risk} risk</span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Users className="h-2.5 w-2.5" />{t.followers}</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className={`font-bold ${getReturn(t) >= 0 ? "text-green-500" : "text-destructive"}`}>{getReturn(t) >= 0 ? "+" : ""}{getReturn(t)?.toFixed(1)}%</p>
              <p className="text-[10px] text-muted-foreground">{period === "30d" ? "30 days" : "all time"}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}