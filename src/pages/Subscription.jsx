// pages/Subscription.jsx — route /plans
//
// PREVIEW SCREEN ONLY. This page DISPLAYS a subscription/tier model. There is no
// payment system, no in-app purchase, no upgrade flow, and no success state. The
// upgrade button is permanently disabled. The current tier comes from TierProvider
// (always "free" today). Listing a feature under a tier does NOT gate or unlock it
// — every "available" feature shown here already works for all users. See
// lib/tier.js for the entitlement stub that real billing will replace.

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Info } from "lucide-react";
import BackButton from "@/components/BackButton";
import { useTier } from "@/lib/TierProvider";
import { PRO_FEATURES } from "@/lib/tier";

// Mirrors the honest available/roadmap badge styling used in pages/Features.jsx.
const STATUS_META = {
  available: { label: "Available", className: "bg-success/10 text-success border-success/20" },
};

export default function Subscription() {
  const { currentTier, tiers } = useTier();

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <BackButton />

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Plans</h1>
        <div className="text-muted-foreground mt-1 text-sm">
          You are on the{" "}
          <Badge variant="outline" className={STATUS_META.available.className}>
            Free plan
          </Badge>{" "}
          — the complete self-custody wallet, no account required.
        </div>
      </div>

      {/* Preview / not-final disclosure */}
      <div className="flex items-start gap-3 rounded-xl border border-caution/20 bg-caution/5 p-4">
        <Info className="h-5 w-5 text-caution shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Pricing is a working model, not final. This is a preview screen; no
          payment system is active.
        </p>
      </div>

      {/* Tier cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {tiers.map((tier) => {
          const isCurrent = tier.id === currentTier;
          return (
            <Card key={tier.id} className={isCurrent ? "border-primary/50" : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{tier.name}</CardTitle>
                  {isCurrent && (
                    <Badge variant="outline" className={STATUS_META.available.className}>
                      Current plan
                    </Badge>
                  )}
                </div>
                <p className="text-2xl font-bold mt-1">{tier.price}</p>
                <CardDescription>{tier.tagline}</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Pro's built features (display-only; these already work for everyone). */}
                {tier.id === "pro" && (
                  <ul className="space-y-2">
                    {PRO_FEATURES.map((f) => (
                      <li key={f.name} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
                        <span>
                          <span className="font-medium">{f.name}</span>
                          <span className="block text-xs text-muted-foreground">{f.summary}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {tier.id === "free" && (
                  <p className="text-sm text-muted-foreground">
                    The complete self-custody wallet plus all life-safety security
                    (duress PIN, panic wipe, decoy balances) — at no cost, on principle.
                  </p>
                )}
                {tier.id === "shield" && (
                  <p className="text-sm text-muted-foreground">
                    Everything in Pro, extended across time, devices and succession.
                    Its distinguishing features (inheritance, software recovery,
                    multi-device) are on the roadmap — this card is a preview only.
                  </p>
                )}
                {tier.id === "guardian" && (
                  <p className="text-sm text-muted-foreground">
                    Not a higher software rung — the SHIELD software plus a security
                    team that operates it with you. Offered by application; details
                    to be confirmed, preview only.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Upgrade button — permanently DISABLED (no payment system exists). */}
      <div className="flex flex-col items-center gap-2 pt-2">
        <Button disabled className="w-full max-w-md">
          <Sparkles className="h-4 w-4 mr-2" />
          In-app purchase coming at launch - subscriptions are not available yet.
        </Button>
        <p className="text-xs text-muted-foreground text-center max-w-md">
          No payment can be made on this screen. The current plan stays Free until
          real billing is wired up.
        </p>
      </div>
    </div>
  );
}
