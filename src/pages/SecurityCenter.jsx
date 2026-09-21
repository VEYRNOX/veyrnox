// @ts-nocheck
import { USD_RATES, approxUsd } from "@/lib/cryptos";
import ReferenceRateNote from "@/components/ReferenceRateNote";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useWallet } from "@/lib/WalletProvider";
import { useActionGuard } from "@/components/security/useActionGuard";
import { Monitor, Trash2, Plus, LogOut, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { formatDistanceToNow } from "date-fns";
import { sumSentTodayUSD, hasEnabledSpendLimit } from "@/lib/txLimits";
import { isTheftProtectionEnabled, getTheftProtectionSupport, runTheftProtectionGate, theftProtectionMessage } from "@/lib/theftProtection";
import { parseLocaleNumber, resolveLocale } from "@/lib/locale";
import { getSessionToken, ensureSessionToken } from "@/lib/sessionRevocation";
import { useAdvisorSnapshot } from "@/lib/useAdvisorSnapshot";
import EmptyState from "@/components/EmptyState";


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
  // I2/I3: decoy/hidden sessions must make zero backend calls and write no
  // trackable identifiers. Gate session registration + the tx-history query.
  const { isDecoy, isHidden } = useWallet();
  const { requireTwoFactor, gateModal } = useActionGuard();
  // Codex P2 2026-08-15: revoke was reachable without step-up re-auth.
  // Route through requireTwoFactor (no-op when no 2FA configured; presents
  // the PIN/passkey gate otherwise) — same wrapper the seed-reveal + duress
  // setup flows use. Both the current-device Sign-out and the other-device
  // revoke buttons below funnel here.
  const guardedRevokeSession = (id, title = 'Revoke session') => {
    requireTwoFactor(() => revokeSession.mutate(id), { title });
  };
  const deniable = isDecoy || isHidden;
  // Step-up for any change that can LOOSEN a spend limit (disable, delete,
  // edit). Theft Protection's send-side check only fires when a limit blocks,
  // so an ungated loosen let someone holding an unlocked phone raise or remove
  // the cap and then send with no biometric. When Theft Protection is on, its
  // own biometric gate runs first (it fails closed); the configured second
  // factor, if any, runs after. Creating a limit only tightens, so it stays
  // ungated. runTheftProtectionGate no-ops in decoy/hidden (K-2). A device
  // that cannot run the biometric at all skips it (#2515 escape hatch, same
  // rule as TheftProtectionSettings' off switch) — it enforces nothing there.
  const guardLoosening = async (run, title) => {
    if (isTheftProtectionEnabled()) {
      try {
        const { supported } = await getTheftProtectionSupport();
        if (supported) await runTheftProtectionGate({ isPrimary: !deniable });
      } catch (err) {
        toast.error(theftProtectionMessage(err));
        return;
      }
    }
    requireTwoFactor(run, { title });
  };
  // window.confirm broke out of the near-black UI with an OS dialog while every
  // other destructive confirmation in this surface uses the app's own Dialog.
  // Deleting a limit is destructive and was a single unconfirmed click, while
  // sign-out on this same page already routes through a Dialog. Holding the ROW
  // (not just the id) lets the prompt name the cap being removed — "Delete" on
  // its own does not tell you which of several rows you are about to lose.
  const [pendingDeleteLimit, setPendingDeleteLimit] = useState(/** @type {any} */ (null));
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [pendingSignOutId, setPendingSignOutId] = useState(/** @type {any} */ (null));
  const [showAddLimit, setShowAddLimit] = useState(false);
  // null = the dialog is creating; an id = it is editing that row in place.
  // Without this the ONLY way to change a cap was delete + re-add, and adding a
  // BIGGER limit alongside the old one does not raise anything —
  // evaluateSendAgainstLimits blocks if ANY matching limit is breached, so the
  // smaller row silently keeps winning. Editing removes both traps.
  const [editingId, setEditingId] = useState(/** @type {any} */ (null));
  const theftProtectionOn = isTheftProtectionEnabled();
  const [limitCurrency, setLimitCurrency] = useState("ALL");
  const [dailyLimit, setDailyLimit] = useState("");
  const [perTxLimit, setPerTxLimit] = useState("");

  /** Render a stored number back into the user's own locale so the value the
   *  field shows is the value they would have typed — and so parseLocaleNumber
   *  reads it back identically. String(1500.5) would render "1500.5" to a de-DE
   *  user, who writes that number "1500,5"; `useGrouping: false` keeps it free
   *  of separators that the grouped-form parser would then have to undo. */
  const forEditing = (n) =>
    n == null ? "" : new Intl.NumberFormat(resolveLocale(), { useGrouping: false, maximumFractionDigits: 20 }).format(n);

  const openCreateLimit = () => {
    setEditingId(null);
    setLimitCurrency("ALL"); setDailyLimit(""); setPerTxLimit("");
    setShowAddLimit(true);
  };

  const openEditLimit = (/** @type {any} */ l) => {
    setEditingId(l.id);
    setLimitCurrency(l.currency || "ALL");
    setDailyLimit(forEditing(l.daily_limit));
    setPerTxLimit(forEditing(l.per_transaction_limit));
    setShowAddLimit(true);
  };

  // Two-factor (Action Password / passkey) now lives in Security Settings →
  // "Two-factor at critical actions". The Security Center is alerts/sessions/limits.

  // Codex P1 2026-08-15: these two queries were unconditional even in a decoy
  // or hidden session, violating the page's own "zero backend calls in
  // deniability mode" contract right above and matching the `enabled:
  // !deniable` gate the `history` query already uses. Gate both.
  const { data: sessions = [], isError: errorSessions } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => base44.entities.UserSession.filter({ status: "active" }),
    enabled: !deniable,
  });

  const { data: limits = [], isError: errorLimits } = useQuery({
    queryKey: ["tx-limits"],
    queryFn: () => base44.entities.TransactionLimit.list(),
    enabled: !deniable,
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
      const token = ensureSessionToken();
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
      toast.success("Device signed out.");
    },
  });

  const addLimit = useMutation({
    // Locale-aware parse. A de-DE user typing "1,5" in the USD limit field
    // used to see the browser blank it (type="number" value-sanitisation) OR
    // silently save as "1" via parseFloat's comma-truncation. parseLocaleNumber
    // canonicalises the locale-typed input AND returns NaN for anything
    // ambiguous / unrecognised, so we can refuse the save rather than persist
    // a limit the user didn't type.
    mutationFn: () => {
      const locale = resolveLocale();
      const daily = dailyLimit ? parseLocaleNumber(dailyLimit, locale) : null;
      const perTx = perTxLimit ? parseLocaleNumber(perTxLimit, locale) : null;
      if (dailyLimit && (!Number.isFinite(daily) || daily <= 0)) {
        throw new Error("Daily limit must be a positive number");
      }
      if (perTxLimit && (!Number.isFinite(perTx) || perTx <= 0)) {
        throw new Error("Per-transaction limit must be a positive number");
      }
      const values = {
        currency: limitCurrency,
        daily_limit: daily,
        per_transaction_limit: perTx,
      };
      // Editing writes the same validated values onto the existing row rather
      // than appending a second one. `enabled` is deliberately NOT sent on the
      // edit path — that switch is the user's own separate decision and an edit
      // must not silently re-arm a limit they turned off.
      return editingId
        ? base44.entities.TransactionLimit.update(editingId, values)
        : base44.entities.TransactionLimit.create({ ...values, enabled: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tx-limits"] });
      setShowAddLimit(false);
      setDailyLimit(""); setPerTxLimit(""); setLimitCurrency("ALL");
      toast.success(editingId ? "Limit updated" : "Limit set");
      setEditingId(null);
    },
    onError: (/** @type {any} */ err) => {
      toast.error(err?.message || "Couldn't save limit — enter a positive number.");
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

  const currentToken = getSessionToken();

  useAdvisorSnapshot({
    security_center: {
      session_count: sessions.length,
      limit_count: limits.length,
      has_session_error: errorSessions,
      has_limit_error: errorLimits,
    },
  });

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security Center</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Sessions and spend limits</p>
      </div>

      <Tabs defaultValue="sessions">
        <TabsList className="w-full bg-secondary">
          <TabsTrigger value="sessions" className="flex-1">Sessions</TabsTrigger>
          <TabsTrigger value="limits" className="flex-1">Spend Limits</TabsTrigger>
        </TabsList>

        {/* ── Sessions Tab ── */}
        <TabsContent value="sessions" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">Devices with an active session.</p>
          {errorSessions && (
            <p className="text-xs text-caution">Couldn't load sessions.</p>
          )}
          {sessions.length === 0 ? (
            <EmptyState
              kind="generic"
              title="No active sessions"
              description="No other device currently holds a session. The device you are reading this on is not listed here until it registers one."
            />
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
                        <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">This device</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Last active {formatDistanceToNow(new Date(s.last_active), { addSuffix: true })}</p>
                  </div>
                  {isCurrent ? (
                    // Signing out THIS device is now meaningful: the guard locks
                    // the wallet + clears the token, forcing re-auth. Confirm first.
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 shrink-0 gap-1.5"
                      title="Lock this device and require your PIN again"
                      onClick={() => { setPendingSignOutId(s.id); setSignOutOpen(true); }}
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </Button>
                  ) : (
                    // Was icon-only while the current-device button two rows up is
                    // labelled, so the same class of destructive action read as two
                    // different affordances.
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 shrink-0 gap-1.5"
                      title="Revoke this session"
                      onClick={() => guardedRevokeSession(s.id, 'Revoke this session')}
                    >
                      <Trash2 className="h-4 w-4" /> Revoke
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
            <p className="text-xs text-muted-foreground">Cap what you can send per day or per transaction.</p>
            <Button size="sm" onClick={openCreateLimit}>
              <Plus className="h-3.5 w-3.5 me-1" /> Add Limit
            </Button>
          </div>
          {errorLimits && (
            <p className="text-xs text-caution">Couldn't load limits.</p>
          )}
          {/* Theft Protection's send-side leg is INERT without an enabled cap:
              sendGate's THEFT_PROTECTION_REQUIRED branch only fires when
              evaluateSendAgainstLimits() blocks. State which of the two is
              actually on rather than promising enforcement the user has not
              configured (I4). Reads localStorage synchronously — cheap, and
              the whole page is already primary-session only. */}
          {theftProtectionOn && !errorLimits && (
            <p className="text-xs text-muted-foreground" data-testid="theft-protection-limit-link">
              {hasEnabledSpendLimit(limits)
                ? "Theft Protection is on: a send over these limits needs its biometric check before it can sign."
                : "Theft Protection is on, but with no limit enabled below it only applies when you unlock. Add or enable a limit to require its biometric check on an over-limit send."}
            </p>
          )}
          {errorHistory && (
            <p className="text-xs text-caution">Couldn't load history — today's totals may be off.</p>
          )}
          {limits.length === 0 ? (
            <EmptyState
              kind="generic"
              title="No limits configured"
              description="A spend limit makes a transaction above it ask for a second confirmation. It is a check, not a cap — it never blocks a transaction you approve."
              action={
                <Button size="sm" onClick={openCreateLimit}>
                  <Plus className="h-3.5 w-3.5 me-1" /> Add a limit
                </Button>}
            />
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
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Sent today</span>
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
                  onCheckedChange={(v) => {
                    const run = () => toggleLimit.mutate({ id: l.id, enabled: v });
                    if (v) run(); else void guardLoosening(run, "Turn off spending limit");
                  }}
                />
                <Button variant="ghost" size="icon" aria-label={`Edit ${l.currency} limit`} onClick={() => openEditLimit(l)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" aria-label={`Delete ${l.currency} limit`} onClick={() => setPendingDeleteLimit(l)}>
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
      <Dialog open={showAddLimit} onOpenChange={(o) => { setShowAddLimit(o); if (!o) setEditingId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit Transaction Limit" : "Add Transaction Limit"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label id="limit-currency-label">Currency</Label>
              <Select value={limitCurrency} onValueChange={setLimitCurrency}>
                <SelectTrigger className="mt-1.5" aria-labelledby="limit-currency-label"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["ALL", "BTC", "ETH", "SOL", "USDC", "USDT"].map(c => (
                    <SelectItem key={c} value={c}>{c === "ALL" ? "All currencies" : c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="security-daily-limit">Daily Limit (USD)</Label>
              {/* type="text" + inputMode="decimal": same fix as SendCrypto's
                  amount field (PR #1409). type="number" blanks locale-typed
                  values like de-DE "1,5" BEFORE React sees them, hiding the
                  input entirely. text preserves the raw string so
                  parseLocaleNumber (in the save handler) can canonicalise it
                  and refuse anything unrecognised. */}
              {/* The $ is a PERSISTENT affordance, not part of the value: these
                  caps are USD-denominated (lib/txLimits.js converts with
                  USD_RATES), and a bare number field reads as "amount of the
                  selected currency". It stays visible while typing rather than
                  being prefixed into the string, so parseLocaleNumber still
                  sees exactly what the user typed and can refuse anything
                  ambiguous. Logical properties (start/ps) so it flips in RTL. */}
              <div className="relative mt-1.5">
                <span aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input id="security-daily-limit" type="text" inputMode="decimal" value={dailyLimit} onChange={e => setDailyLimit(e.target.value)} placeholder="1000" className="ps-7" />
              </div>
            </div>
            <div>
              <Label htmlFor="security-tx-limit">Per Transaction Limit (USD)</Label>
              <div className="relative mt-1.5">
                <span aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input id="security-tx-limit" type="text" inputMode="decimal" value={perTxLimit} onChange={e => setPerTxLimit(e.target.value)} placeholder="500" className="ps-7" />
              </div>
            </div>
            <Button className="w-full" onClick={() => (editingId ? void guardLoosening(() => addLimit.mutate(), "Change spending limit") : addLimit.mutate())} disabled={addLimit.isPending || (!dailyLimit && !perTxLimit)}>
              {editingId ? "Save Changes" : "Save Limit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Delete-limit confirmation. Same shape as the sign-out prompt below —
          an in-app Dialog, never window.confirm, which breaks out of the
          near-black UI with an OS sheet. */}
      <Dialog open={!!pendingDeleteLimit} onOpenChange={(o) => { if (!o) setPendingDeleteLimit(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete this spending limit?</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {pendingDeleteLimit && (() => {
                const caps = [
                  pendingDeleteLimit.daily_limit != null && `$${pendingDeleteLimit.daily_limit.toLocaleString()} per day`,
                  pendingDeleteLimit.per_transaction_limit != null && `$${pendingDeleteLimit.per_transaction_limit.toLocaleString()} per transaction`,
                ].filter(Boolean).join(" and ");
                return `Sends will no longer be checked against ${caps || "this limit"}${pendingDeleteLimit.currency && pendingDeleteLimit.currency !== "ALL" ? ` for ${pendingDeleteLimit.currency}` : ""}. To change the amount instead, use Edit.`;
              })()}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setPendingDeleteLimit(null)}>Cancel</Button>
              <Button
                variant="destructive"
                className="flex-1 gap-1.5"
                onClick={() => {
                  const id = pendingDeleteLimit?.id;
                  setPendingDeleteLimit(null);
                  if (id) void guardLoosening(() => deleteLimit.mutate(id), "Delete spending limit");
                }}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sign-out confirmation — replaces window.confirm so the coercion-resistance
          surface keeps one visual language. The guard still runs afterwards; this
          dialog adds friction, it does not replace the gate. */}
      <Dialog open={signOutOpen} onOpenChange={(o) => { if (!o) { setSignOutOpen(false); setPendingSignOutId(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Sign out this device?</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The wallet will lock and you'll need your PIN to continue.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => { setSignOutOpen(false); setPendingSignOutId(null); }}>Cancel</Button>
              <Button
                variant="destructive"
                className="flex-1 gap-1.5"
                onClick={() => {
                  const id = pendingSignOutId;
                  setSignOutOpen(false);
                  setPendingSignOutId(null);
                  if (id) guardedRevokeSession(id, 'Sign out this device');
                }}
              >
                <LogOut className="h-4 w-4" /> Sign out
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {gateModal}
    </div>
  );
}