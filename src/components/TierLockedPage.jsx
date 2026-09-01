//
// Full-page honest notice for a route that requires the Safety Plus
// entitlement the current user doesn't have. Distinct from
// HonestDisabledPage.jsx (which explains a feature that's off for everyone) —
// this feature IS live, just paywalled, so the notice points at /plans instead
// of explaining an engineering limitation.
import { Sparkles } from 'lucide-react';
import { Link } from 'react-router';

export default function TierLockedPage({ tier = 'safety_plus' }) {
  const isAi = tier === 'ai_security_protection';
  const heading = isAi ? 'AI Security Protection feature' : 'Safety Plus feature';
  const body = isAi
    ? 'This feature is part of AI Security Protection. Contact sales to unlock it.'
    : 'This feature is part of Safety Plus ($5.99/mo). Upgrade to unlock it.';
  return (
    <div className="max-w-md mx-auto mt-12 p-6 rounded-2xl border border-primary/30 bg-primary/5 flex items-start gap-3">
      <Sparkles className="h-6 w-6 text-primary shrink-0 mt-0.5" />
      <div className="text-sm min-w-0">
        <p className="font-semibold text-foreground">{heading}</p>
        <p className="text-muted-foreground mt-1">{body}</p>
        <Link
          to="/plans"
          className="inline-block mt-3 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          View plans
        </Link>
      </div>
    </div>
  );
}
