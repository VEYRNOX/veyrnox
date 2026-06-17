import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Camera, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";


export default function PortfolioSnapshots() {
  const queryClient = useQueryClient();
  const [showSave, setShowSave] = useState(false);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");

  const { data: snapshots = [], isLoading } = useQuery({
    queryKey: ["portfolio-snapshots"],
    queryFn: () => base44.entities.PortfolioSnapshot.list("-created_date"),
  });

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });

  // Native balances grouped by currency — no stale USD conversion.
  const nativeBreakdown = wallets.reduce((acc, w) => {
    acc[w.currency] = (acc[w.currency] || 0) + (w.balance || 0);
    return acc;
  }, {});
  const walletCount = wallets.length;

  const saveSnapshot = useMutation({
    mutationFn: () => {
      return base44.entities.PortfolioSnapshot.create({
        label: label || format(new Date(), "dd MMM yyyy HH:mm"),
        total_usd: 0,
        breakdown: nativeBreakdown,
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
    mutationFn: (/** @type {any} */ id) => base44.entities.PortfolioSnapshot.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portfolio-snapshots"] }),
  });


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

      {/* Current holdings */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-1">
        <p className="text-xs text-muted-foreground mb-2">Current Holdings ({walletCount} wallet{walletCount !== 1 ? "s" : ""})</p>
        {Object.keys(nativeBreakdown).length === 0
          ? <p className="text-sm text-muted-foreground">No wallets yet</p>
          : Object.entries(nativeBreakdown).map(([cur, bal]) => (
            <div key={cur} className="flex justify-between text-sm">
              <span className="font-mono text-muted-foreground">{cur}</span>
              <span className="font-semibold">{bal.toFixed(6)}</span>
            </div>
          ))}
        <p className="text-[10px] text-muted-foreground pt-1">Snapshots store native balances — no stale USD conversion</p>
      </div>


      {/* Snapshot List */}
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
                  <p className="text-xs text-muted-foreground">{format(new Date(s.created_date), "dd MMM yyyy, HH:mm")}</p>
                  {s.note && <p className="text-xs text-muted-foreground italic">{s.note}</p>}
                </div>
                <div className="text-right shrink-0">
                  {s.breakdown && Object.keys(s.breakdown).length > 0
                    ? Object.entries(s.breakdown).slice(0, 3).map(([cur, bal]) => (
                      <p key={cur} className="text-xs font-mono">{Number(bal).toFixed(4)} {cur}</p>
                    ))
                    : <p className="text-xs text-muted-foreground">No breakdown</p>
                  }
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
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-1">
              <p className="text-xs text-muted-foreground">Native balances to snapshot ({walletCount} wallet{walletCount !== 1 ? "s" : ""})</p>
              {Object.entries(nativeBreakdown).map(([cur, bal]) => (
                <div key={cur} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{cur}</span>
                  <span className="font-semibold font-mono">{bal.toFixed(6)}</span>
                </div>
              ))}
            </div>
            <div>
              <Label>Label (optional)</Label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. End of Q2 2025" className="mt-1.5" />
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Any notes..." className="mt-1.5" />
            </div>
            <Button className="w-full" onClick={() => saveSnapshot.mutate()} disabled={saveSnapshot.isPending}>
              <Camera className="h-4 w-4 mr-1.5" /> Save Snapshot
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}