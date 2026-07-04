import { Badge } from '@/components/ui/badge';

export default function DemoBanner() {
  // VITE_DEMO_MODE is baked in at build time by the build:demo script.
  // Dead-code-eliminated from build:release (VITE_DEMO_MODE is falsy).
  if (import.meta.env.VITE_DEMO_MODE !== '1') return null;

  return (
    <div className="fixed top-0 left-0 right-0 flex justify-center pt-2 pointer-events-none z-50">
      <Badge variant="caution" className="pointer-events-auto">
        Demo — simulated balances, no real transactions
      </Badge>
    </div>
  );
}
