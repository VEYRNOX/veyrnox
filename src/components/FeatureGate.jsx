// src/components/FeatureGate.jsx
//
// Central route-level enforcement of the feature classification. Wraps the
// Layout <Outlet/> so EVERY routed sub-page is gated by the registry in one
// place (rather than wrapping ~80 individual routes): a 'cut' route renders
// Not Found, a 'disabled' route renders the honest notice instead of the page,
// a 'live' route renders normally. Reads the current path from the router,
// unless an explicit `path` is passed (see below).
import { useLocation } from 'react-router-dom';
import { featureRouteOutcome } from '@/lib/featureRegistry';
import HonestDisabledPage from './HonestDisabledPage';
import PageNotFound from '@/lib/PageNotFound';

// `path` overrides the router location, for callers that render a specific page
// outside the routed <Outlet/> — notably the always-mounted mobile root-tab
// panels in Layout, which would otherwise bypass the gate entirely.
export default function FeatureGate({ children, path }) {
  const { pathname } = useLocation();
  const target = path ?? pathname;
  const outcome = featureRouteOutcome(target);
  if (outcome === 'notFound') return <PageNotFound />;
  if (outcome === 'disabled') return <HonestDisabledPage path={target} />;
  return children;
}
