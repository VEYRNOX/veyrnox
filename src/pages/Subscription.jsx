// @ts-nocheck
// pages/Subscription.jsx — route /plans
//
// Native (iOS/Android): real purchase flow via RevenueCat — fetches the
// current offering, purchases the Safety Plus package, and refreshes the
// tier context on success. Web has no App Store/Play Store (web stays
// testing-only; see CLAUDE.md), so it keeps a disabled, honest preview.

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Info, ArrowRight, Loader2, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "@/lib/toast";
import BackButton from "@/components/BackButton";
import { useTier } from "@/lib/TierProvider";
import { FREE_FEATURES, SAFETY_PLUS_FEATURES } from "@/lib/tier";
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  manageSubscription,
  SAFETY_PLUS_MONTHLY_PACKAGE,
  SAFETY_PLUS_ANNUAL_PACKAGE,
} from "@/lib/purchases";
import { getRedeemedCode, hasAttributed, markAttributed, PLAN_REVENUE_CENTS } from "@/lib/referral";
import { recordAttribution } from "@/api/referralApi";

const CURRENT_BADGE = "bg-success/10 text-success border-success/20";

function FeatureList({ features }) {
  return (
    <ul className="space-y-2">
      {features.map((f) => (
        <li key={f.name} className="flex items-start gap-2 text-sm">
          <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
          <span>
            <span className="font-medium">{f.name}</span>
            <span className="block text-xs text-muted-foreground">{f.summary}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function Subscription() {
  const { currentTier, refreshTier } = useTier();
  const [monthlyPackage, setMonthlyPackage] = useState(null);
  const [annualPackage, setAnnualPackage] = useState(null);
  // Default to annual — it's the recommended plan per the pricing model
  // (annual carries the discount; the toggle re-picks monthly if the user
  // prefers it). Falls back to monthly on the render side if the annual
  // package isn't in the offering yet (staged store rollout, I4).
  const [billing, setBilling] = useState("annual");
  const [busy, setBusy] = useState(false);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;
    getOfferings()
      .then((offering) => {
        if (cancelled) return;
        const packages = offering?.availablePackages ?? [];
        const monthly = packages.find((p) => p.identifier === SAFETY_PLUS_MONTHLY_PACKAGE) ?? null;
        const annual = packages.find((p) => p.identifier === SAFETY_PLUS_ANNUAL_PACKAGE) ?? null;
        // Fallback: some offerings may only carry one package during staged
        // rollout. If neither known identifier matches, take the first
        // package as a last resort so the button isn't permanently disabled
        // when the offering exists but the identifiers drifted.
        const fallback = !monthly && !annual ? packages[0] ?? null : null;
        setMonthlyPackage(monthly ?? fallback);
        setAnnualPackage(annual);
      })
      .catch((err) => {
        // Leave the upgrade button disabled (no package to buy). Surface the
        // reason for on-device debugging — a failed fetch here usually means the
        // SDK isn't configured or the RevenueCat offering isn't set up, which
        // otherwise presents as an unexplained permanently-disabled button.
        console.warn("Safety Plus offerings unavailable:", err);
      });
    return () => { cancelled = true; };
  }, [isNative]);

  // If annual isn't available (staged rollout, or offering not yet configured),
  // force the selection back to monthly rather than leaving a dead button.
  const effectiveBilling = billing === "annual" && !annualPackage ? "monthly" : billing;
  const selectedPackage = effectiveBilling === "annual" ? annualPackage : monthlyPackage;
  const hasAnnualToggle = Boolean(annualPackage && monthlyPackage);

  const monthlyPriceString = monthlyPackage?.product?.priceString ?? "$5.99/mo";
  const annualPriceString = annualPackage?.product?.priceString ?? "$49.99/yr";
  const selectedPriceString = effectiveBilling === "annual" ? annualPriceString : monthlyPriceString;

  async function handleUpgrade() {
    if (!selectedPackage) return;
    setBusy(true);
    try {
      await purchasePackage(selectedPackage);
      await refreshTier();
      const refCode = getRedeemedCode();
      if (refCode && !hasAttributed()) {
        const rev = PLAN_REVENUE_CENTS[effectiveBilling] || PLAN_REVENUE_CENTS.monthly;
        recordAttribution(refCode, effectiveBilling, rev).catch(() => {});
        markAttributed();
      }
      toast.success("Safety Plus unlocked");
    } catch (err) {
      if (!err?.userCancelled) toast.error("Purchase failed — please try again");
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    setBusy(true);
    try {
      await restorePurchases();
      const tier = await refreshTier();
      toast[tier === "safety_plus" ? "success" : "info"](
        tier === "safety_plus" ? "Safety Plus restored" : "No active Safety Plus purchase found"
      );
    } catch {
      toast.error("Restore failed — please try again");
    } finally {
      setBusy(false);
    }
  }

  async function handleManage() {
    try {
      await manageSubscription();
    } catch {
      toast.error("Couldn't open subscription settings");
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <BackButton />

      <div>
        <h1 className="text-3xl font-bold">Plans</h1>
        <div className="text-muted-foreground mt-1 text-sm">
          You are on the{" "}
          <Badge variant="outline" className={CURRENT_BADGE}>
            {currentTier === "safety_plus" ? "Safety Plus plan" : "Free plan"}
          </Badge>{" "}
          — the complete self-custody wallet, no account required.
        </div>
      </div>

      {!isNative && (
        <div className="flex items-start gap-3 rounded-xl border border-caution/20 bg-caution/5 p-4">
          <Info className="h-5 w-5 text-caution shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            In-app purchase via Google Play and App Store is available in the mobile app.
            This web build is testing-only — install Veyrnox on iOS or Android to upgrade.
          </p>
        </div>
      )}

      {isNative && (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
          <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Checking or purchasing a subscription contacts our in-app-purchase provider
            (RevenueCat) and the App Store / Google Play over the network to verify your
            entitlement. No wallet address, balance, or key material is ever sent, and this
            check is suppressed entirely in decoy/hidden sessions.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className={currentTier === "free" ? "border-primary/50" : undefined}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Free</CardTitle>
              {currentTier === "free" && (
                <Badge variant="outline" className={CURRENT_BADGE}>Current plan</Badge>
              )}
            </div>
            <p className="text-2xl font-bold mt-1">$0</p>
            <CardDescription>
              Everything you need to hold, send and secure your crypto — free forever. No account required.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FeatureList features={FREE_FEATURES} />
          </CardContent>
        </Card>

        <Card className={currentTier === "safety_plus" ? "border-primary/50" : "border-primary/20"}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                Safety Plus
                <Sparkles className="h-4 w-4 text-primary" />
              </CardTitle>
              {currentTier === "safety_plus" && (
                <Badge variant="outline" className={CURRENT_BADGE}>Current plan</Badge>
              )}
            </div>
            <p className="text-2xl font-bold mt-1">{selectedPriceString}</p>
            {effectiveBilling === "annual" && annualPackage && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Billed annually — 4 months free vs. monthly
              </p>
            )}
            <CardDescription className="mt-2">
              Everything in Free, plus pre-sign intelligence and advanced analytics.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {hasAnnualToggle && currentTier !== "safety_plus" && (
              <div
                role="radiogroup"
                aria-label="Billing period"
                className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-muted/40 border border-border"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={effectiveBilling === "monthly"}
                  onClick={() => setBilling("monthly")}
                  className={
                    "text-sm rounded-md px-3 py-2 transition-colors " +
                    (effectiveBilling === "monthly"
                      ? "bg-background border border-border font-medium"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  Monthly
                  <span className="block text-xs text-muted-foreground font-normal">
                    {monthlyPriceString}
                  </span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={effectiveBilling === "annual"}
                  onClick={() => setBilling("annual")}
                  className={
                    "text-sm rounded-md px-3 py-2 transition-colors relative " +
                    (effectiveBilling === "annual"
                      ? "bg-background border border-primary/40 font-medium"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  <span className="inline-flex items-center gap-1.5">
                    Annual
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/40 text-primary">
                      Save 30%
                    </Badge>
                  </span>
                  <span className="block text-xs text-muted-foreground font-normal">
                    {annualPriceString}
                  </span>
                </button>
              </div>
            )}
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Everything in Free, plus:</p>
            <FeatureList features={SAFETY_PLUS_FEATURES} />
          </CardContent>
        </Card>
      </div>

      <Link
        to="/safety-plus"
        className="flex items-center justify-between gap-4 p-4 rounded-xl border border-primary/20 bg-primary/5 hover:border-primary/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-semibold">Explore Safety Plus features</p>
            <p className="text-xs text-muted-foreground">See every feature grouped by SECURITY · FINANCE · CONNECT</p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-primary shrink-0" />
      </Link>

      {currentTier !== "safety_plus" && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <Button
            disabled={!isNative || !selectedPackage || busy}
            className="w-full max-w-md"
            onClick={handleUpgrade}
          >
            {busy ? <Loader2 className="h-4 w-4 mr-2 motion-safe:animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {isNative ? `Upgrade to Safety Plus — ${selectedPriceString}` : "Upgrade to Safety Plus — mobile only"}
          </Button>
          {isNative ? (
            <button
              type="button"
              onClick={handleRestore}
              disabled={busy}
              className="text-xs text-muted-foreground underline"
            >
              Restore purchases
            </button>
          ) : (
            <p className="text-xs text-muted-foreground text-center max-w-md">
              No payment can be made on this screen. Your plan stays Free on web.
            </p>
          )}
        </div>
      )}

      {currentTier === "safety_plus" && isNative && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <Button
            variant="outline"
            className="w-full max-w-md"
            onClick={handleManage}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Manage subscription
          </Button>
          <p className="text-xs text-muted-foreground text-center max-w-md">
            Opens the {Capacitor.getPlatform() === "ios" ? "App Store" : "Play Store"} subscription
            settings — cancel, change plan or update your payment method there.
          </p>
        </div>
      )}
    </div>
  );
}
