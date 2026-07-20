// @ts-nocheck
// pages/Subscription.jsx — route /plans
//
// Native (iOS/Android): real purchase flow via RevenueCat — fetches the
// current offering, purchases the Safety Plus package, and refreshes the
// tier context on success. Web has no App Store/Play Store (web stays
// testing-only; see CLAUDE.md), so it keeps a disabled, honest preview.

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  getTierOffering,
  purchasePackage,
  restorePurchases,
  manageSubscription,
  setReferralAttribute,
  SAFETY_PLUS_MONTHLY_PACKAGE,
  SAFETY_PLUS_ANNUAL_PACKAGE,
} from "@/lib/purchases";
import {
  getRedeemedCode,
  hasRedeemed,
  hasAttributed,
  markAttributed,
  getTier,
  getTierInfo,
  getOfferingIdForTier,
  calculateDiscountCents,
  PLAN_FULL_PRICE_CENTS,
} from "@/lib/referral";
import { recordAttribution, fetchPaidCount } from "@/api/referralApi";

const CURRENT_BADGE = "bg-success/10 text-success border-success/20";

// Compact, scannable feature summary — names only, capped, with a "+N more" pill.
// The full detailed lists live on /safety-plus (grouped by SECURITY · FINANCE ·
// CONNECT), linked from the summary, so /plans stays short and pricing-focused.
function HighlightChips({ features, max = 6 }) {
  const shown = features.slice(0, max);
  const rest = features.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((f) => (
        <span
          key={f.name}
          className="inline-flex items-center gap-1 text-xs rounded-full border border-border bg-muted/40 px-2.5 py-1 text-foreground/80"
        >
          <Check className="h-3 w-3 text-success shrink-0" />
          {f.name}
        </span>
      ))}
      {rest > 0 && (
        <span className="inline-flex items-center text-xs rounded-full px-2.5 py-1 text-muted-foreground">
          +{rest} more
        </span>
      )}
    </div>
  );
}

export default function Subscription() {
  const { currentTier, refreshTier } = useTier();
  const [monthlyPackage, setMonthlyPackage] = useState(null);
  const [annualPackage, setAnnualPackage] = useState(null);
  const [referralMonthly, setReferralMonthly] = useState(null);
  const [referralAnnual, setReferralAnnual] = useState(null);
  const [referrerTierInfo, setReferrerTierInfo] = useState(null);
  const [billing, setBilling] = useState("annual");
  const [busy, setBusy] = useState(false);
  // F-radiogroup (2026-07-20 branch review): the two billing buttons were
  // role="radio" inside a role="radiogroup" but relied on plain Tab-order +
  // click, with no arrow-key movement and no roving tabindex. Both buttons
  // were already natively focusable and Enter/Space-operable, so this was an
  // APG pattern deviation rather than a keyboard block — but a real
  // radiogroup should move (and select) with the arrow keys, matching native
  // <input type="radio"> group behaviour.
  const monthlyRadioRef = useRef(null);
  const annualRadioRef = useRef(null);
  const BILLING_ORDER = ["monthly", "annual"];
  const billingRadioRefs = { monthly: monthlyRadioRef, annual: annualRadioRef };
  function handleBillingKeyDown(e) {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const idx = BILLING_ORDER.indexOf(billing);
    const next = BILLING_ORDER[(idx + dir + BILLING_ORDER.length) % BILLING_ORDER.length];
    setBilling(next);
    billingRadioRefs[next].current?.focus();
  }
  const isNative = Capacitor.isNativePlatform();
  const hasReferral = hasRedeemed();

  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;

    function extractPackages(offering) {
      const packages = offering?.availablePackages ?? [];
      const monthly = packages.find((p) => p.identifier === SAFETY_PLUS_MONTHLY_PACKAGE) ?? null;
      const annual = packages.find((p) => p.identifier === SAFETY_PLUS_ANNUAL_PACKAGE) ?? null;
      const fallback = !monthly && !annual ? packages[0] ?? null : null;
      return { monthly: monthly ?? fallback, annual };
    }

    getOfferings()
      .then((offering) => {
        if (cancelled) return;
        const { monthly, annual } = extractPackages(offering);
        setMonthlyPackage(monthly);
        setAnnualPackage(annual);
      })
      .catch((err) => {
        console.warn("Safety Plus offerings unavailable:", err);
      });

    if (hasReferral) {
      const refCode = getRedeemedCode();
      if (refCode) {
        fetchPaidCount(refCode)
          .then((paid) => {
            if (cancelled || paid == null) return;
            const tierKey = getTier(paid);
            const info = getTierInfo(paid);
            setReferrerTierInfo(info);
            const offeringId = getOfferingIdForTier(tierKey);
            if (!offeringId) return;
            return getTierOffering(offeringId);
          })
          .then((offering) => {
            if (cancelled || !offering) return;
            const { monthly, annual } = extractPackages(offering);
            setReferralMonthly(monthly);
            setReferralAnnual(annual);
          })
          .catch(() => {});
      }
    }

    return () => { cancelled = true; };
  }, [isNative, hasReferral]);

  const hasDiscount = hasReferral && Boolean(referralMonthly || referralAnnual);
  const effectiveMonthly = (hasDiscount && referralMonthly) ? referralMonthly : monthlyPackage;
  const effectiveAnnual = (hasDiscount && referralAnnual) ? referralAnnual : annualPackage;

  // Both monthly and annual plans always exist as product offerings, so the
  // toggle always renders. On sideloaded builds where Play Billing is
  // unavailable, `effectiveMonthly`/`effectiveAnnual` are null — the toggle
  // still shows both plans with fallback price strings, and `handleUpgrade`
  // early-returns on a falsy `selectedPackage` (I4, fail-honest).
  const hasAnnualToggle = true;
  const effectiveBilling = billing;
  const selectedPackage = effectiveBilling === "annual" ? effectiveAnnual : effectiveMonthly;

  const monthlyPriceString = effectiveMonthly?.product?.priceString ?? "$5.99/mo";
  const annualPriceString = effectiveAnnual?.product?.priceString ?? "$49.99/yr";
  const regularMonthlyPrice = monthlyPackage?.product?.priceString;
  const regularAnnualPrice = annualPackage?.product?.priceString;
  const selectedPriceString = effectiveBilling === "annual" ? annualPriceString : monthlyPriceString;

  async function handleUpgrade() {
    if (!selectedPackage) return;
    setBusy(true);
    try {
      await purchasePackage(selectedPackage);
      await refreshTier();
      const refCode = getRedeemedCode();
      if (refCode && !hasAttributed()) {
        const fullPrice = PLAN_FULL_PRICE_CENTS[effectiveBilling] || PLAN_FULL_PRICE_CENTS.monthly;
        const commission = referrerTierInfo?.commission || 0;
        const discountCents = calculateDiscountCents(fullPrice, commission);
        try {
          await recordAttribution(refCode, effectiveBilling, fullPrice, discountCents);
          markAttributed();
        } catch { /* best-effort — retry on next purchase if Supabase failed */ }
        setReferralAttribute(refCode).catch(() => {});
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
    <div className="max-w-xl mx-auto p-6 space-y-6">
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

      {hasDiscount && currentTier !== "safety_plus" && (
        <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/5 p-4">
          <Sparkles className="h-5 w-5 text-success shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-success">
              Referral discount applied{referrerTierInfo ? ` — ${referrerTierInfo.commission}% off` : ""}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              You used a friend&rsquo;s referral code — enjoy a discounted rate on Safety Plus.
            </p>
          </div>
        </div>
      )}

      {/* ── Quick feature summary (names only; full detail on /safety-plus) ── */}
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Free</h2>
            <span className="text-sm font-bold">$0</span>
            {currentTier === "free" && (
              <Badge variant="outline" className={`${CURRENT_BADGE} text-[10px] px-1.5 py-0 h-4`}>Current</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Everything to hold, send and secure your crypto — no account required.</p>
          <HighlightChips features={FREE_FEATURES} max={6} />
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-primary flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Safety Plus adds
            {currentTier === "safety_plus" && (
              <Badge variant="outline" className={`${CURRENT_BADGE} text-[10px] px-1.5 py-0 h-4`}>Current</Badge>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">Coercion resistance, pre-sign intelligence and advanced analytics.</p>
          <HighlightChips features={SAFETY_PLUS_FEATURES} max={6} />
          <Link to="/safety-plus" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            See all Safety Plus features <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* ── Pricing (Month / Year) ── */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            Safety Plus
            <Sparkles className="h-4 w-4 text-primary" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentTier === "safety_plus" ? (
            <>
              <p className="text-sm text-muted-foreground">You&rsquo;re on Safety Plus — all features unlocked.</p>
              {isNative && (
                <>
                  <Button variant="outline" className="w-full" onClick={handleManage}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Manage subscription
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Opens the {Capacitor.getPlatform() === "ios" ? "App Store" : "Play Store"} settings —
                    cancel, change plan or update payment there.
                  </p>
                </>
              )}
            </>
          ) : (
            <>
              {/* Month / Year selector */}
              {hasAnnualToggle && (
                <div
                  role="radiogroup"
                  aria-label="Billing period"
                  onKeyDown={handleBillingKeyDown}
                  className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-muted/40 border border-border"
                >
                  <button
                    ref={monthlyRadioRef}
                    type="button"
                    role="radio"
                    aria-checked={effectiveBilling === "monthly"}
                    tabIndex={effectiveBilling === "monthly" ? 0 : -1}
                    onClick={() => setBilling("monthly")}
                    className={
                      "text-sm rounded-md px-3 py-2 transition-colors text-center " +
                      (effectiveBilling === "monthly"
                        ? "bg-background border border-border font-medium"
                        : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    Monthly
                    <span className="block text-xs text-muted-foreground font-normal">
                      {monthlyPriceString}
                      {hasDiscount && regularMonthlyPrice && regularMonthlyPrice !== monthlyPriceString && (
                        <span className="ml-1 line-through opacity-60">{regularMonthlyPrice}</span>
                      )}
                    </span>
                  </button>
                  <button
                    ref={annualRadioRef}
                    type="button"
                    role="radio"
                    aria-checked={effectiveBilling === "annual"}
                    tabIndex={effectiveBilling === "annual" ? 0 : -1}
                    onClick={() => setBilling("annual")}
                    className={
                      "text-sm rounded-md px-3 py-2 transition-colors text-center relative " +
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
                      {hasDiscount && regularAnnualPrice && regularAnnualPrice !== annualPriceString && (
                        <span className="ml-1 line-through opacity-60">{regularAnnualPrice}</span>
                      )}
                    </span>
                  </button>
                </div>
              )}

              {/* Selected price */}
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">{selectedPriceString}</span>
                {hasDiscount && (
                  <span className="text-base text-muted-foreground line-through">
                    {effectiveBilling === "annual" ? regularAnnualPrice : regularMonthlyPrice}
                  </span>
                )}
              </div>
              {effectiveBilling === "annual" && (
                <p className="text-xs text-muted-foreground -mt-2">Billed annually — 4 months free vs. monthly.</p>
              )}

              {/* CTA */}
              <Button
                disabled={!isNative || !selectedPackage || busy}
                className="w-full"
                onClick={handleUpgrade}
              >
                {busy ? <Loader2 className="h-4 w-4 mr-2 motion-safe:animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                {isNative ? `Upgrade — ${selectedPriceString}` : "Upgrade — mobile only"}
              </Button>
              {isNative ? (
                <button
                  type="button"
                  onClick={handleRestore}
                  disabled={busy}
                  className="text-xs text-muted-foreground underline w-full text-center"
                >
                  Restore purchases
                </button>
              ) : (
                <p className="text-xs text-muted-foreground text-center">
                  No payment can be made on this screen. Your plan stays Free on web.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
