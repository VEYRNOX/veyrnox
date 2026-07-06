//
// Full-page honest notice for a route that requires the Safety Plus
// entitlement the current user doesn't have. Distinct from
// HonestDisabledPage.jsx (which explains a feature that's off for everyone) —
// this feature IS live, just paywalled, so the notice points at /plans instead
// of explaining an engineering limitation.
import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function TierLockedPage() {
  return (
    <div className="max-w-md mx-auto mt-12 p-6 rounded-2xl border border-primary/30 bg-primary/5 flex items-start gap-3">
      <Sparkles className="h-6 w-6 text-primary shrink-0 mt-0.5" />
      <div className="text-sm min-w-0">
        <p className="font-semibold text-foreground">Premium feature</p>
        <p className="text-muted-foreground mt-1">
          This feature is part of Safety Plus ($5.99/mo). Upgrade to unlock it.
        </p>
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
