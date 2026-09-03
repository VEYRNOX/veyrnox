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
//   3. SHIP-GATED, same as /buy. This route and its lazy chunk are registered
//      unconditionally in App.jsx, so VITE_BUY_ENABLED=false does NOT remove
//      them from a production build — only the Buy *tiles* fold away. Without
//      the gate below, a production user reaching this screen (the
//      https://veyrnox.com/buy/return universal link is LIVE on both stores'
//      association files) would be told a purchase was "being processed" when
//      no purchase can possibly have happened. That is fabricated state (I4),
//      which is why the gate is a render check and not a build-time constant.
//
// This screen POLLS NOTHING. There is no on-chain watcher here and no
// confirmation signal: the copy tells the user to check back, and the two links
// send them to Dashboard / Receive, which poll their addresses through the same
// code path any incoming transaction uses. The security property that matters
// still holds — nothing from the Transak return payload is read or displayed, so
// a spoofed return URL cannot fake a success — but do not describe this file as
// "polling for confirmation". An "arrived" toast is a follow-up (it needs a
// snapshot of the pre-Buy balance to diff against, which we don't capture yet).

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BackButton from '@/components/BackButton';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { useBuyEnabled } from '@/lib/buy/useBuyEnabled';
import { useAdvisorSnapshot } from '@/lib/useAdvisorSnapshot';

export default function BuyInProgress() {
  const { t } = useTranslation('wallet');
  // Hooks first — see the note in BuyCrypto.jsx. useBuyEnabled subscribes to the
  // deniability event, so the gates below can flip mid-session.
  const buyEnabled = useBuyEnabled();
  // Hook itself enforces I3, and this screen is I3-gated below too — call
  // before the early returns so hook order stays fixed regardless of gates.
  useAdvisorSnapshot({ buy_in_progress: { buy_enabled: buyEnabled } });

  // Render gates — deniability wins over any query string, and the ship gate
  // wins over the route being present in the bundle. `tid` is never read: there
  // is no support-lookup UI yet, and a decoy user must learn nothing from the
  // URL.
  if (isDeniabilityOrDemoActive()) return null;
  if (!buyEnabled) return null;

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
