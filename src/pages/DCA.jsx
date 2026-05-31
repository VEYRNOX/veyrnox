import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pause, Play, Trash2, RefreshCw, TrendingUp, Wallet, Clock } from "lucide-react";
import { toast } from "sonner";
import moment from "moment";
import CoinLogo from "@/components/CoinLogo";

const CURRENCY_COLORS = { BTC: "#F7931A", ETH: "#627EEA", USDT: "#26A17B", BNB: "#F3BA2F", SOL: "#9945FF", USDC: "#2775CA", XRP: "#0085C0", DOGE: "#C2A633", ADA: "#0033AD", TRX: "#EB0029" };
const CURRENCY_SYMBOLS = { BTC: "₿", ETH: "Ξ", USDT: "₮", BNB: "◈", SOL: "◎", USDC: "$", XRP: "✕", DOGE: "Ð", ADA: "₳", TRX: "T" };
const CURRENCIES = ["BTC", "ETH", "USDT", "BNB", "SOL", "USDC", "XRP", "DOGE", "ADA", "TRX"];
const FREQUENCIES = [
  { value: "daily",    label: "Daily" },
  { value: "weekly",   label: "Weekly" },
  { value: "biweekly", label: "Bi-Weekly" },
  { value: "monthly",  label: "Monthly" },
];
const USD_RATES = { BTC: 68000, ETH: 3200, USDT: 1, BNB: 590, SOL: 165, USDC: 1, XRP: 0.52, DOGE: 0.16, ADA: 0.45, TRX: 0.13 };

function getNextRunAt(frequency) {
  const d = new Date();
  if (frequency === "daily")     d.setDate(d.getDate() + 1);
  else if (frequency === "weekly")   d.setDate(d.getDate() + 7);
  else if (frequency === "biweekly") d.setDate(d.getDate() + 14);
  else if (frequency === "monthly")  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

function CurrencyBadge({ currency }) {
  return <CoinLogo symbol={currency} size={36} className="!rounded-xl" />;
}

export default function DCA() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);

  // Form state
  const [label, setLabel]           = useState("");
  const [frequency, setFrequency]   = useState("weekly");
  const [targetCurrency, setTargetCurrency]   = useState("BTC");
  const [fundingWalletId, setFundingWalletId] = useState("");
  const [targetWalletId, setTargetWalletId]   = useState("");
  const [amountPerRun, setAmountPerRun]       = useState("");

  const { data: schedules = [] } = useQuery({
    queryKey: ["dca-schedules"],
    queryFn: () => base44.entities.DCASchedule.list("-created_date"),
  });

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });

  const fundingWallet = wallets.find(w => w.id === fundingWalletId);
  const estimatedBuy = amountPerRun && fundingWallet
    ? (parseFloat(amountPerRun) * (USD_RATES[fundingWallet.currency] || 1)) / (USD_RATES[targetCurrency] || 1)
    : null;

  const createSchedule = useMutation({
    mutationFn: (data) => base44.entities.DCASchedule.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dca-schedules"] });
      setOpen(false);
      resetForm();
      toast.success("DCA schedule created");
    },
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }) => base44.entities.DCASchedule.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dca-schedules"] }),
  });

  const deleteSchedule = useMutation({
    mutationFn: (id) => base44.entities.DCASchedule.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dca-schedules"] }),
  });

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await base44.functions.invoke("executeDCA", {});
      queryClient.invalidateQueries({ queryKey: ["dca-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      toast.success(`Executed ${res.data.executed} DCA order${res.data.executed !== 1 ? "s" : ""}`);
    } catch {
      toast.error("Execution failed");
    } finally {
      setRunning(false);
    }
  };

  const resetForm = () => {
    setLabel(""); setFrequency("weekly"); setTargetCurrency("BTC");
    setFundingWalletId(""); setTargetWalletId(""); setAmountPerRun("");
  };

  const handleCreate = () => {
    const fw = wallets.find(w => w.id === fundingWalletId);
    createSchedule.mutate({
      label,
      target_currency: targetCurrency,
      funding_wallet_id: fundingWalletId,
      funding_currency: fw?.currency || "USDC",
      target_wallet_id: targetWalletId || undefined,
      amount_per_run: parseFloat(amountPerRun),
      frequency,
      status: "active",
      total_invested: 0,
      total_runs: 0,
      next_run_at: getNextRunAt(frequency),
    });
  };

  const active  = schedules.filter(s => s.status === "active");
  const paused  = schedules.filter(s => s.status === "paused");
  const canCreate = fundingWalletId && targetCurrency && parseFloat(amountPerRun) > 0;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">DCA</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Automate recurring crypto investments</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={runNow} disabled={running}>
            <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
            Run Now
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New Schedule
          </Button>
        </div>
      </div>

      {/* Summary row */}
      {schedules.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Active", value: active.length, color: "text-green-400" },
            { label: "Paused", value: paused.length, color: "text-yellow-400" },
            {
              label: "Total Invested",
              value: "$" + schedules.reduce((s, x) => s + ((x.total_invested || 0) * (USD_RATES[x.funding_currency] || 1)), 0).toLocaleString(undefined, { maximumFractionDigits: 0 }),
              color: "text-primary",
            },
          ].map(stat => (
            <div key={stat.label} className="p-3 rounded-xl bg-card border border-border text-center">
              <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Schedule list */}
      {schedules.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <TrendingUp className="h-7 w-7 text-primary" />
          </div>
          <p className="font-semibold">No DCA schedules yet</p>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Automatically buy crypto on a recurring schedule — daily, weekly, or monthly.
          </p>
          <Button onClick={() => setOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Create Schedule
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map(schedule => {
            const fw = wallets.find(w => w.id === schedule.funding_wallet_id);
            const isActive = schedule.status === "active";
            return (
              <div key={schedule.id} className="p-4 rounded-2xl border border-border bg-card space-y-3">
                <div className="flex items-center gap-3">
                  <CurrencyBadge currency={schedule.target_currency} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">
                        {schedule.label || `Buy ${schedule.target_currency}`}
                      </p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        isActive ? "bg-green-500/15 text-green-400" : "bg-yellow-500/15 text-yellow-400"
                      }`}>
                        {schedule.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {schedule.amount_per_run} {schedule.funding_currency} · {FREQUENCIES.find(f => f.value === schedule.frequency)?.label}
                      {fw && ` · from ${fw.name}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon" variant="ghost" className="h-8 w-8"
                      onClick={() => toggleStatus.mutate({ id: schedule.id, status: isActive ? "paused" : "active" })}
                    >
                      {isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteSchedule.mutate(schedule.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-secondary rounded-lg p-2">
                    <p className="font-semibold text-foreground">{schedule.total_runs || 0}</p>
                    <p className="text-muted-foreground">Runs</p>
                  </div>
                  <div className="bg-secondary rounded-lg p-2">
                    <p className="font-semibold text-foreground">
                      {schedule.total_invested ? `${schedule.total_invested} ${schedule.funding_currency}` : "—"}
                    </p>
                    <p className="text-muted-foreground">Invested</p>
                  </div>
                  <div className="bg-secondary rounded-lg p-2">
                    <div className="flex items-center justify-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <p className="font-semibold text-foreground">
                        {schedule.next_run_at ? moment(schedule.next_run_at).fromNow() : "Soon"}
                      </p>
                    </div>
                    <p className="text-muted-foreground">Next run</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New DCA Schedule</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <Label>Label (optional)</Label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Weekly BTC stack" className="mt-1.5" />
            </div>
            <div>
              <Label>Target Asset</Label>
              <Select value={targetCurrency} onValueChange={setTargetCurrency}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => (
                    <SelectItem key={c} value={c}>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ background: CURRENCY_COLORS[c] }} />
                        {c}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Funding Wallet</Label>
              <Select value={fundingWalletId} onValueChange={setFundingWalletId}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select wallet" /></SelectTrigger>
                <SelectContent>
                  {wallets.map(w => (
                    <SelectItem key={w.id} value={w.id}>
                      <span className="flex items-center gap-2"><CoinLogo symbol={w.currency} size={18} />{w.name} — {w.balance} {w.currency}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target Wallet (optional)</Label>
              <Select value={targetWalletId} onValueChange={setTargetWalletId}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Same as funding or new" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>None</SelectItem>
                  {wallets.filter(w => w.currency === targetCurrency).map(w => (
                    <SelectItem key={w.id} value={w.id}>
                      <span className="flex items-center gap-2"><CoinLogo symbol={w.currency} size={18} />{w.name} — {w.balance} {w.currency}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount per Run</Label>
              <Input
                type="number"
                value={amountPerRun}
                onChange={e => setAmountPerRun(e.target.value)}
                placeholder={`e.g. 50 ${fundingWallet?.currency || "USDC"}`}
                className="mt-1.5"
              />
              {estimatedBuy && (
                <p className="text-xs text-muted-foreground mt-1">
                  ≈ {estimatedBuy.toFixed(6)} {targetCurrency} per run
                </p>
              )}
            </div>
            <div>
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map(f => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              disabled={!canCreate || createSchedule.isPending}
              onClick={handleCreate}
            >
              {createSchedule.isPending ? "Creating…" : "Create Schedule"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}