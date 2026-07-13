// @ts-nocheck
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Target, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { differenceInDays } from "date-fns";
import { safeFormat } from "@/lib/safeDate";

const EMOJIS = ["🎯","🏠","🚀","✈️","💎","🏖️","🎓","💻","🏋️","🎸"];

export default function SavingsGoals() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [depositId, setDepositId] = useState(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [form, setForm] = useState({ title: "", target_amount_usd: "", currency: "USDC", target_date: "", emoji: "🎯", note: "" });

  const { data: goals = [], isLoading, isError } = useQuery({
    queryKey: ["savings-goals"],
    queryFn: () => base44.entities.SavingsGoal.list(),
  });

  const create = useMutation({
    mutationFn: (/** @type {any} */ d) => {
      const target = parseFloat(d.target_amount_usd);
      if (!Number.isFinite(target) || target <= 0) throw new Error("Target amount must be a positive number");
      return base44.entities.SavingsGoal.create({ ...d, target_amount_usd: target, current_amount_usd: 0, status: "active" });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["savings-goals"] }); setOpen(false); setForm({ title: "", target_amount_usd: "", currency: "USDC", target_date: "", emoji: "🎯", note: "" }); },
  });

  const deposit = useMutation({
    mutationFn: (/** @type {any} */ vars) => {
      const amount = parseFloat(vars.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Deposit amount must be a positive number");
      return base44.entities.SavingsGoal.update(vars.id, { current_amount_usd: vars.current + amount });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["savings-goals"] }); setDepositId(null); setDepositAmount(""); },
  });

  const remove = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.SavingsGoal.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["savings-goals"] }),
  });

  const totalSaved = goals.reduce((s, g) => s + (g.current_amount_usd || 0), 0);
  const totalTarget = goals.reduce((s, g) => s + (g.target_amount_usd || 0), 0);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Target className="h-5 w-5 text-primary" /> Savings Goals</h1>
          <p className="text-sm text-muted-foreground">${totalSaved.toLocaleString()} saved of ${totalTarget.toLocaleString()} total target</p>
        </div>
        <Button onClick={() => setOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> New Goal</Button>
      </div>

      {/* Overall Progress */}
      {goals.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-2">
            <span>Overall Progress</span>
            <span>{totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0}%</span>
          </div>
          <Progress value={totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0} className="h-2" />
        </div>
      )}

      {/* Goals */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>
      ) : isError ? (
        <div className="text-center py-12 text-destructive text-sm">Couldn't load savings goals. Please try again.</div>
      ) : goals.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">🎯</p>
          <p className="text-muted-foreground text-sm">No savings goals yet</p>
          <Button className="mt-4" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Create Goal</Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {goals.map(goal => {
            const pct = goal.target_amount_usd > 0 ? Math.min((goal.current_amount_usd / goal.target_amount_usd) * 100, 100) : 0;
            const daysLeft = goal.target_date
              ? safeFormat(goal.target_date, d => differenceInDays(d, new Date()), null)
              : null;
            const done = pct >= 100;

            return (
              <div key={goal.id} className="bg-card border border-border rounded-2xl p-4">
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-2xl">{goal.emoji || "🎯"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{goal.title}</p>
                      {done && <CheckCircle2 className="h-4 w-4 text-success shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{goal.currency} · {daysLeft !== null ? `${daysLeft}d left` : "No deadline"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold">${(goal.current_amount_usd || 0).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">of ${goal.target_amount_usd?.toLocaleString()}</p>
                  </div>
                </div>
                <Progress value={pct} className="h-1.5 mb-3" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{Math.round(pct)}% complete</span>
                  <div className="flex gap-2">
                    {!done && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDepositId(goal.id)}>
                        <Plus className="h-3 w-3 mr-1" /> Deposit
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" aria-label={`Delete goal ${goal.title}`} onClick={() => remove.mutate(goal.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {depositId === goal.id && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                    <Input value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="Amount USD" className="h-8 text-xs flex-1" type="number" />
                    <Button size="sm" className="h-8 text-xs" onClick={() => deposit.mutate({ id: goal.id, current: goal.current_amount_usd || 0, amount: depositAmount })} disabled={!depositAmount}>
                      Add
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setDepositId(null)}>Cancel</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Savings Goal</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Choose Emoji</Label>
              <div className="flex gap-2 flex-wrap mt-1.5">
                {EMOJIS.map(e => (
                  <button key={e} onClick={() => setForm(f => ({ ...f, emoji: e }))}
                    className={`text-xl p-1.5 rounded-lg transition-colors ${form.emoji === e ? "bg-primary/20 ring-2 ring-primary" : "hover:bg-secondary"}`}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Goal Title</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Buy a MacBook" className="mt-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Target (USD)</Label>
                <Input value={form.target_amount_usd} onChange={e => setForm(f => ({ ...f, target_amount_usd: e.target.value }))} placeholder="5000" type="number" className="mt-1.5" />
              </div>
              <div>
                <Label id="savings-currency-label">Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger className="mt-1.5" aria-labelledby="savings-currency-label"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["BTC", "ETH", "USDT", "BNB", "SOL", "USDC", "XRP", "DOGE", "ADA", "TRX"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Target Date (optional)</Label>
              <Input value={form.target_date} onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))} type="date" className="mt-1.5" />
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Saving for..." className="mt-1.5" />
            </div>
            <Button className="w-full" disabled={!form.title || !form.target_amount_usd || create.isPending}
              onClick={() => create.mutate({ ...form, target_amount_usd: parseFloat(form.target_amount_usd) })}>
              {create.isPending ? "Creating..." : "Create Goal"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}