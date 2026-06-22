import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, Repeat, ShieldAlert, PenLine, Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import CoinLogo from "@/components/CoinLogo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { addDays, isBefore, formatDistanceToNow } from "date-fns";
import { isValidAddressForCurrency } from "@/lib/addressValidation";

const FREQ_LABELS = { daily: "Daily", weekly: "Weekly", biweekly: "Every 2 Weeks", monthly: "Monthly" };
const FREQ_DAYS = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };

const EMPTY = { label: "", wallet_id: "", currency: "USDT", to_address: "", amount: "", frequency: "monthly", note: "" };

function useNotificationPermission() {
  const [permission, setPermission] = useState(() =>
    "Notification" in window ? Notification.permission : "unsupported"
  );
  const request = async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };
  return { permission, request };
}

export default function RecurringPayments() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const { permission: notifPerm, request: requestNotif } = useNotificationPermission();

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["recurring-payments"],
    queryFn: () => base44.entities.RecurringPayment.list("-created_date"),
  });

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => base44.entities.Wallet.list(),
  });

  const addPayment = useMutation({
    mutationFn: () => {
      const nextRun = addDays(new Date(), FREQ_DAYS[form.frequency]).toISOString();
      const wallet = wallets.find(w => w.id === form.wallet_id);
      return base44.entities.RecurringPayment.create({ ...form, amount: parseFloat(form.amount), currency: wallet?.currency || form.currency, next_run_at: nextRun, status: "active" });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["recurring-payments"] }); setShowAdd(false); setForm(EMPTY); toast.success("Recurring payment created"); },
  });

  const toggleStatus = useMutation({
    mutationFn: (/** @type {any} */ vars) => base44.entities.RecurringPayment.update(vars.id, { status: vars.status === "active" ? "paused" : "active" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recurring-payments"] }),
  });

  const deletePayment = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.RecurringPayment.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["recurring-payments"] }); toast.success("Payment deleted"); },
  });

  // STUB — non-custodial: this feature only SCHEDULES reminders. It must never
  // move value on its own. Autonomous execution (mutating the wallet balance /
  // fabricating a confirmed tx without a user signature) was removed because it
  // breaks self-custody — every payment must be signed by the user through
  // wallet-core. Until the signed-payment flow is built, "due" payments hand off
  // to Send so the user signs each one manually. Do NOT reintroduce any path
  // that moves value without a signature. Rebuild (user-signed) before mainnet.
  const promptSignInSend = () => {
    toast.info("Recurring payments must be signed by you — opening Send to sign this payment manually.");
    navigate("/send");
  };

  // Fire a browser notification for each due active payment (once per session).
  useEffect(() => {
    if (notifPerm !== "granted" || payments.length === 0) return;
    const due = payments.filter(p => p.status === "active" && p.next_run_at && isBefore(new Date(p.next_run_at), new Date()));
    for (const p of due) {
      new Notification(`Recurring payment due: ${p.label}`, {
        body: `${p.amount} ${p.currency} to ${p.to_address.slice(0, 10)}… — open VEYRNOX to sign`,
        tag: `recurring-${p.id}`, // deduplicate per payment
        icon: "/icon-192.png",
      });
    }
  // Only re-fire when the payments list or permission changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifPerm, payments.length]);

  // Monthly estimate grouped per currency — cross-currency totals are meaningless.
  const monthlyByCurrency = payments
    .filter(p => p.status === "active")
    .reduce((acc, p) => {
      const mult = { daily: 30, weekly: 4.3, biweekly: 2.15, monthly: 1 }[p.frequency] || 1;
      acc[p.currency] = (acc[p.currency] || 0) + p.amount * mult;
      return acc;
    }, {});
  const monthlyEntries = Object.entries(monthlyByCurrency);

  // Validate recipient address against the selected currency before saving.
  // The effective currency follows the selected wallet (same logic as addPayment mutationFn).
  const effectiveCurrency = wallets.find(w => w.id === form.wallet_id)?.currency || form.currency;
  const trimmedToAddr = form.to_address.trim();
  const toAddrValid = isValidAddressForCurrency(trimmedToAddr, effectiveCurrency);
  const showToAddrError = trimmedToAddr.length > 0 && !toAddrValid;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Recurring Payments</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Automate regular crypto transfers</p>
        </div>
        <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1.5" /> New</Button>
      </div>

      <div className="flex items-start gap-3 rounded-2xl bg-caution/10 border border-caution/30 p-3">
        <ShieldAlert className="h-4 w-4 text-caution shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-caution">Non-custodial — schedules &amp; reminders only</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            This wallet never moves your funds on its own. Recurring payments are stored as
            schedules; when one is due you sign it manually in Send. Autonomous execution must
            be rebuilt as a user-signed flow before mainnet.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-xl border border-border bg-card text-center">
          <p className="text-xs text-muted-foreground mb-1">Active</p>
          <p className="text-lg font-bold">{payments.filter(p => p.status === "active").length}</p>
        </div>
        <div className="p-3 rounded-xl border border-border bg-card text-center">
          <p className="text-xs text-muted-foreground mb-1">Paused</p>
          <p className="text-lg font-bold">{payments.filter(p => p.status === "paused").length}</p>
        </div>
      </div>

      {/* Monthly estimate per currency */}
      {monthlyEntries.length > 0 && (
        <div className="p-3 rounded-xl border border-border bg-card space-y-1">
          <p className="text-xs text-muted-foreground">Monthly Estimate (active only)</p>
          {monthlyEntries.map(([cur, amt]) => (
            <div key={cur} className="flex justify-between text-sm">
              <span className="font-mono text-muted-foreground">{cur}</span>
              <span className="font-semibold">{amt.toFixed(4)}</span>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground pt-0.5">Shown per asset — cross-currency totals would be meaningless without live prices</p>
        </div>
      )}

      {/* Notification opt-in */}
      {notifPerm !== "unsupported" && (
        <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2">
            {notifPerm === "granted" ? <Bell className="h-4 w-4 text-success" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
            <div>
              <p className="text-sm font-medium">Due payment reminders</p>
              <p className="text-xs text-muted-foreground">
                {notifPerm === "granted" ? "Browser notifications enabled — you'll be alerted when a payment is due" : notifPerm === "denied" ? "Notifications blocked — allow them in browser settings" : "Enable to receive an alert when a payment falls due"}
              </p>
            </div>
          </div>
          {notifPerm === "default" && (
            <Button variant="outline" size="sm" className="shrink-0" onClick={requestNotif}>Enable</Button>
          )}
        </div>
      )}

      {isLoading ? <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        : payments.length === 0 ? (
          <div className="text-center py-14 text-muted-foreground">
            <Repeat className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No recurring payments set up</p>
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map(p => {
              const wallet = wallets.find(w => w.id === p.wallet_id);
              const isDue = p.next_run_at && isBefore(new Date(p.next_run_at), new Date());
              return (
                <div key={p.id} className={`p-4 rounded-xl border bg-card ${p.status === "active" ? "border-border" : "border-border/40 opacity-60"}`}>
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Repeat className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{p.label}</p>
                        {isDue && p.status === "active" && <span className="text-[10px] bg-caution/10 text-caution px-1.5 py-0.5 rounded-full">Due</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">{p.amount} {p.currency} · {FREQ_LABELS[p.frequency]}</p>
                      <p className="text-xs font-mono text-muted-foreground truncate">{p.to_address}</p>
                      {wallet && <p className="text-xs text-muted-foreground">From: {wallet.name}</p>}
                      <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                        {p.next_run_at && <span>Next: {formatDistanceToNow(new Date(p.next_run_at), { addSuffix: true })}</span>}
                        {p.run_count > 0 && <span>· {p.run_count} runs · {p.total_sent?.toFixed(4)} sent</span>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Switch checked={p.status === "active"} onCheckedChange={() => toggleStatus.mutate({ id: p.id, status: p.status })} />
                      {p.status === "active" && (
                        <Button variant="outline" size="sm" className="text-xs h-7 px-2 gap-1" onClick={promptSignInSend} title="Recurring payments must be signed by you — opens Send">
                          <PenLine className="h-3 w-3" /> Sign
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" aria-label="Delete recurring payment" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => deletePayment.mutate(p.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Recurring Payment</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Label</Label><Input value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} placeholder="e.g. Rent" className="mt-1.5" /></div>
            <div>
              <Label id="recurring-wallet-label">From Wallet</Label>
              <Select value={form.wallet_id} onValueChange={v => { const w = wallets.find(x => x.id === v); setForm(p => ({ ...p, wallet_id: v, currency: w?.currency || p.currency })); }}>
                <SelectTrigger className="mt-1.5" aria-labelledby="recurring-wallet-label"><SelectValue placeholder="Select wallet" /></SelectTrigger>
                <SelectContent>{wallets.map(w => <SelectItem key={w.id} value={w.id}><span className="flex items-center gap-2"><CoinLogo symbol={w.currency} size={18} />{w.name} — {w.balance} {w.currency}</span></SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="rp-to-address">Recipient Address</Label>
              <Input
                id="rp-to-address"
                value={form.to_address}
                onChange={e => setForm(p => ({ ...p, to_address: e.target.value }))}
                placeholder="0x..."
                className={`mt-1.5 font-mono text-sm${showToAddrError ? " border-destructive focus-visible:ring-destructive" : ""}`}
                aria-invalid={showToAddrError}
              />
              {showToAddrError && (
                <p className="text-xs text-destructive mt-1.5">Invalid {effectiveCurrency} address format</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount</Label><Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" className="mt-1.5" /></div>
              <div>
                <Label id="recurring-frequency-label">Frequency</Label>
                <Select value={form.frequency} onValueChange={v => setForm(p => ({ ...p, frequency: v }))}>
                  <SelectTrigger className="mt-1.5" aria-labelledby="recurring-frequency-label"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(FREQ_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Note (optional)</Label><Input value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} className="mt-1.5" /></div>
            <Button className="w-full" onClick={() => addPayment.mutate()} disabled={!form.label || !form.wallet_id || !form.to_address || !form.amount || showToAddrError || addPayment.isPending}>Create Payment</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}