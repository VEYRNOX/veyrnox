//
// Full-page honest notice for a route that requires the Safety Plus
// entitlement the current user doesn't have. Distinct from
// HonestDisabledPage.jsx (which explains a feature that's off for everyone) —
// this feature IS live, just paywalled, so the notice points at /plans instead
// of explaining an engineering limitation.
import { Link } from 'react-router';
import Vigil from '@/components/Vigil';

export default function TierLockedPage({ tier = 'safety_plus' }) {
  const isAi = tier === 'ai_security_protection';
  const heading = isAi ? 'AI Security Protection feature' : 'Safety Plus feature';
  const body = isAi
    // Was "Contact sales to unlock it." — AI Security Protection is sold as an
    // in-app subscription on /plans, so that line contradicted the paywall it
    // links to AND steered a digital unlock outside IAP (App Store 3.1.1).
    // No price here, same reason as the Safety Plus line below.
    ? 'This feature is part of AI Security Protection. Upgrade to unlock it.'
    // No price here: /plans renders the STORE-returned price (and any offer),
    // so a number typed in this file can only ever be a second, drifting source.
    : 'This feature is part of Safety Plus. Upgrade to unlock it.';
  return (
    <div className="max-w-md mx-auto mt-12 p-6 rounded-2xl border border-primary/30 bg-primary/5 flex flex-col items-center gap-4 text-center">
      {/* Vigil asleep — this route's protection is not running for this user.
          The sleeping state is the honest one for a paywall (I4): off duty,
          never sad, never implying cover that has not been paid for. Vigil
          self-gates on deniability/demo, so there is no guard here. */}
      <Vigil state="asleep" size={72} />
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
