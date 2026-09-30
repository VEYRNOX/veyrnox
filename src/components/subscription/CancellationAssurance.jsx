// "Your wallet remains yours" panel, plus the two expandable explainers
// (why a subscription, can I recover after cancelling). Rendered ABOVE the
// legal/renewal text on both paid-tier paywalls, never only below it.
import { ShieldCheck } from 'lucide-react';
import {
  WALLET_REMAINS_YOURS,
  AI_AGENT_LIMITS,
  WHY_SUBSCRIPTION,
  RECOVERY_FAQ,
} from '@/lib/subscriptionCopy';

export function CancellationAssurance({ showAgentLimits = false }) {
  return (
    <section
      aria-labelledby="wallet-remains-yours"
      data-testid="cancellation-assurance"
      className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2"
    >
      <h3 id="wallet-remains-yours" className="text-sm font-semibold flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
        {WALLET_REMAINS_YOURS.heading}
      </h3>
      <p className="text-xs text-muted-foreground">{WALLET_REMAINS_YOURS.body}</p>
      <p className="text-xs text-muted-foreground">{WALLET_REMAINS_YOURS.recovery}</p>
      <p className="text-xs text-muted-foreground">{WALLET_REMAINS_YOURS.ending}</p>
      {showAgentLimits && (
        <p className="text-xs text-foreground font-medium" data-testid="ai-agent-limits">
          {AI_AGENT_LIMITS}
        </p>
      )}
    </section>
  );
}

export function WhySubscription() {
  return (
    <details className="text-xs" data-testid="why-subscription">
      <summary className="cursor-pointer min-h-11 flex items-center font-medium">
        Why a subscription?
      </summary>
      <p className="text-muted-foreground pb-2">{WHY_SUBSCRIPTION}</p>
    </details>
  );
}

export function RecoveryFaq() {
  return (
    <details className="text-xs" data-testid="recovery-faq">
      <summary className="cursor-pointer min-h-11 flex items-center font-medium">
        {RECOVERY_FAQ.question}
      </summary>
      <div className="space-y-2 pb-2">
        <p className="text-muted-foreground">{RECOVERY_FAQ.answer}</p>
        <p className="text-muted-foreground">{RECOVERY_FAQ.newMaterial}</p>
      </div>
    </details>
  );
}
