// src/components/TelemetryConsent.jsx — GDPR-style opt-in for anonymous telemetry.
//
// DENIAL IS NEVER TRANSMITTED. This previously fired CONSENT_DENIED through
// trackEvent() directly, bypassing the consent gate — so tapping "No thanks"
// still wrote a row to Supabase AND minted a persistent veyrnox-device-id for
// a user who had just declined. A refusal is now recorded purely locally.
//
// CONSENT_GRANTED still fires: setConsent(true) writes synchronously, so the
// consent check inside trackEvent() already reads 'granted' when we call it.
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { BarChart3, ShieldCheck } from 'lucide-react';
import { setConsent } from '@/lib/consent';
import { FunnelEvent } from '@/lib/analytics';
import { trackEvent } from '@/api/trackEvent';

export default function TelemetryConsent({ onChoice }) {
  const { t } = useTranslation('security');
  // A11y: WalletEntry swaps its whole subtree for this screen, so focus would
  // otherwise fall to <body> with nothing announced. Move focus to the labelled
  // region on mount so assistive tech lands on the decision being asked.
  const regionRef = useRef(null);
  useEffect(() => { regionRef.current?.focus(); }, []);

  const choose = (granted) => {
    setConsent(granted);
    if (granted) {
      Promise.resolve(trackEvent(FunnelEvent.CONSENT_GRANTED, {})).catch(() => {});
    }
    onChoice(granted);
  };

  return (
    <section
      ref={regionRef}
      tabIndex={-1}
      role="group"
      aria-labelledby="telemetry-consent-heading"
      className="max-w-sm mx-auto space-y-6 p-6 text-center outline-none"
    >
      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
        <BarChart3 className="h-6 w-6 text-primary" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <h2 id="telemetry-consent-heading" className="text-lg font-semibold">{t('telemetry_consent.heading')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('telemetry_consent.body')}
        </p>
      </div>
      <div className="flex items-start gap-3 text-start p-3 rounded-xl bg-card border border-border">
        <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-muted-foreground">
          {t('telemetry_consent.device_id_note')}
        </p>
      </div>
      <div className="space-y-2">
        <Button className="w-full" onClick={() => choose(true)}>
          {t('telemetry_consent.cta_grant')}
        </Button>
        <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => choose(false)}>
          {t('telemetry_consent.cta_deny')}
        </Button>
      </div>
    </section>
  );
}
