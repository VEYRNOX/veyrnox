// src/components/TelemetryConsent.jsx — GDPR-style opt-in for anonymous telemetry.
//
// CONSENT_GRANTED / CONSENT_DENIED fire via trackEvent() directly, NOT
// emit() — emit() gates on hasConsent(), which would silently swallow
// CONSENT_DENIED (no consent yet) and race CONSENT_GRANTED against the
// localStorage write in setConsent(). See src/lib/analytics.js header.
import { Button } from '@/components/ui/button';
import { BarChart3, ShieldCheck } from 'lucide-react';
import { setConsent, FunnelEvent } from '@/lib/analytics';
import { trackEvent } from '@/api/trackEvent';

export default function TelemetryConsent({ onChoice }) {
  const choose = (granted) => {
    setConsent(granted);
    Promise.resolve(
      trackEvent(granted ? FunnelEvent.CONSENT_GRANTED : FunnelEvent.CONSENT_DENIED, {})
    ).catch(() => {});
    onChoice(granted);
  };

  return (
    <div className="max-w-sm mx-auto space-y-6 p-6 text-center">
      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
        <BarChart3 className="h-6 w-6 text-primary" />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Help improve Veyrnox</h2>
        <p className="text-sm text-muted-foreground">
          Share anonymous usage data so we can fix bugs and improve the experience.
          No personal info, no wallet data, no tracking across apps.
        </p>
      </div>
      <div className="flex items-start gap-3 text-left p-3 rounded-xl bg-card border border-border">
        <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          A random device ID is used — never linked to your wallet, keys, or identity.
          You can change this anytime in Settings.
        </p>
      </div>
      <div className="space-y-2">
        <Button className="w-full" onClick={() => choose(true)}>
          Help improve Veyrnox
        </Button>
        <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => choose(false)}>
          No thanks
        </Button>
      </div>
    </div>
  );
}
