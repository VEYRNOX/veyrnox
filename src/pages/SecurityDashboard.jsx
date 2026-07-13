// @ts-nocheck
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { DEMO } from "@/api/demoClient";
import { ALLOW_MAINNET } from "@/wallet-core/evm/networks";
import { useWallet } from "@/lib/WalletProvider";
import {
  summarizeApprovals,
  summarizeSpamTokens,
  screenAddressHistory,
  buildReviewItems,
} from "@/lib/securityPosture";
import { isBiometricUnlockEnabled } from "@/lib/biometric";
import { isPasskeyUnlockEnabled, isPasskeyRegistered } from "@/lib/passkey";
import { loadAutoLockValue, AUTO_LOCK_OPTIONS } from "@/lib/session";
import { formatUnlockTime } from "@/lib/formatUnlockTime";
import {
  Shield, ShieldAlert, ShieldCheck, AlertTriangle, ChevronRight, Loader2,
  Fingerprint, KeyRound, Lock, Ghost, ScanSearch, ShieldOff, FilterX, ShieldQuestion, History,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Security Dashboard (S2 — item 6/7). A READ + SURFACE view that AGGREGATES the
// security signals the app already computes into one posture screen, and LINKS to
// the existing action pages. It runs NO new detection and moves NO value:
//   • approvals   → base44 TokenApproval  + securityPosture.summarizeApprovals
//   • spam tokens → base44 WalletToken     + securityPosture.summarizeSpamTokens
//   • addresses   → base44 Transaction     + securityPosture.screenAddressHistory
//                   (reuses wallet-core/evm/poison.js look-alike + flagged screen)
//   • protections → lib/biometric, lib/passkey, lib/session + WalletProvider
//                   (stealth-pool marker only; duress/panic configured-state is
//                    NOT read or shown — always-provisioned slots = coercion oracle)
// LOCAL-ONLY: every input is data the app already holds on-device (demo seeds, or
// existing local reads on a real build). No new third-party source, no phone-home.
// HONESTY: surfaces KNOWN, locally-detectable signals — it never claims the wallet
// is "safe"/"secure". It shows what's on, what's off, and what needs review.
// ─────────────────────────────────────────────────────────────────────────────

const SEV = {
  high: { cls: "text-destructive", dot: "bg-destructive", badge: "bg-destructive/10 text-destructive" },
  medium: { cls: "text-caution", dot: "bg-caution", badge: "bg-caution/10 text-caution" },
};

// One protection's display config. `on` is resolved from the existing settings
// modules; `path` links to the page that already manages it.
function FeatureRow({ icon: Icon, label, on, detail, path, gapWhenOff = true }) {
  const enabled = !!on;
  const isGap = !enabled && gapWhenOff;
  return (
    <Link
      to={path}
      className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-secondary/40 transition-colors"
    >
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${enabled ? "bg-success/10" : "bg-secondary"}`}>
        <Icon className={`h-4 w-4 ${enabled ? "text-success" : "text-muted-foreground"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
            enabled ? "bg-success/10 text-success" : isGap ? "bg-caution/10 text-caution" : "bg-secondary text-muted-foreground"
          }`}>
            {enabled ? "ON" : isGap ? "OFF" : "Not set"}
          </span>
        </div>
        {detail && <p className="text-xs text-muted-foreground truncate">{detail}</p>}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

function StatCard({ icon: Icon, label, value, sub, tone, path }) {
  const toneCls = tone === "high" ? "border-destructive/30" : tone === "medium" ? "border-caution/30" : "border-border";
  return (
    <Link to={path} className={`p-4 rounded-xl border bg-card hover:bg-secondary/40 transition-colors block ${toneCls}`}>
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${tone === "high" ? "text-destructive" : tone === "medium" ? "text-caution" : ""}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
    </Link>
  );
}

export default function SecurityDashboard() {
  const wallet = useWallet();
  const { isDecoy, isHidden } = wallet;

  // I3 (deniability): decoy/hidden sessions must not fire base44 entity queries.
  // Gate consistent with LoginActivity.jsx — no UI tell that confirms session type.
  const entityQueryEnabled = !isDecoy && !isHidden;

  // ── Existing local reads (base44 entities — demo seeds, or real local reads). ──
  const { data: approvalRows = [], isLoading: loadingApprovals, isError: errorApprovals } = useQuery({
    queryKey: ["token-approvals"],
    queryFn: () => base44.entities.TokenApproval.list(),
    enabled: entityQueryEnabled,
  });
  const { data: tokenRows = [], isLoading: loadingTokens, isError: errorTokens } = useQuery({
    queryKey: ["wallet-tokens"],
    queryFn: () => base44.entities.WalletToken.list(),
    enabled: entityQueryEnabled,
  });
  const { data: txRows = [], isLoading: loadingTxs, isError: errorTxs } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => base44.entities.Transaction.list(),
    enabled: entityQueryEnabled,
  });

  // ── Feature toggles. Sync ones read directly; the stealth-pool marker is
  //    resolved via WalletProvider. NOTE: duress/panic configured-state is
  //    deliberately NOT read or displayed — those slots are always-provisioned,
  //    so any "is it set?" readout would be both wrong and a coercion oracle
  //    (deniability invariant — see src/__tests__/security-framing.test.js). ──
  const autoLockValue = loadAutoLockValue();
  const autoLockLabel = (AUTO_LOCK_OPTIONS.find((o) => o.value === autoLockValue) || {}).label || "5 min";
  const autoLockNever = autoLockValue === "never";
  const biometricOn = isBiometricUnlockEnabled();
  const passkeyOn = isPasskeyUnlockEnabled() && isPasskeyRegistered();

  const { data: s3 = /** @type {any} */ ({}), isError: errorS3 } = useQuery({
    queryKey: ["security-posture-s3"],
    queryFn: async () => {
      // hasStealthPool is a non-destructive store read (no key material, no
      // network). The stealth pool is universally seeded and pre-dates the
      // deniability work; it is NOT the duress/panic oracle. Best-effort: off
      // on error.
      const stealth = await wallet.hasStealthPool().catch(() => false);
      return { stealth };
    },
  });

  // ── Aggregate (pure, reuses the existing detection modules). ──
  const approvals = useMemo(() => summarizeApprovals(approvalRows), [approvalRows]);
  const spam = useMemo(() => summarizeSpamTokens(tokenRows), [tokenRows]);
  const addresses = useMemo(() => screenAddressHistory(txRows), [txRows]);
  const { review } = useMemo(
    () => buildReviewItems({ approvals, spam, addresses, features: { autoLockNever } }),
    [approvals, spam, addresses, autoLockNever]
  );

  const loading = loadingApprovals || loadingTokens || loadingTxs;
  const highCount = review.filter((r) => r.severity === "high").length;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Security Dashboard</h1>
            <p className="text-sm text-muted-foreground">Your security status, all in one place.</p>
          </div>
        </div>
        <span className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-secondary text-muted-foreground font-semibold uppercase tracking-wide">
          {DEMO ? "Demo · simulated" : ALLOW_MAINNET ? "Mainnet" : "Testnet"}
        </span>
      </div>

      {/* Posture summary — honest headline, never "safe". */}
      <div className={`p-4 rounded-xl border ${highCount > 0 ? "border-destructive/30 bg-destructive/5" : review.length > 0 ? "border-caution/30 bg-caution/5" : "border-border bg-card/50"}`}>
        <div className="flex items-start gap-3">
          {highCount > 0
            ? <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            : review.length > 0
              ? <AlertTriangle className="h-5 w-5 text-caution shrink-0 mt-0.5" />
              : <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />}
          <div className="flex-1 min-w-0">
            {loading ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Checking signals on this device…</p>
            ) : review.length > 0 ? (
              <>
                <p className="text-sm font-semibold">
                  {review.length} item{review.length > 1 ? "s" : ""} worth reviewing
                  {highCount > 0 && <span className="text-destructive"> · {highCount} high-risk</span>}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Protections on: {[biometricOn && "biometric", passkeyOn && "passkey", !autoLockNever && `auto-lock ${autoLockLabel}`].filter(Boolean).join(", ") || "none"}.
                </p>
              </>
            ) : (
              <p className="text-sm font-semibold">Nothing to flag on this device right now.</p>
            )}
          </div>
        </div>

        {!loading && review.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {review.map((r, i) => (
              <li key={i}>
                <Link to={r.path} className="flex items-center gap-2 text-sm hover:underline">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${SEV[r.severity].dot}`} />
                  <span className={`flex-1 ${SEV[r.severity].cls}`}>{r.text}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Active risk signals (counts → jump to the existing action page). */}
      <div>
        <h2 className="text-sm font-semibold mb-2">Active risk signals</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            icon={ShieldOff}
            label="Approvals"
            value={loading ? "—" : approvals.unlimited}
            sub={`${approvals.unlimited} unlimited${approvals.highRisk ? ` · ${approvals.highRisk} risky` : ""}`}
            tone={approvals.highRisk > 0 ? "high" : approvals.unlimited > 0 ? "medium" : "ok"}
            path="/token-approvals"
          />
          <StatCard
            icon={FilterX}
            label="Spam tokens"
            value={loading ? "—" : spam.spam}
            sub={`of ${spam.total} held`}
            tone={spam.spam > 0 ? "medium" : "ok"}
            path="/spam-filter"
          />
          <StatCard
            icon={ShieldQuestion}
            label="Addresses"
            value={loading ? "—" : addresses.flagged + addresses.lookAlikePairs}
            sub={`${addresses.screened} screened`}
            tone={addresses.flagged + addresses.lookAlikePairs > 0 ? "high" : "ok"}
            path="/address-checker"
          />
        </div>
        {errorApprovals && (
          <p className="mt-2 text-xs text-caution">Couldn't load token approvals — this signal may be incomplete.</p>
        )}
        {errorTokens && (
          <p className="mt-2 text-xs text-caution">Couldn't load wallet tokens — this signal may be incomplete.</p>
        )}
        {errorTxs && (
          <p className="mt-2 text-xs text-caution">Couldn't load transaction history — address screening may be incomplete.</p>
        )}
      </div>

      {/* Pre-sign simulation — honest about being on-demand, not stored. */}
      <div className="p-3 rounded-lg border border-border bg-card/50 flex items-start gap-2 text-xs text-muted-foreground">
        <ScanSearch className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p>
          Transaction Simulation runs these same checks <span className="font-medium text-foreground">at the moment you sign</span> — on-device, per transaction, not stored. The counts above show what those checks would flag today.
        </p>
      </div>

      {/* Protection status — what's ON / OFF, each links to its existing page. */}
      <div>
        <h2 className="text-sm font-semibold mb-2">Protections</h2>
        <div className="space-y-2">
          <FeatureRow icon={Fingerprint} label="Biometric unlock" on={biometricOn} detail={biometricOn ? "Required to unlock" : "Not required"} path="/biometric-auth" />
          <FeatureRow icon={KeyRound} label="Passkey unlock" on={passkeyOn} detail={passkeyOn ? "Registered & required" : isPasskeyRegistered() ? "Registered, not required" : "Not registered"} path="/settings" />
          <FeatureRow icon={Lock} label="Auto-lock" on={!autoLockNever} detail={autoLockNever ? "Never — won't lock when idle" : `Locks after ${autoLockLabel} idle`} path="/settings" />
          {/* Duress PIN / Panic wipe rows intentionally omitted: those slots are
              always-provisioned, so showing a configured-vs-not state would be both
              wrong and a coercion oracle (deniability invariant). They remain
              reachable via Settings. */}
          <FeatureRow icon={Ghost} label="Stealth wallets" on={s3.stealth} detail={s3.stealth ? "Pool ready" : "Not set up"} path="/stealth-wallets" gapWhenOff={false} />
          {errorS3 && (
            <p className="text-xs text-caution">Couldn't load stealth-pool status — this signal may be incomplete.</p>
          )}
        </div>
      </div>

      {/* Last opened — a deniability-clean tamper signal. Primary-session only;
          null shows "First open on this device". IBM Plex Mono for the value. */}
      <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
        <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <History className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium">Last opened</span>
          <p className="text-xs text-muted-foreground font-mono mono-value">
            {formatUnlockTime(wallet.lastUnlockAt)}
          </p>
        </div>
      </div>

      {/* Plain-language threat-model explainer (Phase 2 — seized-device PIN
          disclosure). Static, session-independent copy; no configured-state. */}
      <Link
        to="/what-this-protects"
        className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-secondary/40 transition-colors"
      >
        <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <ShieldQuestion className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium">What your PIN protects — and what it doesn't</span>
          <p className="text-xs text-muted-foreground">Plain-language: what an 8-digit PIN defends against, and what it can't.</p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </Link>

      {/* Honest coverage note — KNOWN signals only, never a guarantee. */}
      <div className="p-3 rounded-xl bg-secondary/50 border border-border">
        <p className="text-xs text-muted-foreground">
          This only shows what <span className="font-medium text-foreground">we can see on this device</span> — no external calls, no guarantee your wallet is safe.
          No warning just means nothing suspicious was found here. It does not mean an address, contract, or approval is safe. Always check before you sign.
        </p>
      </div>
    </div>
  );
}
