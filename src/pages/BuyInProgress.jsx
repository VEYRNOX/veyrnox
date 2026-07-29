// @ts-nocheck
// src/pages/BuyInProgress.jsx
//
// Neutral polling screen the user lands on after returning from Transak's
// hosted widget. Two hard rules pinned by the spec:
//
//   1. NEVER display success from the return-URL payload. A spoofed return URL
//      cannot show a fake "purchase complete" — confirmation comes only from
//      on-chain observation of the deposit address (I5 backend-untrusted
//      applied to Transak specifically). The `tid` query param is passed
//      through only so a future support flow can look up the Transak
//      transaction if it never lands.
//
//   2. Hidden entirely in deniability/demo. A coerced user who happens to
//      navigate here (e.g. via history) must see nothing that betrays a real
//      wallet's on-ramp activity.
//
// On-chain polling is deliberately NOT wired in this MVP — the user's own
// Dashboard / Receive flow already polls their addresses. A dedicated
// "arrived" toast is a follow-up (needs a snapshot of pre-Buy balance to diff
// against, which we don't capture yet).

import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BackButton from '@/components/BackButton';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

export default function BuyInProgress() {
  const { t } = useTranslation('wallet');
  const [params] = useSearchParams();

  // Render gate — deniability wins over any query string. `tid` is discarded
  // when the gate fires; a decoy user must not learn anything from the URL.
  if (isDeniabilityOrDemoActive()) return null;

  // The tid is intentionally NOT displayed to the user (no support-lookup UI
  // yet); it's only preserved in the URL for the potential future flow.
  // eslint-disable-next-line no-unused-vars
  const _tid = params.get('tid') || '';

  return (
    <div className="max-w-md mx-auto space-y-6">
      <BackButton className="mb-2" />

      <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <Clock className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-base font-semibold">
            {t('buy.in_progress.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('buy.in_progress.body')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('buy.in_progress.hint')}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button asChild variant="secondary" className="w-full">
            <Link to="/">{t('nav.tab_home')}</Link>
          </Button>
          <Button asChild variant="secondary" className="w-full">
            <Link to="/receive">{t('nav.tab_receive')}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
