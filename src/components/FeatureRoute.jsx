// src/components/FeatureRoute.jsx
//
// Route-level enforcement of the feature registry (defence in depth — cut items
// are also removed from nav). Consults featureRouteOutcome() for the current
// path:
//   'notFound' (cut)      -> render PageNotFound
//   'disabled'            -> render the honest notice instead of the page
//   'render' (live)       -> render the page unchanged
import { featureRouteOutcome } from '@/lib/featureRegistry';
import HonestDisabledPage from './HonestDisabledPage';
import PageNotFound from '@/lib/PageNotFound';

export default function FeatureRoute({ path, children }) {
  const outcome = featureRouteOutcome(path);
  if (outcome === 'notFound') return <PageNotFound />;
  if (outcome === 'disabled') return <HonestDisabledPage path={path} />;
  return children;
}
