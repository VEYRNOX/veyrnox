import { Badge } from '@/components/ui/badge';
import { DEMO } from '@/api/demoClient';

export default function DemoBanner() {
  // Gate on the RUNTIME demo resolution (src/api/demoClient.js) so the disclosure
  // also shows for a dev-server `?demo=1` session (localStorage veyrnox-demo=1),
  // not just a build-time VITE_DEMO_MODE=1 build. Release safety is preserved by
  // DEMO itself: in a VITE_RELEASE=1 build the localStorage/query-param opt-in is
  // statically dead-code-eliminated, so DEMO is false unless VITE_DEMO_MODE was
  // explicitly baked in → the banner still never renders in a real release build.
  if (!DEMO) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 flex justify-center pb-2 pointer-events-none z-50" style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}>
      <Badge variant="caution" className="pointer-events-auto">
        Demo — simulated balances, no real transactions
      </Badge>
    </div>
  );
}
