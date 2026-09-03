// pages/AiSecurityProtection.jsx — route /ai-security-protection
//
// AI Security Protection feature hub. Mirrors SafetyPlus.jsx in shape.
// Free / Safety Plus users see every AI Security feature with a lock badge;
// AI Security Protection subscribers see an "Active" badge.
//
// Unlike Safety Plus, AI Security features are surface overlays (Vigil
// advisor, phishing screening on Send, dApp warnings, threat-intel) rather
// than standalone routes, so tiles are non-navigational.
//
// The tier here comes from the real, verified, fail-closed entitlement via
// useTier(). AI Security Protection is BUILT / unit-tested only, NOT
// device-verified.

import { Link } from "react-router";
import { ShieldCheck, Sparkles, Lock, Check, Bot, Radar } from "lucide-react";
import BackButton from "@/components/BackButton";
import { useTier } from "@/lib/TierProvider";
import { TIER, AI_SECURITY_PROTECTION_FEATURES } from "@/lib/tier";
import { useAdvisorSnapshot } from "@/lib/useAdvisorSnapshot";

const SECTIONS = [
  {
    nav: "INCLUDED",
    icon: ShieldCheck,
    features: AI_SECURITY_PROTECTION_FEATURES.filter((f) =>
      f.name.toLowerCase().includes("safety plus"),
    ),
  },
  {
    nav: "LIVE AI ADVISOR",
    icon: Bot,
    features: AI_SECURITY_PROTECTION_FEATURES.filter((f) =>
      /vigil|advisor/i.test(f.name),
    ),
  },
  {
    nav: "THREAT DETECTION",
    icon: Radar,
    features: AI_SECURITY_PROTECTION_FEATURES.filter(
      (f) =>
        !/safety plus|vigil|advisor/i.test(f.name),
    ),
  },
];

function FeatureTile({ feature, isUnlocked }) {
  return (
    <div className={`flex items-start justify-between gap-3 p-4 rounded-xl border bg-card min-h-[60px] ${isUnlocked ? "" : "opacity-60"}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{feature.name}</p>
          {!isUnlocked && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-700 shrink-0">
              <Lock className="h-2.5 w-2.5" />
              AI Security
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
    </div>
  );
}

export default function AiSecurityProtection() {
  const { currentTier } = useTier();
  const isUnlocked = currentTier === TIER.AI_SECURITY_PROTECTION;

  useAdvisorSnapshot({
    ai_security_protection: {
      unlocked: isUnlocked,
    },
  });

  return (
    <div className="max-w-lg mx-auto space-y-8 pb-10">
      <BackButton />

      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-5 w-5 text-sky-600" />
          <h1 className="text-2xl font-bold tracking-tight">AI Security Protection</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {isUnlocked
            ? "Your AI Security Protection features — live TIP-backed threat intel on top of every Safety Plus feature."
            : "Live Vigil AI advisor plus real-time threat intelligence on top of every Safety Plus feature. Unlocks when you upgrade."}
        </p>
      </div>

      {!isUnlocked && (
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-sky-500/30 bg-sky-500/5">
          <div>
            <p className="text-sm font-semibold">Upgrade to AI Security Protection</p>
            <p className="text-xs text-muted-foreground mt-0.5">Includes every Safety Plus feature · via Google Play &amp; App Store at launch</p>
          </div>
          <Link
            to="/plans"
            className="shrink-0 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 transition-colors"
          >
            View plans
          </Link>
        </div>
      )}

      {SECTIONS.map((section) => {
        if (section.features.length === 0) return null;
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
        AI Security Protection is a paid subscription via Google Play &amp; the App Store (mobile only).
        These features are BUILT and unit-tested; on-device purchase verification is
        still pending.
      </p>
    </div>
  );
}
