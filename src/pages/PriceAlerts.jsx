import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { fetchMarketPricesUsd, MARKET_SYMBOLS } from "@/lib/cryptoCompare.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bell, Plus, Trash2, TrendingUp, TrendingDown, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import moment from "moment";

const CURRENCY_COLORS = { BTC: "#F7931A", ETH: "#627EEA", USDT: "#26A17B", BNB: "#F3BA2F", SOL: "#9945FF", USDC: "#2775CA", XRP: "#0085C0", DOGE: "#C2A633", ADA: "#0033AD", TRX: "#EB0029" };

export default function PriceAlerts() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState("BTC");
  const [direction, setDirection] = useState("above");
  const [targetPrice, setTargetPrice] = useState("");
  const [alertType, setAlertType] = useState("price");
  const [volatilityPct, setVolatilityPct] = useState("");
  const [note, setNote] = useState("");
  const [checking, setChecking] = useState(false);
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );

  const requestNotifPermission = async () => {
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
  };

  const { data: alerts = [] } = useQuery({
    queryKey: ["price-alerts"],
    queryFn: () => base44.entities.PriceAlert.list("-created_date"),
  });

  const { data: prices = {} } = useQuery({
    queryKey: ["live-prices"],
    queryFn: fetchMarketPricesUsd,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const createAlert = useMutation({
    mutationFn: (/** @type {any} */ data) => base44.entities.PriceAlert.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-alerts"] });
      setOpen(false);
      setTargetPrice(""); setNote("");
      toast.success("Alert created");
    },
  });

  const deleteAlert = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.PriceAlert.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["price-alerts"] }),
  });

  const dismissAlert = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.PriceAlert.update(id, { status: "dismissed" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["price-alerts"] }),
  });

  // Evaluate alerts client-side against the live price feed (the same
  // cryptocompare endpoint this page already polls — no new endpoint, no
  // backend). This replaces the old `checkPriceAlerts` server function: the
  // server iterated every user's alerts on a schedule; here we check only THIS
  // device's alerts, on demand. Volatility alerts are left to the in-app poller
  // (usePriceAlertNotifier) which needs two samples to measure a swing.
  const checkNow = async () => {
    setChecking(true);
    try {
      const livePrices = await fetchMarketPricesUsd();
      const active = await base44.entities.PriceAlert.filter({ status: "active" });
      let triggered = 0;
      for (const alert of active) {
        if (alert.alert_type === "volatility") continue;
        const price = livePrices[alert.currency];
        if (price == null) continue;
        const hit =
          (alert.direction === "above" && price >= alert.target_price) ||
          (alert.direction === "below" && price <= alert.target_price);
        if (hit) {
          await base44.entities.PriceAlert.update(alert.id, {
            status: "triggered",
            triggered_at: new Date().toISOString(),
            triggered_price: price,
          });
          triggered++;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["price-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["live-prices"] });
      toast.success(`Checked ${active.length} alert${active.length === 1 ? "" : "s"} — ${triggered} triggered`);
    } catch {
      toast.error("Check failed — could not reach the price feed.");
    } finally {
      setChecking(false);
    }
  };

  const activeAlerts = alerts.filter(a => a.status === "active");
  const triggeredAlerts = alerts.filter(a => a.status === "triggered");
  const dismissedAlerts = alerts.filter(a => a.status === "dismissed");

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Push notification permission banner */}
      {notifPermission !== "granted" && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/10 border border-primary/30">
          <Bell className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Enable Push Notifications</p>
            <p className="text-xs text-muted-foreground">
              {notifPermission === "denied"
                ? "Blocked in browser settings — please allow notifications for this site."
                : "Get instant browser alerts when your price targets are hit."}
            </p>
          </div>
          {notifPermission !== "denied" && (
            <Button size="sm" onClick={requestNotifPermission} className="shrink-0">Enable</Button>
          )}
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Price Alerts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Get notified when prices hit your targets</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={checkNow} disabled={checking}>
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} /> Check Now
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Add Alert
          </Button>
        </div>
      </div>

      {/* Live prices ticker */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {MARKET_SYMBOLS.map(c => (
          <div key={c} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border">
            <div className="h-2 w-2 rounded-full" style={{ background: CURRENCY_COLORS[c] }} />
            <span className="text-xs font-mono font-semibold">{c}</span>
            <span className="text-xs text-muted-foreground">${prices[c]?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "—"}</span>
          </div>
        ))}
      </div>

      {/* Honest scope: this is an on-device check, not a server push. */}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Alerts are checked on this device — automatically every minute while the app is open, and instantly with <span className="font-medium text-foreground">Check Now</span>. Firing while the app is fully closed would need a push server, which this local build doesn't include.
      </p>

      {/* Triggered alerts */}
      {triggeredAlerts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">🔔 Triggered</p>
          {triggeredAlerts.map(alert => (
            <div key={alert.id} className="flex items-center gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                  {alert.currency} hit ${alert.triggered_price?.toLocaleString()} ({alert.direction} ${alert.target_price?.toLocaleString()})
                </p>
                {alert.note && <p className="text-xs text-muted-foreground">{alert.note}</p>}
                <p className="text-[10px] text-muted-foreground">{moment(alert.triggered_at).fromNow()}</p>
              </div>
              <Button variant="ghost" size="sm" className="text-xs shrink-0" onClick={() => dismissAlert.mutate(alert.id)}>
                Dismiss
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Active alerts */}
      <div className="space-y-2">
        {activeAlerts.length > 0 && (
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Active</p>
        )}
        {activeAlerts.map(alert => {
          const current = prices[alert.currency];
          const distance = current ? Math.abs(((alert.target_price - current) / current) * 100).toFixed(1) : null;
          return (
            <div key={alert.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${CURRENCY_COLORS[alert.currency]}22` }}>
                {alert.direction === "above"
                  ? <TrendingUp className="h-4 w-4" style={{ color: CURRENCY_COLORS[alert.currency] }} />
                  : <TrendingDown className="h-4 w-4" style={{ color: CURRENCY_COLORS[alert.currency] }} />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                  {alert.currency} {alert.direction} ${alert.target_price?.toLocaleString()}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {current && (
                    <span className="text-xs text-muted-foreground">
                      Now ${current.toLocaleString()} · {distance}% away
                    </span>
                  )}
                  {alert.note && <span className="text-xs text-muted-foreground">· {alert.note}</span>}
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                onClick={() => deleteAlert.mutate(alert.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
        {activeAlerts.length === 0 && triggeredAlerts.length === 0 && (
          <div className="text-center py-12 space-y-3">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <Bell className="h-7 w-7 text-primary" />
            </div>
            <p className="font-semibold">No active alerts</p>
            <p className="text-sm text-muted-foreground">Set a target price and get notified when it's hit.</p>
            <Button onClick={() => setOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Your First Alert
            </Button>
          </div>
        )}
      </div>

      {/* Dismissed (collapsed) */}
      {dismissedAlerts.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">{dismissedAlerts.length} dismissed alert{dismissedAlerts.length > 1 ? "s" : ""} hidden</p>
      )}

      {/* Add Alert dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Price Alert</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MARKET_SYMBOLS.map(c => (
                    <SelectItem key={c} value={c}>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ background: CURRENCY_COLORS[c] }} />
                        {c} {prices[c] ? `— $${prices[c].toLocaleString()}` : ""}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Alert when price goes</Label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="above">📈 Above target</SelectItem>
                  <SelectItem value="below">📉 Below target</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Alert Type</Label>
              <Select value={alertType} onValueChange={setAlertType}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="price">🎯 Target Price</SelectItem>
                  <SelectItem value="volatility">⚡ Volatility Swing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {alertType === "price" && (
            <div>
              <Label>Target Price (USD)</Label>
              <Input
                type="number"
                value={targetPrice}
                onChange={e => setTargetPrice(e.target.value)}
                placeholder={prices[currency] ? `Current: $${prices[currency].toLocaleString()}` : "e.g. 70000"}
                className="mt-1.5"
              />
            </div>
            )}
            {alertType === "volatility" && (
            <div>
              <Label>Volatility Threshold (%)</Label>
              <Input
                type="number"
                value={volatilityPct}
                onChange={e => setVolatilityPct(e.target.value)}
                placeholder="e.g. 5 (alert when price swings ≥5%)"
                className="mt-1.5"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Triggers when {currency} moves this % within a single check interval.</p>
            </div>
            )}
            <div>
              <Label>Note (optional)</Label>
              <Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. All-time high breakout" className="mt-1.5" />
            </div>
            <Button
              className="w-full"
              disabled={
                createAlert.isPending ||
                (alertType === "price" && (!targetPrice || parseFloat(targetPrice) <= 0)) ||
                (alertType === "volatility" && (!volatilityPct || parseFloat(volatilityPct) <= 0))
              }
              onClick={() => createAlert.mutate({
                currency, direction, note, status: "active",
                alert_type: alertType,
                target_price: alertType === "price" ? parseFloat(targetPrice) : undefined,
                volatility_pct: alertType === "volatility" ? parseFloat(volatilityPct) : undefined,
              })}
            >
              {createAlert.isPending ? "Creating…" : "Create Alert"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}