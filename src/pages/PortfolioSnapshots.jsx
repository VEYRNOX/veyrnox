import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Camera, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { toast } from "sonner";
import moment from "moment";
import { isLivePricesEnabled, useLivePrices } from "@/lib/priceFeed";

const FMT2 = { maximumFractionDigits: 2 };
const FMT0 = { maximumFractionDigits: 0 };

export default function PortfolioSnapshots() {
  const queryClient = useQueryClient();
  const [showSave, setShowSave] = useState(false);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");

  const liveOn = isLivePricesEnabled();
  const { prices } = useLivePrices();

  const { data: snapshots = [], isLoading } = useQuery({
    queryKey: ["portfolio-snapshots"],
    queryFn: () => base44.entities.PortfolioSnapshot.list("-created_date"),
  });

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });

  // null when live prices are off — can't compute an honest USD total without them.
  const currentTotalUSD = liveOn
    ? wallets.reduce((s, w) => {
        const rate = prices?.[w.currency] ?? null;
        return rate != null ? s + (w.balance || 0) * rate : s;
      }, 0)
    : null;

  const saveSnapshot = useMutation({
    mutationFn: () => {
      const breakdown = {};
      let total = 0;
      wallets.forEach(w => {
        const rate = prices?.[w.currency] ?? null;
        if (rate == null) return;
        const usd = (w.balance || 0) * rate;
        breakdown[w.currency] = (breakdown[w.currency] || 0) + usd;
        total += usd;
      });
      return base44.entities.PortfolioSnapshot.create({
        label: label || moment().format("DD MMM YYYY HH:mm"),
        total_usd: total,
        breakdown,
        note,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio-snapshots"] });
      setShowSave(false);
      setLabel(""); setNote("");
      toast.success("Snapshot saved");
    },
  });

  const deleteSnapshot = useMutation({
    mutationFn: (id) => base44.entities.PortfolioSnapshot.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portfolio-snapshots"] }),
  });

  const chartData = [...snapshots].reverse().map(s => ({
    date: moment(s.created_date).format("DD MMM"),
    value: s.total_usd,
    label: s.label,
  }));

  const latest = snapshots[0];
  const previous = snapshots[1];
  const change = latest && previous ? latest.total_usd - previous.total_usd : null;
  const changePct = change != null && previous ? (change / previous.total_usd) * 100 : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Portfolio Snapshots</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Save and compare historical portfolio values</p>
        </div>
        <Button
          onClick={() => setShowSave(true)}
          disabled={!liveOn}
          title={!liveOn ? "Enable live prices to capture a snapshot" : undefined}
        >
          <Camera className="h-4 w-4 mr-1.5" /> Save Snapshot
        </Button>
      </div>

      {!liveOn && (
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Live prices are off — saving a new snapshot requires real-time prices to compute your USD portfolio value. Turn them on in <span className="font-medium text-foreground">Settings → Live Prices</span>. Existing snapshots are shown as saved.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-xs text-muted-foreground mb-1">Current Value</p>
          <p className="text-xl font-bold">
            {currentTotalUSD != null ? `$${currentTotalUSD.toLocaleString(undefined, FMT2)}` : "—"}
          </p>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-xs text-muted-foreground mb-1">Since Last Snapshot</p>
          {change != null ? (
            <div className={`flex items-center gap-1 text-lg font-bold ${change >= 0 ? "text-green-400" : "text-destructive"}`}>
              {change >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              {change >= 0 ? "+" : ""}${Math.abs(change).toLocaleString(undefined, FMT0)}
              <span className="text-sm">({changePct?.toFixed(1)}%)</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No data yet</p>
          )}
        </div>
      </div>

      {chartData.length > 1 && (
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">Value Over Time</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip formatter={(v) => [`$${v.toLocaleString(undefined, FMT2)}`, "Portfolio"]} labelFormatter={l => l} />
              <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))", r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : snapshots.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Camera className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No snapshots yet — save one now</p>
        </div>
      ) : (
        <div className="space-y-2">
          {snapshots.map((s, i) => {
            const prev = snapshots[i + 1];
            const diff = prev ? s.total_usd - prev.total_usd : null;
            return (
              <div key={s.id} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{s.label}</p>
                    {i === 0 && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Latest</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{moment(s.created_date).format("DD MMM YYYY, HH:mm")}</p>
                  {s.note && <p className="text-xs text-muted-foreground italic">{s.note}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold">${s.total_usd.toLocaleString(undefined, FMT0)}</p>
                  {diff != null && (
                    <p className={`text-xs ${diff >= 0 ? "text-green-400" : "text-destructive"}`}>
                      {diff >= 0 ? "+" : ""}${diff.toLocaleString(undefined, FMT0)}
                    </p>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 shrink-0" onClick={() => deleteSnapshot.mutate(s.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={showSave} onOpenChange={setShowSave}>
        <DialogContent>
          <DialogHeader><DialogTitle>Save Portfolio Snapshot</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-center">
              <p className="text-xs text-muted-foreground mb-1">Current value to snapshot</p>
              <p className="text-xl font-bold">
                {currentTotalUSD != null ? `$${currentTotalUSD.toLocaleString(undefined, FMT2)}` : "—"}
              </p>
            </div>
            <div>
              <Label>Label (optional)</Label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. End of Q2 2025" className="mt-1.5" />
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Any notes..." className="mt-1.5" />
            </div>
            <Button
              className="w-full"
              onClick={() => saveSnapshot.mutate()}
              disabled={saveSnapshot.isPending || currentTotalUSD == null}
            >
              <Camera className="h-4 w-4 mr-1.5" /> Save Snapshot
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
