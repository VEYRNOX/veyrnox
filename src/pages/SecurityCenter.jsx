import { USD_RATES } from "@/lib/cryptos";
import ReferenceRateNote from "@/components/ReferenceRateNote";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Monitor, Trash2, Plus, DollarSign, ShieldCheck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import moment from "moment";
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
  const queryClient = useQueryClient();
  const [showAddLimit, setShowAddLimit] = useState(false);
  const [limitCurrency, setLimitCurrency] = useState("ALL");
  const [dailyLimit, setDailyLimit] = useState("");
  const [perTxLimit, setPerTxLimit] = useState("");

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => base44.entities.UserSession.filter({ status: "active" }),
  });

  const { data: limits = [] } = useQuery({
    queryKey: ["tx-limits"],
    queryFn: () => base44.entities.TransactionLimit.list(),
  });

  // LOCAL tx-history records — the SAME source the Send flow uses to enforce the
  // daily cap. Read client-side; nothing is sent anywhere. Used here only to
  // SHOW each daily limit's "spent today" so the cap is visible, not just
  // enforced silently in Send. See lib/txLimits.js for the computation.
  const { data: history = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => base44.entities.Transaction.list("-created_date", 100),
  });

  // Register current session on mount
  useEffect(() => {
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
  }, []);

  const revokeSession = useMutation({
    mutationFn: (id) => base44.entities.UserSession.update(id, { status: "revoked" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      // Honest scope: revoking marks the session revoked; the device with that
      // session locks its wallet + requires re-auth (immediately for this device,
      // next-open for others). See lib/sessionRevocation.js + SessionRevocationGuard.
      toast.success("Session revoked — that device is signed out and must re-authenticate.");
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
      toast.success("Limit set");
    },
  });

  const toggleLimit = useMutation({
    mutationFn: ({ id, enabled }) => base44.entities.TransactionLimit.update(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tx-limits"] }),
  });

  const deleteLimit = useMutation({
    mutationFn: (id) => base44.entities.TransactionLimit.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tx-limits"] }),
  });

  const currentToken = localStorage.getItem("sdw_session_token");

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security Center</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage sessions and transaction limits</p>
      </div>

      <Tabs defaultValue="sessions">
        <TabsList className="w-full bg-secondary">
          <TabsTrigger value="sessions" className="flex-1">Sessions</TabsTrigger>
          <TabsTrigger value="limits" className="flex-1">Tx Limits</TabsTrigger>
        </TabsList>

        {/* ── Sessions Tab ── */}
        <TabsContent value="sessions" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">All devices currently signed in to your account.</p>
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-secondary/40 border border-border">
            <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Revoking a session signs that device out: it locks the wallet (clears the in-memory key) and
              requires the password again. This device applies it immediately; other devices apply it the next
              time they're opened — there's no server that can force-close them instantly.
            </p>
          </div>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No active sessions found</p>
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
                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">This device</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Last active {moment(s.last_active).fromNow()}</p>
                  </div>
                  {isCurrent ? (
                    // Signing out THIS device is now meaningful: the guard locks
                    // the wallet + clears the token, forcing re-auth. Confirm first.
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 shrink-0 gap-1.5"
                      title="Lock this device and require the password again"
                      onClick={() => {
                        if (window.confirm("Sign out this device? The wallet will lock and you'll need your password to continue.")) {
                          revokeSession.mutate(s.id);
                        }
                      }}
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10 shrink-0"
                      title="Revoke this session"
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
            <p className="text-xs text-muted-foreground">Set daily or per-transaction spend caps.</p>
            <Button size="sm" onClick={() => setShowAddLimit(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Limit
            </Button>
          </div>
          {limits.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <DollarSign className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">No limits configured</p>
            </div>
          ) : (
            limits.map(l => (
              <div key={l.id} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded">{l.currency}</span>
                    {!l.enabled && <span className="text-xs text-muted-foreground">(disabled)</span>}
                  </div>
                  <div className="flex gap-4 mt-1">
                    {l.daily_limit && <p className="text-xs text-muted-foreground">Daily: <span className="text-foreground font-medium">${l.daily_limit.toLocaleString()}</span></p>}
                    {l.per_transaction_limit && <p className="text-xs text-muted-foreground">Per Tx: <span className="text-foreground font-medium">${l.per_transaction_limit.toLocaleString()}</span></p>}
                  </div>
                  {/* Today's running total against this daily cap — enforced in the
                      Send flow, summed from local tx history (lib/txLimits.js). */}
                  {l.enabled && l.daily_limit != null && (() => {
                    const spent = sumSentTodayUSD({ history, currency: l.currency, usdRates: USD_RATES });
                    const pct = Math.min(100, Math.round((spent / l.daily_limit) * 100));
                    return (
                      <div className="mt-1.5">
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>Sent today (local)</span>
                          <span className={spent >= l.daily_limit ? "text-destructive font-medium" : "text-foreground"}>
                            ${Math.round(spent).toLocaleString()} / ${l.daily_limit.toLocaleString()}
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
                <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => deleteLimit.mutate(l.id)}>
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
          <DialogHeader><DialogTitle>Add Transaction Limit</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Currency</Label>
              <Select value={limitCurrency} onValueChange={setLimitCurrency}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["ALL", "BTC", "ETH", "SOL", "USDC", "USDT"].map(c => (
                    <SelectItem key={c} value={c}>{c === "ALL" ? "All currencies" : c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Daily Limit (USD)</Label>
              <Input type="number" value={dailyLimit} onChange={e => setDailyLimit(e.target.value)} placeholder="e.g. 1000" className="mt-1.5" />
            </div>
            <div>
              <Label>Per Transaction Limit (USD)</Label>
              <Input type="number" value={perTxLimit} onChange={e => setPerTxLimit(e.target.value)} placeholder="e.g. 500" className="mt-1.5" />
            </div>
            <Button className="w-full" onClick={() => addLimit.mutate()} disabled={addLimit.isPending || (!dailyLimit && !perTxLimit)}>
              Save Limit
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}