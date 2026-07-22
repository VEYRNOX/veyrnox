// @ts-nocheck
// components/subscription/OutcomeSteps.jsx
//
// Outcome-first paywall preamble: three pages shown BEFORE pricing, each
// selling a result rather than a feature list. Rendered by pages/Subscription.jsx
// for users who don't already hold safety_plus.
//
// HONESTY NOTE (deliberate, do not "simplify" away):
// Page 1 states the coercion-resistance outcome AND its limit in the same
// breath. Duress mode is runtime deniability — a decoy vault — NOT
// hidden-volume storage; forensic inspection of device storage can still show
// a second vault exists. That caveat is carried in docs/ and in the Safety Plus
// screens, and this is the screen where someone under real threat decides
// whether to rely on it. "Reveals nothing to someone holding your phone" is
// both accurate and stronger than an unqualified claim — see the S-1 finding
// (2026-07-20 weekly audit) for what happens when these caveats get stripped.

import { ShieldOff, KeyRound, ScanEye, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const OUTCOME_STEPS = [
  {
    key: "coercion",
    Icon: ShieldOff,
    kicker: "If you're forced to open it",
    headline: "They see a wallet that isn't yours.",
    body:
      "A separate PIN opens a decoy wallet with its own balance and history. " +
      "To someone holding your phone, nothing of yours is there.",
    limit:
      "Runtime deniability, not hidden-volume storage — a forensic examination " +
      "of the device can still show a second vault exists.",
  },
  {
    key: "custody",
    Icon: KeyRound,
    kicker: "If we get breached",
    headline: "There is nothing of yours to take.",
    body:
      "Keys are generated and encrypted on this device, sealed to its secure " +
      "hardware. We hold no copy, so we cannot move your funds — and neither " +
      "can anyone who breaches us.",
    limit: null,
  },
  {
    key: "presign",
    Icon: ScanEye,
    kicker: "Before you sign",
    headline: "See what it actually does.",
    body:
      "Transactions are simulated locally and screened for poisoned and " +
      "look-alike addresses, in plain language, before you approve.",
    limit: null,
  },
];

export default function OutcomeSteps({ step, onNext, onBack, onSkip }) {
  const s = OUTCOME_STEPS[step];
  if (!s) return null;
  const { Icon } = s;
  const isLast = step === OUTCOME_STEPS.length - 1;

  return (
    <div className="space-y-6" data-testid="outcome-step" data-step={s.key}>
      <div className="flex items-center gap-2" aria-hidden="true">
        {OUTCOME_STEPS.map((o, i) => (
          <span
            key={o.key}
            className={
              "h-1 rounded-full transition-all " +
              (i === step ? "w-8 bg-primary" : "w-4 bg-muted-foreground/25")
            }
          />
        ))}
        <span className="sr-only">
          Step {step + 1} of {OUTCOME_STEPS.length}
        </span>
      </div>

      <div className="rounded-2xl border border-primary/25 bg-primary/5 p-6 space-y-4">
        <Icon className="h-7 w-7 text-primary" aria-hidden="true" />
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {s.kicker}
          </p>
          <h2 className="text-2xl font-bold leading-snug text-foreground">
            {s.headline}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
        </div>

        {s.limit && (
          // Not fine print. Rendered at the same size as the body copy on
          // purpose — a caveat a coerced user cannot read is not a caveat.
          <p className="text-sm text-caution/90 leading-relaxed border-t border-caution/20 pt-3">
            {s.limit}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {step > 0 && (
          <Button variant="ghost" onClick={onBack} disabled={!onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        )}
        <Button className="flex-1" onClick={onNext}>
          {isLast ? "See plans" : "Next"}
          <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        Skip to pricing
      </button>
    </div>
  );
}
