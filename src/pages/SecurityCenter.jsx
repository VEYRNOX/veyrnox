// @ts-nocheck
//
// I18N (Phase 2 slice 2 batch C): copy driven by `security.security_center.*`.
// Currency codes (BTC/ETH/…) stay as internal keys — those aren't user-facing
// prose. `ALL` is a sentinel meaning "any currency"; its DISPLAY label goes
// through the catalog (security.security_center.dialog.all_currencies).
import { useTranslation } from "react-i18next";
import { USD_RATES, approxUsd } from "@/lib/cryptos";
import ReferenceRateNote from "@/components/ReferenceRateNote";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useWallet } from "@/lib/WalletProvider";
import { Monitor, Trash2, Plus, DollarSign, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { formatDistanceToNow } from "date-fns";
import { sumSentTodayUSD } from "@/lib/txLimits";


function getDeviceInfo() {
  const ua = navigator.userAgent;
  let browser = "Unknown Browser";
  if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari")) browser = "Safari";
  else if (ua.includes("Edge")) browser = "Edge";
  let device = "Desktop";
  if (/Mobi|Android/i.test(ua)) device = "Mobile";
  else if (/iPad|Tablet/i.test(ua)) device = "Tablet";
  return { browser, device_name: `${device} · ${browser}` };
}

export default function SecurityCenter() {
  const { t } = useTranslation("security");
  const queryClient = useQueryClient();
  // I2/I3: decoy/hidden sessions must make zero backend calls and write no
  // trackable identifiers. Gate session registration + the tx-history query.
  const { isDecoy, isHidden } = useWallet();
  const deniable = isDecoy || isHidden;
  const [showAddLimit, setShowAddLimit] = useState(false);
  const [limitCurrency, setLimitCurrency] = useState("ALL");
  const [dailyLimit, setDailyLimit] = useState("");
  const [perTxLimit, setPerTxLimit] = useState("");

  // Two-factor (Action Password / passkey) now lives in Security Settings →
  // "Two-factor at critical actions". The Security Center is alerts/sessions/limits.

  const { data: sessions = [], isError: errorSessions } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => base44.entities.UserSession.filter({ status: "active" }),
  });

  const { data: limits = [], isError: errorLimits } = useQuery({
    queryKey: ["tx-limits"],
    queryFn: () => base44.entities.TransactionLimit.list(),
  });

  // LOCAL tx-history records — the SAME source the Send flow uses to enforce the
  // daily cap. Read client-side; nothing is sent anywhere. Used here only to
  // SHOW each daily limit's "spent today" so the cap is visible, not just
  // enforced silently in Send. See lib/txLimits.js for the computation.
  const { data: history = [], isError: errorHistory } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => base44.entities.Transaction.list("-created_date", 100),
    enabled: !deniable,
  });

  // Register current session on mount.
  // I2/I3: in a decoy/hidden session, skip entirely — no UUID write to
  // localStorage, no UserSession filter/create/update backend calls.
  useEffect(() => {
    if (deniable) return;
    const registerSession = async () => {
      const info = getDeviceInfo();
      const token = localStorage.getItem("sdw_session_token") || (() => {
        const t = crypto.randomUUID();
        localStorage.setItem("sdw_session_token", t);
        return t;
      })();
      const existing = await base44.entities.UserSession.filter({ session_token: token, status: "active" });
      if (existing.length === 0) {
        await base44.entities.UserSession.create({
          ...info,
          session_token: token,
          last_active: new Date().toISOString(),
          status: "active",
        });
        queryClient.invalidateQueries({ queryKey: ["sessions"] });
      } else {
        await base44.entities.UserSession.update(existing[0].id, { last_active: new Date().toISOString() });
      }
    };
    registerSession();
  }, [deniable]);

  const revokeSession = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.UserSession.update(id, { status: "revoked" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      // Honest scope: revoking marks the session revoked; the device with that
      // session locks its wallet + requires re-auth (immediately for this device,
      // next-open for others). See lib/sessionRevocation.js + SessionRevocationGuard.
      toast.success(t("security_center.sessions.signed_out_toast"));
    },
  });

  const addLimit = useMutation({
    mutationFn: () => base44.entities.TransactionLimit.create({
      currency: limitCurrency,
      daily_limit: dailyLimit ? parseFloat(dailyLimit) : null,
      per_transaction_limit: perTxLimit ? parseFloat(perTxLimit) : null,
      enabled: true,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tx-limits"] });
      setShowAddLimit(false);
      setDailyLimit(""); setPerTxLimit(""); setLimitCurrency("ALL");
      toast.success(t("security_center.dialog.saved_toast"));
    },
  });

  const toggleLimit = useMutation({
    mutationFn: (/** @type {any} */ vars) => base44.entities.TransactionLimit.update(vars.id, { enabled: vars.enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tx-limits"] }),
  });

  const deleteLimit = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.TransactionLimit.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tx-limits"] }),
  });

  const currentToken = localStorage.getItem("sdw_session_token");

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("security_center.heading")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t("security_center.subhead")}</p>
      </div>

      <Tabs defaultValue="sessions">
        <TabsList className="w-full bg-secondary">
          <TabsTrigger value="sessions" className="flex-1">{t("security_center.tabs.sessions")}</TabsTrigger>
          <TabsTrigger value="limits" className="flex-1">{t("security_center.tabs.limits")}</TabsTrigger>
        </TabsList>

        {/* ── Sessions Tab ── */}
        <TabsContent value="sessions" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">{t("security_center.sessions.desc")}</p>
          {errorSessions && (
            <p className="text-xs text-caution">{t("security_center.sessions.load_error")}</p>
          )}
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t("security_center.sessions.empty")}</p>
          ) : (
            sessions.map(s => {
              const isCurrent = s.session_token === currentToken;
              return (
                <div key={s.id} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Monitor className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{s.device_name}</p>
                      {isCurrent && (
                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">{t("security_center.sessions.this_device")}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{t("security_center.sessions.last_active", { when: formatDistanceToNow(new Date(s.last_active), { addSuffix: true }) })}</p>
                  </div>
                  {isCurrent ? (
                    // Signing out THIS device is now meaningful: the guard locks
                    // the wallet + clears the token, forcing re-auth. Confirm first.
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 shrink-0 gap-1.5"
                      title={t("security_center.sessions.sign_out_title")}
                      onClick={() => {
                        if (window.confirm(t("security_center.sessions.sign_out_confirm"))) {
                          revokeSession.mutate(s.id);
                        }
                      }}
                    >
                      <LogOut className="h-4 w-4" /> {t("security_center.sessions.sign_out")}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10 shrink-0"
                      title={t("security_center.sessions.revoke_title")}
                      aria-label={t("security_center.sessions.revoke_aria")}
                      onClick={() => revokeSession.mutate(s.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </TabsContent>

        {/* ── Limits Tab ── */}
        <TabsContent value="limits" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{t("security_center.limits.desc")}</p>
            <Button size="sm" onClick={() => setShowAddLimit(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> {t("security_center.limits.add_cta")}
            </Button>
          </div>
          {errorLimits && (
            <p className="text-xs text-caution">{t("security_center.limits.load_error")}</p>
          )}
          {errorHistory && (
            <p className="text-xs text-caution">{t("security_center.limits.history_error")}</p>
          )}
          {limits.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <DollarSign className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">{t("security_center.limits.empty")}</p>
            </div>
          ) : (
            limits.map(l => (
              <div key={l.id} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded">{l.currency}</span>
                    {!l.enabled && <span className="text-xs text-muted-foreground">{t("security_center.limits.disabled_note")}</span>}
                  </div>
                  <div className="flex gap-4 mt-1">
                    {l.daily_limit && <p className="text-xs text-muted-foreground">{t("security_center.limits.daily_label")} <span className="text-foreground font-medium">${l.daily_limit.toLocaleString()}</span></p>}
                    {l.per_transaction_limit && <p className="text-xs text-muted-foreground">{t("security_center.limits.per_tx_label")} <span className="text-foreground font-medium">${l.per_transaction_limit.toLocaleString()}</span></p>}
                  </div>
                  {/* Today's running total against this daily cap — enforced in the
                      Send flow, summed from local tx history (lib/txLimits.js). */}
                  {l.enabled && l.daily_limit != null && (() => {
                    const spent = sumSentTodayUSD({ history, currency: l.currency, usdRates: USD_RATES });
                    const pct = Math.min(100, Math.round((spent / l.daily_limit) * 100));
                    return (
                      <div className="mt-1.5">
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>{t("security_center.limits.sent_today")}</span>
                          <span className={spent >= l.daily_limit ? "text-destructive font-medium" : "text-foreground"}>
                            {approxUsd(spent)} / ${l.daily_limit.toLocaleString()}
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-secondary mt-1 overflow-hidden">
                          <div className={`h-full ${pct >= 100 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <Switch
                  checked={l.enabled}
                  onCheckedChange={(v) => toggleLimit.mutate({ id: l.id, enabled: v })}
                />
                <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" aria-label={t("security_center.limits.delete_aria", { currency: l.currency })} onClick={() => deleteLimit.mutate(l.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
          {/* "Sent today" totals convert local tx amounts via the static
              USD_RATES table — disclose they're a reference rate, not live. */}
          {limits.length > 0 && <ReferenceRateNote className="mt-2" />}
        </TabsContent>
      </Tabs>

      {/* Add Limit Dialog */}
      <Dialog open={showAddLimit} onOpenChange={setShowAddLimit}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("security_center.dialog.title")}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label id="limit-currency-label">{t("security_center.dialog.currency_label")}</Label>
              <Select value={limitCurrency} onValueChange={setLimitCurrency}>
                <SelectTrigger className="mt-1.5" aria-labelledby="limit-currency-label"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["ALL", "BTC", "ETH", "SOL", "USDC", "USDT"].map(c => (
                    <SelectItem key={c} value={c}>{c === "ALL" ? t("security_center.dialog.all_currencies") : c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("security_center.dialog.daily_limit_label")}</Label>
              <Input type="number" value={dailyLimit} onChange={e => setDailyLimit(e.target.value)} placeholder={t("security_center.dialog.daily_limit_placeholder")} className="mt-1.5" />
            </div>
            <div>
              <Label>{t("security_center.dialog.per_tx_limit_label")}</Label>
              <Input type="number" value={perTxLimit} onChange={e => setPerTxLimit(e.target.value)} placeholder={t("security_center.dialog.per_tx_limit_placeholder")} className="mt-1.5" />
            </div>
            <Button className="w-full" onClick={() => addLimit.mutate()} disabled={addLimit.isPending || (!dailyLimit && !perTxLimit)}>
              {t("security_center.dialog.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}