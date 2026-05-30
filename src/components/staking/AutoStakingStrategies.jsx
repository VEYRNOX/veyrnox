import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Plus, Zap, TrendingUp, Pause, Play, Trash2, Repeat } from "lucide-react";
import moment from "moment";

const fmtUSD = (n) => "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmt    = (n, d = 4) => Number(n).toFixed(d);

const FREQ_LABELS = { daily: "Daily", weekly: "Weekly", biweekly: "Bi-weekly", monthly: "Monthly" };

export default function AutoStakingStrategies({ positions, wallets }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [strategyType, setStrategyType] = useState("auto_compound");
  const [selectedPositionId, setSelectedPositionId] = useState("");
  const [compoundFreq, setCompoundFreq] = useState("weekly");
  const [recurringAmount, setRecurringAmount] = useState("");
  const [recurringFreq, setRecurringFreq] = useState("weekly");
  const [label, setLabel] = useState("");

  const activePositions = positions.filter(p => p.status === "active");

  const { data: strategies = [], isLoading } = useQuery({
    queryKey: ["staking-strategies"],
    queryFn: () => base44.entities.StakingStrategy.list("-created_date"),
  });

  const createStrategy = useMutation({
    mutationFn: (data) => base44.entities.StakingStrategy.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staking-strategies"] });
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateStrategy = useMutation({
    mutationFn: ({ id, data }) => base44.entities.StakingStrategy.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staking-strategies"] }),
  });

  const deleteStrategy = useMutation({
    mutationFn: (id) => base44.entities.StakingStrategy.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staking-strategies"] }),
  });

  const resetForm = () => {
    setStrategyType("auto_compound");
    setSelectedPositionId("");
    setCompoundFreq("weekly");
    setRecurringAmount("");
    setRecurringFreq("weekly");
    setLabel("");
  };

  const selectedPosition = activePositions.find(p => p.id === selectedPositionId);

  const handleCreate = () => {
    if (!selectedPosition) return;
    const base = {
      position_id: selectedPosition.id,
      currency: selectedPosition.currency,
      validator_id: selectedPosition.validator_id,
      validator_name: selectedPosition.validator_name,
      apy: selectedPosition.apy,
      strategy_type: strategyType,
      label: label || (strategyType === "auto_compound" ? `Auto-compound ${selectedPosition.currency}` : `Recurring stake ${selectedPosition.currency}`),
      status: "active",
      total_compounded: 0,
      total_staked_via_strategy: 0,
    };
    if (strategyType === "auto_compound") {
      createStrategy.mutate({ ...base, compound_frequency: compoundFreq });
    } else {
      if (!recurringAmount || parseFloat(recurringAmount) <= 0) return;
      createStrategy.mutate({ ...base, recurring_amount: parseFloat(recurringAmount), recurring_frequency: recurringFreq });
    }
  };

  const toggleStatus = (s) => {
    updateStrategy.mutate({ id: s.id, data: { status: s.status === "active" ? "paused" : "active" } });
  };

  // Simulate next run date
  const nextRun = (s) => {
    const base = s.last_executed_at ? moment(s.last_executed_at) : moment(s.created_date);
    const freq = s.strategy_type === "auto_compound" ? s.compound_frequency : s.recurring_frequency;
    const map = { daily: [1, "days"], weekly: [7, "days"], biweekly: [14, "days"], monthly: [1, "months"] };
    const [amt, unit] = map[freq] || [7, "days"];
    return base.add(amt, unit);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Automate compounding and recurring contributions</p>
        <Button size="sm" className="gap-1.5 text-xs" onClick={() => setDialogOpen(true)} disabled={activePositions.length === 0}>
          <Plus className="h-3.5 w-3.5" /> New Strategy
        </Button>
      </div>

      {activePositions.length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm">
          You need an active staking position to set up a strategy.
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && strategies.length === 0 && activePositions.length > 0 && (
        <div className="text-center py-10 space-y-2">
          <Zap className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">No strategies yet</p>
          <p className="text-xs text-muted-foreground">Set up auto-compounding or recurring stakes.</p>
        </div>
      )}

      {strategies.map(s => (
        <div key={s.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                s.strategy_type === "auto_compound" ? "bg-blue-500/15" : "bg-purple-500/15"
              }`}>
                {s.strategy_type === "auto_compound"
                  ? <TrendingUp className="h-4 w-4 text-blue-400" />
                  : <Repeat className="h-4 w-4 text-purple-400" />}
              </div>
              <div>
                <p className="text-sm font-bold">{s.label}</p>
                <p className="text-[10px] text-muted-foreground">
                  {s.currency} · {s.validator_name} · {s.apy}% APY
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
              s.status === "active" ? "bg-green-500/15 text-green-400" : "bg-yellow-500/15 text-yellow-500"
            }`}>
              {s.status === "active" ? "● Active" : "⏸ Paused"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-secondary/50 p-2">
              <p className="text-[10px] text-muted-foreground">Type</p>
              <p className="font-semibold capitalize">{s.strategy_type === "auto_compound" ? "Auto-compound" : "Recurring Stake"}</p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-2">
              <p className="text-[10px] text-muted-foreground">Frequency</p>
              <p className="font-semibold">{FREQ_LABELS[s.compound_frequency || s.recurring_frequency] || "—"}</p>
            </div>
            {s.strategy_type === "recurring_stake" && (
              <div className="rounded-lg bg-secondary/50 p-2">
                <p className="text-[10px] text-muted-foreground">Amount / Run</p>
                <p className="font-semibold">{fmt(s.recurring_amount, 4)} {s.currency}</p>
              </div>
            )}
            {s.strategy_type === "auto_compound" && (
              <div className="rounded-lg bg-secondary/50 p-2">
                <p className="text-[10px] text-muted-foreground">Total Compounded</p>
                <p className="font-semibold text-blue-400">{fmt(s.total_compounded || 0, 6)} {s.currency}</p>
              </div>
            )}
            <div className="rounded-lg bg-secondary/50 p-2">
              <p className="text-[10px] text-muted-foreground">Next Run</p>
              <p className="font-semibold">{nextRun(s).format("MMM D")}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={() => toggleStatus(s)}>
              {s.status === "active" ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {s.status === "active" ? "Pause" : "Resume"}
            </Button>
            <Button
              variant="outline" size="sm"
              className="gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => deleteStrategy.mutate(s.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Staking Strategy</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <Label>Strategy Type</Label>
              <Select value={strategyType} onValueChange={setStrategyType}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto_compound">Auto-Compound Rewards</SelectItem>
                  <SelectItem value="recurring_stake">Recurring Stake</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Position</Label>
              <Select value={selectedPositionId} onValueChange={setSelectedPositionId}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select position..." /></SelectTrigger>
                <SelectContent>
                  {activePositions.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.validator_name} · {p.currency} · {p.apy}% APY
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Label (optional)</Label>
              <Input className="mt-1.5" placeholder="My auto-compound strategy" value={label} onChange={e => setLabel(e.target.value)} />
            </div>
            {strategyType === "auto_compound" ? (
              <div>
                <Label>Compound Frequency</Label>
                <Select value={compoundFreq} onValueChange={setCompoundFreq}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(FREQ_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div>
                  <Label>Amount per Run ({selectedPosition?.currency || "—"})</Label>
                  <Input className="mt-1.5" type="number" min="0" placeholder="0.00" value={recurringAmount} onChange={e => setRecurringAmount(e.target.value)} />
                </div>
                <div>
                  <Label>Frequency</Label>
                  <Select value={recurringFreq} onValueChange={setRecurringFreq}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(FREQ_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <Button
              className="w-full gap-2"
              disabled={!selectedPositionId || createStrategy.isPending || (strategyType === "recurring_stake" && (!recurringAmount || parseFloat(recurringAmount) <= 0))}
              onClick={handleCreate}
            >
              {createStrategy.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {createStrategy.isPending ? "Creating..." : "Create Strategy"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}