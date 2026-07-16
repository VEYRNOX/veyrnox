// pages/SafetyPlus.jsx — route /safety-plus
//
// Safety Plus feature hub. Grouped by nav section so users understand where
// each feature lives. Free users see every feature with a lock badge;
// Safety Plus subscribers get live navigation links.
//
// The tier here comes from the real, verified, fail-closed entitlement via
// useTier() (lib/TierProvider -> lib/entitlement resolveTier). In-app purchase
// (App Store / Play Billing via RevenueCat) is wired end to end — BUILT /
// unit-tested only, NOT device-verified. Route access is enforced by the tier
// gate in components/FeatureGate, not by this display component.

import { Link } from "react-router-dom";
import { ShieldCheck, TrendingUp, Link2, Lock, Sparkles, ArrowRight, Check } from "lucide-react";
import BackButton from "@/components/BackButton";
import { useTier } from "@/lib/TierProvider";

// Safety Plus hub, grouped by nav section to mirror the public plans page at
// https://veyrnox.com/plans. Every route below is in the SAFETY_PLUS_ROUTES
// gated set (the SafetyPlus.routes test enforces that). Three plans-page
// Safety-Plus items — Calldata decode, Address-poisoning warnings and
// Transaction simulation — are embedded in the Send flow (not standalone
// routes) and so are not listed here; see SAFETY_PLUS_ROUTES.
const SECTIONS = [
  {
    nav: "SECURITY",
    icon: ShieldCheck,
    features: [
      { name: "Duress PIN", summary: "Decoy wallet under coercion", route: "/duress-pin" },
      { name: "Stealth / Hidden Wallets", summary: "Deniable hidden-wallet pool", route: "/stealth-wallets" },
      { name: "Panic Wipe", summary: "Irreversible local key destruction", route: "/panic-wipe" },
      { name: "Hardware Wallet (Trezor)", summary: "Cold-key signing — keys never leave the device", route: "/hardware-wallet" },
      { name: "Anomaly / Fraud Detection", summary: "Rule-based deviation flags over your own history", route: "/anomaly-detection" },
      { name: "Suspicious-Address Screening", summary: "Local blocklist + sanctioned-address checks", route: "/address-checker" },
      { name: "Token Approvals (View + Revoke)", summary: "Inspect and revoke ERC-20 allowances", route: "/token-approvals" },
      { name: "Spending Limits", summary: "Per-transaction and daily caps", route: "/budget" },
      { name: "Spam Token Filter", summary: "Auto-hide airdropped scam tokens", route: "/spam-filter" },
      { name: "Encrypted Personal Backup", summary: "Export an encrypted .enc vault file off-device", route: "/personal-backup" },
      { name: "Audit Log", summary: "Encrypted local activity record", route: "/audit-log" },
    ],
  },
  {
    nav: "FINANCE",
    icon: TrendingUp,
    features: [
      { name: "Advanced Analytics", summary: "Sharpe ratio, correlation matrix, volatility analysis", route: "/advanced-analytics" },
      { name: "On-Chain Analytics", summary: "Address-level transaction activity and insights", route: "/onchain" },
      { name: "Recurring Payments", summary: "Scheduled payment reminders with built-in Send flow", route: "/recurring" },
    ],
  },
  {
    nav: "CONNECT",
    icon: Link2,
    features: [
      { name: "Message Signing", summary: "Proof-of-ownership without sending funds", route: "/crypto-signing" },
    ],
  },
];

function FeatureTile({ feature, isUnlocked }) {
  const inner = (
    <div className="flex items-start justify-between gap-3 p-4 rounded-xl border bg-card transition-colors min-h-[60px]"
         style={{ borderColor: isUnlocked ? "hsl(var(--border))" : "hsl(var(--border))" }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{feature.name}</p>
          {!isUnlocked && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
              <Lock className="h-2.5 w-2.5" />
              Safety Plus
            </span>
          )}
          {isUnlocked && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-success/10 text-success shrink-0">
              <Check className="h-2.5 w-2.5" />
              Active
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{feature.summary}</p>
      </div>
      {isUnlocked && <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
    </div>
  );

  if (isUnlocked) {
    return <Link to={feature.route} className="block hover:opacity-90 transition-opacity">{inner}</Link>;
  }
  return <div className="opacity-60 cursor-not-allowed select-none">{inner}</div>;
}

export default function SafetyPlus() {
  const { currentTier } = useTier();
  const isUnlocked = currentTier === "safety_plus";

  return (
    <div className="max-w-lg mx-auto space-y-8 pb-10">
      <BackButton />

      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Safety Plus</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {isUnlocked
            ? "Your Safety Plus features — tap any to open."
            : "Deeper security controls and advanced analytics. Features below unlock when you upgrade."}
        </p>
      </div>

      {!isUnlocked && (
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-primary/30 bg-primary/5">
          <div>
            <p className="text-sm font-semibold">Upgrade to Safety Plus</p>
            <p className="text-xs text-muted-foreground mt-0.5">$5.99/mo or $49.99/yr · via Google Play &amp; App Store at launch</p>
          </div>
          <Link
            to="/plans"
            className="shrink-0 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            View plans
          </Link>
        </div>
      )}

      {SECTIONS.map((section) => {
        const Icon = section.icon;
        return (
          <div key={section.nav} className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-border">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{section.nav}</h2>
            </div>
            <div className="space-y-2">
              {section.features.map((f) => (
                <FeatureTile key={f.name} feature={f} isUnlocked={isUnlocked} />
              ))}
            </div>
          </div>
        );
      })}

      <p className="text-xs text-muted-foreground text-center pt-2">
        Safety Plus is a paid subscription via Google Play &amp; the App Store (mobile only).
        These features are BUILT and unit-tested; on-device purchase verification is
        still pending.
      </p>
    </div>
  );
}
