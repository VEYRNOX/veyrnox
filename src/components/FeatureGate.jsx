// src/components/FeatureGate.jsx
//
// Central route-level enforcement of the feature classification AND the
// Safety Plus subscription tier. Wraps the Layout <Outlet/> so EVERY routed
// sub-page is gated in one place: a 'cut' route renders Not Found, a
// 'disabled' route renders the honest notice, a Safety-Plus-only route
// renders a paywall notice for free users, everything else renders normally.
// Reads the current path from the router, unless an explicit `path` is
// passed (see below).
import { useLocation } from 'react-router-dom';
import { featureRouteOutcome } from '@/lib/featureRegistry';
import { isSafetyPlusRoute } from '@/lib/safetyPlusRoutes';
import { useTier } from '@/lib/TierProvider';
import HonestDisabledPage from './HonestDisabledPage';
import TierLockedPage from './TierLockedPage';
import PageNotFound from '@/lib/PageNotFound';

// `path` overrides the router location, for callers that render a specific page
// outside the routed <Outlet/> — notably the always-mounted mobile root-tab
// panels in Layout, which would otherwise bypass the gate entirely.
export default function FeatureGate({ children, path }) {
  const { pathname } = useLocation();
  const { currentTier, loading } = useTier();
  const target = path ?? pathname;

  const outcome = featureRouteOutcome(target);
  if (outcome === 'notFound') return <PageNotFound />;
  if (outcome === 'disabled') return <HonestDisabledPage path={target} />;

  if (isSafetyPlusRoute(target)) {
    if (loading) {
      return (
        <div className="max-w-md mx-auto mt-12 text-sm text-muted-foreground text-center">
          Loading…
        </div>
      );
    }
    if (currentTier !== 'safety_plus') return <TierLockedPage />;
  }

  return children;
}
