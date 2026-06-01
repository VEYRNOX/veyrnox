import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { DEMO } from "@/api/demoClient";
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
import {
  Shield, ShieldAlert, ShieldCheck, AlertTriangle, ChevronRight, Loader2,
  Fingerprint, KeyRound, Lock, Ghost, Bomb, ScanSearch, ShieldOff, FilterX, ShieldQuestion,
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
//                   (hasDuressPin / hasStealthPool / hasPanicPin)
// LOCAL-ONLY: every input is data the app already holds on-device (demo seeds, or
// existing local reads on a real build). No new third-party source, no phone-home.
// HONESTY: surfaces KNOWN, locally-detectable signals — it never claims the wallet
// is "safe"/"secure". It shows what's on, what's off, and what needs review.
// ─────────────────────────────────────────────────────────────────────────────

const SEV = {
  high: { cls: "text-destructive", dot: "bg-destructive", badge: "bg-destructive/10 text-destructive" },
  medium: { cls: "text-yellow-500", dot: "bg-yellow-500", badge: "bg-yellow-500/10 text-yellow-500" },
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
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${enabled ? "bg-green-500/10" : "bg-secondary"}`}>
        <Icon className={`h-4 w-4 ${enabled ? "text-green-500" : "text-muted-foreground"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
            enabled ? "bg-green-500/10 text-green-500" : isGap ? "bg-yellow-500/10 text-yellow-500" : "bg-secondary text-muted-foreground"
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
  const toneCls = tone === "high" ? "border-destructive/30" : tone === "medium" ? "border-yellow-500/30" : "border-border";
  return (
    <Link to={path} className={`p-4 rounded-xl border bg-card hover:bg-secondary/40 transition-colors block ${toneCls}`}>
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${tone === "high" ? "text-destructive" : tone === "medium" ? "text-yellow-500" : ""}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
    </Link>
  );
}

export default function SecurityDashboard() {
  const wallet = useWallet();

  // ── Existing local reads (base44 entities — demo seeds, or real local reads). ──
  const { data: approvalRows = [], isLoading: loadingApprovals } = useQuery({
    queryKey: ["token-approvals"],
    queryFn: () => base44.entities.TokenApproval.list(),
  });
  const { data: tokenRows = [], isLoading: loadingTokens } = useQuery({
    queryKey: ["wallet-tokens"],
    queryFn: () => base44.entities.WalletToken.list(),
  });
  const { data: txRows = [], isLoading: loadingTxs } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => base44.entities.Transaction.list(),
  });

  // ── Feature toggles. Sync ones read directly; the IndexedDB-backed S3 markers
  //    (duress/stealth/panic) are resolved via WalletProvider, off when unset. ──
  const autoLockValue = loadAutoLockValue();
  const autoLockLabel = (AUTO_LOCK_OPTIONS.find((o) => o.value === autoLockValue) || {}).label || "5 min";
  const autoLockNever = autoLockValue === "never";
  const biometricOn = isBiometricUnlockEnabled();
  const passkeyOn = isPasskeyUnlockEnabled() && isPasskeyRegistered();

  const { data: s3 = {} } = useQuery({
    queryKey: ["security-posture-s3"],
    queryFn: async () => {
      // hasDuressPin / hasStealthPool / hasPanicPin are non-destructive store
      // reads (no key material, no network). Best-effort: default to off on error.
      const [duress, stealth, panic] = await Promise.all([
        wallet.hasDuressPin().catch(() => false),
        wallet.hasStealthPool().catch(() => false),
        wallet.hasPanicPin().catch(() => false),
      ]);
      return { duress, stealth, panic };
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
            <p className="text-sm text-muted-foreground">Your wallet's security posture, in one place.</p>
          </div>
        </div>
        <span className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-secondary text-muted-foreground font-semibold uppercase tracking-wide">
          {DEMO ? "Demo · simulated" : "Testnet"}
        </span>
      </div>

      {/* Posture summary — honest headline, never "safe". */}
      <div className={`p-4 rounded-xl border ${highCount > 0 ? "border-destructive/30 bg-destructive/5" : review.length > 0 ? "border-yellow-500/30 bg-yellow-500/5" : "border-border bg-card/50"}`}>
        <div className="flex items-start gap-3">
          {highCount > 0
            ? <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            : review.length > 0
              ? <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
              : <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />}
          <div className="flex-1 min-w-0">
            {loading ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Reviewing local signals…</p>
            ) : review.length > 0 ? (
              <>
                <p className="text-sm font-semibold">
                  {review.length} item{review.length > 1 ? "s" : ""} worth reviewing
                  {highCount > 0 && <span className="text-destructive"> · {highCount} high-risk</span>}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Protections on: {[biometricOn && "biometric", passkeyOn && "passkey", !autoLockNever && `auto-lock ${autoLockLabel}`, s3.duress && "duress PIN", s3.panic && "panic wipe"].filter(Boolean).join(", ") || "none"}.
                </p>
              </>
            ) : (
              <p className="text-sm font-semibold">No KNOWN locally-detectable items to review right now.</p>
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
      </div>

      {/* Pre-sign simulation — honest about being on-demand, not stored. */}
      <div className="p-3 rounded-lg border border-border bg-card/50 flex items-start gap-2 text-xs text-muted-foreground">
        <ScanSearch className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p>
          Transaction Simulation runs the same checks (unlimited approvals, look-alike & known-bad
          recipients, large outflows) <span className="font-medium text-foreground">at the moment you sign</span> —
          results are computed on-device per transaction and aren't stored. The counts above are the
          standing signals those same checks would flag today.
        </p>
      </div>

      {/* Protection status — what's ON / OFF, each links to its existing page. */}
      <div>
        <h2 className="text-sm font-semibold mb-2">Protections</h2>
        <div className="space-y-2">
          <FeatureRow icon={Fingerprint} label="Biometric unlock" on={biometricOn} detail={biometricOn ? "Required to unlock" : "Not required"} path="/biometric-auth" />
          <FeatureRow icon={KeyRound} label="Passkey unlock" on={passkeyOn} detail={passkeyOn ? "Registered & required" : isPasskeyRegistered() ? "Registered, not required" : "Not registered"} path="/settings" />
          <FeatureRow icon={Lock} label="Auto-lock" on={!autoLockNever} detail={autoLockNever ? "Never — won't lock when idle" : `Locks after ${autoLockLabel} idle`} path="/settings" />
          <FeatureRow icon={Lock} label="Duress PIN" on={s3.duress} detail={s3.duress ? "Decoy wallet configured" : "No decoy configured"} path="/duress-pin" gapWhenOff={false} />
          <FeatureRow icon={Ghost} label="Stealth wallets" on={s3.stealth} detail={s3.stealth ? "Hidden-wallet pool seeded" : "Pool not seeded"} path="/stealth-wallets" gapWhenOff={false} />
          <FeatureRow icon={Bomb} label="Panic wipe" on={s3.panic} detail={s3.panic ? "Panic PIN configured" : "No panic PIN"} path="/panic-wipe" gapWhenOff={false} />
        </div>
      </div>

      {/* Honest coverage note — KNOWN signals only, never a guarantee. */}
      <div className="p-3 rounded-xl bg-secondary/50 border border-border">
        <p className="text-xs text-muted-foreground">
          This dashboard surfaces <span className="font-medium text-foreground">known, locally-detectable</span> signals
          from data already on your device — it makes no external calls and is not a guarantee that your wallet is safe.
          Absence of a warning means nothing suspicious was detected locally, not that an address, contract, or approval
          is confirmed safe. Always verify independently before signing.
        </p>
      </div>
    </div>
  );
}
