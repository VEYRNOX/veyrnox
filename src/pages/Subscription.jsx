// pages/Subscription.jsx — route /plans
//
// PREVIEW SCREEN ONLY. This page DISPLAYS a subscription/tier model. There is no
// payment system, no in-app purchase, no upgrade flow, and no success state. The
// upgrade button is permanently disabled. The current tier comes from TierProvider
// (always "free" today). Listing a feature under a tier does NOT gate or unlock it
// — gating requires verified IAP receipt billing (see lib/tier.js). See
// lib/tier.js for the entitlement stub that real billing will replace.

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Info } from "lucide-react";
import BackButton from "@/components/BackButton";
import { useTier } from "@/lib/TierProvider";
import { FREE_FEATURES, SAFETY_PLUS_FEATURES } from "@/lib/tier";

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
  const { currentTier, tiers } = useTier();

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <BackButton />

      <div>
        <h1 className="text-3xl font-bold">Plans</h1>
        <div className="text-muted-foreground mt-1 text-sm">
          You are on the{" "}
          <Badge variant="outline" className={CURRENT_BADGE}>
            Free plan
          </Badge>{" "}
          — the complete self-custody wallet, no account required.
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-caution/20 bg-caution/5 p-4">
        <Info className="h-5 w-5 text-caution shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          In-app purchase via Google Play and App Store — coming at launch. No
          payment system is active yet; this is a preview screen only.
        </p>
      </div>

      {/* Tier cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Free */}
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

        {/* Safety Plus */}
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
            <p className="text-2xl font-bold mt-1">$5.99<span className="text-base font-normal text-muted-foreground">/mo</span></p>
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

      {/* Upgrade CTA — permanently disabled until billing is wired up */}
      <div className="flex flex-col items-center gap-2 pt-2">
        <Button disabled className="w-full max-w-md">
          <Sparkles className="h-4 w-4 mr-2" />
          Upgrade to Safety Plus — coming at launch
        </Button>
        <p className="text-xs text-muted-foreground text-center max-w-md">
          No payment can be made on this screen. Your plan stays Free until
          in-app purchase is available.
        </p>
      </div>
    </div>
  );
}
