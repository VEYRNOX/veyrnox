// @ts-nocheck
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Activity, Hash, ArrowUpRight, ArrowDownLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "@/lib/recharts";
import { toast } from "@/lib/toast";
import { safeFormat } from "@/lib/safeDate";
import Spinner from "@/components/Spinner";

// Derive on-chain stats from internal transaction history
export default function OnChainAnalytics() {
  const [searchAddress, setSearchAddress] = useState("");
  const [searching, setSearching] = useState(false);
  const [addressData, setAddressData] = useState(null);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => base44.entities.Transaction.list("-created_date", 200),
  });

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });

  // Stats derived from internal txs
  const totalSent = transactions.filter(t => t.type === "send").reduce((s, t) => s + (t.amount || 0), 0);
  const totalReceived = transactions.filter(t => t.type === "receive").reduce((s, t) => s + (t.amount || 0), 0);
  const confirmedCount = transactions.filter(t => t.status === "confirmed").length;
  const failedCount = transactions.filter(t => t.status === "failed").length;
  // Deniability (CLAUDE.md "never show wallet count/list"): the summary tiles must
  // not publish wallets.length. "Pending" is a transaction-derived stat that
  // carries no wallet cardinality, so it replaces the former "Wallets" count tile.
  const pendingCount = transactions.filter(t => t.status !== "confirmed" && t.status !== "failed").length;

  // Daily volume chart
  const volumeByDay = {};
  transactions.forEach(t => {
    const day = safeFormat(t.created_date, "dd MMM");
    if (day === "—") return;
    volumeByDay[day] = (volumeByDay[day] || 0) + (t.amount || 0);
  });
  const volumeChart = Object.entries(volumeByDay).slice(-14).map(([date, volume]) => ({ date, volume: parseFloat(volume.toFixed(4)) }));

  // Per-currency breakdown
  const byCurrency = {};
  transactions.forEach(t => {
    if (!byCurrency[t.currency]) byCurrency[t.currency] = { sent: 0, received: 0, count: 0 };
    if (t.type === "send") byCurrency[t.currency].sent += t.amount || 0;
    else if (t.type === "receive") byCurrency[t.currency].received += t.amount || 0;
    byCurrency[t.currency].count += 1;
  });

  const lookupAddress = async () => {
    if (!searchAddress.trim()) return;
    setSearching(true);
    try {
      // Check if it's one of our own wallets
      const ownWallet = wallets.find(w => w.address?.toLowerCase() === searchAddress.toLowerCase());
      const txs = transactions.filter(t => t.to_address?.toLowerCase() === searchAddress.toLowerCase() || t.from_address?.toLowerCase() === searchAddress.toLowerCase());
      setAddressData({ address: searchAddress, isOwn: !!ownWallet, wallet: ownWallet, txCount: txs.length, txs: txs.slice(0, 5) });
    } catch {
      toast.error("Lookup failed");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Transaction History</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Activity from your local transaction records · no blockchain query is made</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Txs", value: transactions.length, icon: Activity },
          { label: "Confirmed", value: confirmedCount, icon: Activity },
          { label: "Failed", value: failedCount, icon: Activity },
          { label: "Pending", value: pendingCount, icon: Activity },
        ].map(s => (
          <div key={s.label} className="p-4 rounded-xl border border-border bg-card text-center">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className="text-xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Volume Chart */}
      {volumeChart.length > 1 && (
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">Daily Transaction Volume (14 days)</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={volumeChart}>
              <defs>
                <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Area type="monotone" dataKey="volume" stroke="hsl(var(--primary))" fill="url(#volGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-currency breakdown */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">By Currency</p>
        {Object.keys(byCurrency).length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions yet</p>
        ) : (
          Object.entries(byCurrency).map(([cur, d]) => (
            <div key={cur} className="flex items-center gap-3">
              <span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded w-14 text-center">{cur}</span>
              <div className="flex-1 grid grid-cols-3 gap-2 text-xs">
                <div><span className="text-muted-foreground">Sent </span><span className="font-medium text-destructive">{d.sent.toFixed(4)}</span></div>
                <div><span className="text-muted-foreground">Recv </span><span className="font-medium text-success">{d.received.toFixed(4)}</span></div>
                <div><span className="text-muted-foreground">Txs </span><span className="font-medium">{d.count}</span></div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Address Lookup */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Address Lookup</p>
        <div className="flex gap-2">
          <Input value={searchAddress} onChange={e => setSearchAddress(e.target.value)} placeholder="0x... or bc1q..." className="font-mono text-sm" onKeyDown={e => e.key === "Enter" && lookupAddress()} />
          <Button onClick={lookupAddress} disabled={searching} variant="outline" aria-label="Look up address">
            {searching ? <RefreshCw className="h-4 w-4 motion-safe:animate-spin" /> : <Hash className="h-4 w-4" />}
          </Button>
        </div>
        {addressData && (
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-xs font-mono truncate flex-1">{addressData.address}</p>
              {addressData.isOwn && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Your wallet</span>}
            </div>
            {addressData.wallet && <p className="text-xs text-muted-foreground">{addressData.wallet.name} · {addressData.wallet.currency}</p>}
            <p className="text-xs">Found in <span className="font-medium">{addressData.txCount}</span> transactions</p>
            {addressData.txs.map(tx => (
              <div key={tx.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                {tx.type === "send" ? <ArrowUpRight className="h-3 w-3 text-destructive" /> : <ArrowDownLeft className="h-3 w-3 text-success" />}
                <span className="capitalize">{tx.type}</span>
                <span className="font-medium text-foreground">{tx.amount} {tx.currency}</span>
                <span>{safeFormat(tx.created_date, "dd MMM")}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Recent Transactions</p>
        {isLoading ? <Spinner className="py-6" />
          : transactions.slice(0, 15).map(tx => (
          <div key={tx.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${tx.type === "send" ? "bg-destructive/10" : "bg-success/10"}`}>
              {tx.type === "send" ? <ArrowUpRight className="h-4 w-4 text-destructive" /> : <ArrowDownLeft className="h-4 w-4 text-success" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono truncate text-muted-foreground">{tx.tx_hash || "—"}</p>
              <p className="text-[10px] text-muted-foreground">{safeFormat(tx.created_date, "dd MMM yyyy HH:mm")}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-sm font-semibold ${tx.type === "send" ? "text-destructive" : "text-success"}`}>{tx.type === "send" ? "-" : "+"}{tx.amount} {tx.currency}</p>
              <span className={`text-[10px] ${tx.status === "confirmed" ? "text-success" : tx.status === "failed" ? "text-destructive" : "text-caution"}`}>{tx.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}