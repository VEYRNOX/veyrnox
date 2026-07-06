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
import { Check, Sparkles, Info, ArrowRight, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import { useTier } from "@/lib/TierProvider";
import { FREE_FEATURES, SAFETY_PLUS_FEATURES } from "@/lib/tier";
import { getOfferings, purchasePackage, restorePurchases } from "@/lib/purchases";

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
  const [plusPackage, setPlusPackage] = useState(null);
  const [busy, setBusy] = useState(false);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;
    getOfferings()
      .then((offering) => {
        if (cancelled) return;
        const pkg = offering?.availablePackages?.find((p) => p.identifier === "$rc_monthly")
          ?? offering?.availablePackages?.[0]
          ?? null;
        setPlusPackage(pkg);
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

  const priceString = plusPackage?.product?.priceString ?? "$5.99/mo";

  async function handleUpgrade() {
    if (!plusPackage) return;
    setBusy(true);
    try {
      await purchasePackage(plusPackage);
      await refreshTier();
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
              The complete self-custody wallet plus all life-safety security. No account required.
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
            <p className="text-2xl font-bold mt-1">{priceString}</p>
            <CardDescription>
              Everything in Free, plus pre-sign intelligence and advanced analytics.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
            disabled={!isNative || !plusPackage || busy}
            className="w-full max-w-md"
            onClick={handleUpgrade}
          >
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {isNative ? `Upgrade to Safety Plus — ${priceString}` : "Upgrade to Safety Plus — mobile only"}
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
    </div>
  );
}
