import { Link, useLocation } from 'react-router';
import { Compass, Home } from 'lucide-react';

// Plain on-device 404. No backend dependency.
//
// Design-system note: this used to render `bg-slate-50` with slate-300/600/800
// text — a light card in an app whose entire surface is near-black (#050608 →
// #1D222B) with a single teal accent. On a phone it flashed white, which reads
// as a crashed page rather than a wrong URL. It now uses the same semantic
// tokens as every other surface, so it follows the theme instead of fighting it.
export default function PageNotFound() {
  const location = useLocation();
  // Cap the reflected path: a long URL otherwise pushed the card wider than the
  // viewport and produced horizontal scroll on the one screen that exists to
  // tell you something went wrong. `break-all` handles the rest.
  const raw = location.pathname.replace(/^\//, '');
  const pageName = raw.length > 60 ? `${raw.slice(0, 60)}…` : raw;

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-background text-foreground">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="mx-auto h-14 w-14 rounded-2xl border border-primary/30 bg-card flex items-center justify-center">
          <Compass className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <p className="mono-value text-4xl font-semibold text-primary">404</p>
          <h1 className="text-2xl font-semibold">Page not found</h1>
        </div>

        <p className="text-muted-foreground leading-relaxed">
          {pageName ? (
            <>
              Nothing is routed at{' '}
              <span className="mono-value text-foreground break-all">/{pageName}</span>.
            </>
          ) : (
            <>That address isn&apos;t routed in this app.</>
          )}{' '}
          Your wallet data on this device is unaffected.
        </p>

        {/* Router Link, not window.location.href: a full document reload tears
            down the in-memory session and re-runs the whole unlock path just to
            move one route. */}
        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Home className="h-4 w-4" aria-hidden="true" />
          Go home
        </Link>
      </div>
    </div>
  );
}
