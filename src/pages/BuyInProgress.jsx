// @ts-nocheck
// src/pages/BuyInProgress.jsx
//
// Post-handoff neutral wait screen shown after the universal link return
// (https://veyrnox.com/buy/return?tid=...) is intercepted by DeepLinkHandler.
// Polls nothing. Confirmation comes from on-chain balance observation (I5).
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession.js';
import { isBuyEnabled } from '@/lib/buy/useBuyEnabled';

export default function BuyInProgress() {
  const { t } = useTranslation('wallet');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // tid is carried through but never displayed — it could carry PII and the
  // page needs to show nothing that could be screenshotted during coercion.
  // eslint-disable-next-line no-unused-vars
  const _tid = searchParams.get('tid');

  // Both gates checked at render (not routed away in App.jsx — ship gate lives here)
  if (isDeniabilityOrDemoActive()) return null;
  if (!isBuyEnabled()) return null;

  return (
    <div
      className="max-w-lg mx-auto pt-12 space-y-6 text-center"
      data-testid="buy-in-progress-page"
    >
      <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
        <Clock className="h-8 w-8 text-primary" />
      </div>

      <div className="space-y-2">
        <h1 className="text-xl font-bold">{t('buy.in_progress.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('buy.in_progress.body')}</p>
        <p className="text-xs text-muted-foreground">{t('buy.in_progress.hint')}</p>
      </div>

      <div className="flex flex-col gap-3 pt-2">
        <Button className="w-full" onClick={() => navigate('/')}>
          {t('dashboard.title', 'Dashboard')}
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => navigate('/receive')}>
          {t('nav.tab_receive', 'Receive')}
        </Button>
      </div>
    </div>
  );
}
