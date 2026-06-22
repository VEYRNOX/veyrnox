import { useState, useMemo } from "react";
import { useWallet } from "@/lib/WalletProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { listSnapshots, saveSnapshot, deleteSnapshot } from "@/lib/snapshotStore";
import { Camera, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "@/lib/recharts";
import { toast } from "sonner";


export default function PortfolioSnapshots() {
  const { isUnlocked, walletAddresses } = useWallet();
  const { portfolio } = useAnalytics();
  const [showSave, setShowSave] = useState(false);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [, setTick] = useState(0);
  const bump = () => setTick(n => n + 1);

  // ALL hooks and derived values BEFORE any conditional return:
  const snapshots = useMemo(() => listSnapshots(walletAddresses), [walletAddresses, showSave]);
  const currentTotalUSD = portfolio?.grandTotal ?? 0;

  // Chart data (oldest first)
  const chartData = [...snapshots].reverse().map(s => ({
    date: new Date(s.created_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    value: s.total_usd,
    label: s.label,
  }));

  const latest = snapshots[0];
  const previous = snapshots[1];
  const change = latest && previous ? latest.total_usd - previous.total_usd : null;
  const changePct = change != null && previous ? (change / previous.total_usd) * 100 : null;

  if (!isUnlocked) {
    return (
      <div className="max-w-2xl mx-auto pt-10 text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Portfolio Snapshots</h1>
        <p className="text-sm text-muted-foreground">Unlock your wallet to manage snapshots.</p>
      </div>
    );
  }

  function handleSave() {
    const result = saveSnapshot(walletAddresses, portfolio, label, note);
    if (result) {
      toast.success('Snapshot saved');
    } else {
      toast.error('Could not save snapshot — wallet not unlocked');
    }
    setShowSave(false);
    setLabel(''); setNote('');
    bump();
  }

  function handleDelete(id) {
    deleteSnapshot(walletAddresses, id);
    bump();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Portfolio Snapshots</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Save and compare historical portfolio values</p>
        </div>
        <Button onClick={() => setShowSave(true)}>
          <Camera className="h-4 w-4 mr-1.5" /> Save Snapshot
        </Button>
      </div>

      {/* Current vs Last */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-xs text-muted-foreground mb-1">Current Value</p>
          <p className="text-xl font-bold">${currentTotalUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-xs text-muted-foreground mb-1">Since Last Snapshot</p>
          {change != null ? (
            <div className={`flex items-center gap-1 text-lg font-bold ${change >= 0 ? "text-success" : "text-destructive"}`}>
              {change >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              {change >= 0 ? "+" : ""}${Math.abs(change).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-sm">({changePct?.toFixed(1)}%)</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No data yet</p>
          )}
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 1 && (
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">Value Over Time</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip formatter={(v) => [`$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, "Portfolio"]} labelFormatter={l => l} />
              <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))", r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Snapshot List */}
      {snapshots.length === 0 ? (
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
                  <p className="text-xs text-muted-foreground">{new Date(s.created_date).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                  {s.note && <p className="text-xs text-muted-foreground italic">{s.note}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold">${s.total_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  {diff != null && (
                    <p className={`text-xs ${diff >= 0 ? "text-success" : "text-destructive"}`}>
                      {diff >= 0 ? "+" : ""}${diff.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                  )}
                </div>
                <Button variant="ghost" size="icon" aria-label="Delete snapshot" className="text-destructive hover:bg-destructive/10 shrink-0" onClick={() => handleDelete(s.id)}>
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
              <p className="text-xl font-bold">${currentTotalUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
            </div>
            <div>
              <Label>Label (optional)</Label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. End of Q2 2025" className="mt-1.5" />
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Any notes..." className="mt-1.5" />
            </div>
            <Button className="w-full" onClick={handleSave}>
              <Camera className="h-4 w-4 mr-1.5" /> Save Snapshot
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
