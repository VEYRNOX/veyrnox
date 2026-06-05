// src/components/FeatureGate.jsx
//
// Central route-level enforcement of the feature classification. Wraps the
// Layout <Outlet/> so EVERY routed sub-page is gated by the registry in one
// place (rather than wrapping ~80 individual routes): a 'cut' route renders
// Not Found, a 'disabled' route renders the honest notice instead of the page,
// a 'live' route renders normally. Reads the current path from the router.
import { useLocation } from 'react-router-dom';
import { featureRouteOutcome } from '@/lib/featureRegistry';
import HonestDisabledPage from './HonestDisabledPage';
import PageNotFound from '@/lib/PageNotFound';

export default function FeatureGate({ children }) {
  const { pathname } = useLocation();
  const outcome = featureRouteOutcome(pathname);
  if (outcome === 'notFound') return <PageNotFound />;
  if (outcome === 'disabled') return <HonestDisabledPage path={pathname} />;
  return children;
}
