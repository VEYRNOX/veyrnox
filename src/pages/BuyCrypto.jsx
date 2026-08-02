// @ts-nocheck
// src/pages/BuyCrypto.jsx
//
// MoonPay fiat on-ramp — landing screen.
// Ship gate (VITE_BUY_ENABLED) + live deniability gate must BOTH pass before
// this page renders anything interactive. The URL builder has its own I3
// chokepoint (BUY_DENIABILITY_BLOCKED) as a second-line defence.
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { Browser } from '@capacitor/browser';
import { CreditCard, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import BackButton from '@/components/BackButton';
import CoinLogo from '@/components/CoinLogo';
import FiatCurrencySelector from '@/components/FiatCurrencySelector';
import { useWallet } from '@/lib/WalletProvider';
import { useBuyEnabled } from '@/lib/buy/useBuyEnabled';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession.js';
import { buildMoonpayUrl, MOONPAY_ASSET_MAP } from '@/lib/buy/moonpayUrl';
import { signMoonpayUrl } from '@/api/moonpaySign';
import { resolveReceive } from '@/lib/receiveAddress';
import { toast } from '@/lib/toast';

const SUPPORTED_SYMBOLS = [...new Set(MOONPAY_ASSET_MAP.map((r) => r.asset))];

const ASSET_NETWORK_DEFAULTS = Object.fromEntries(
  MOONPAY_ASSET_MAP.map((r) => [r.asset, r.network]),
);

function getNetworks(asset) {
  return MOONPAY_ASSET_MAP.filter((r) => r.asset === asset).map((r) => r.network);
}

function deliversNote(asset, network, t) {
  const row = MOONPAY_ASSET_MAP.find((r) => r.asset === asset && r.network === network);
  if (!row) return null;
  const delivered = row.moonpayCode.startsWith('eth_') ? 'ETH' : null;
  if (!delivered || delivered === asset) return null;
  return t('buy.receives_note', { deliveredAsset: delivered, network });
}

export default function BuyCrypto() {
  const { t } = useTranslation('wallet');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // All hooks ABOVE early returns (rules-of-hooks + mid-session deniability flip safety)
  const { accounts, btcAccount, solAccount } = useWallet();
  const buyEnabled = useBuyEnabled();

  const [asset, setAsset] = useState(searchParams.get('asset') ?? 'ETH');
  const [network, setNetwork] = useState(ASSET_NETWORK_DEFAULTS[asset] ?? 'ethereum');
  const [fiat, setFiat] = useState('USD');
  const [amount, setAmount] = useState('');
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [opening, setOpening] = useState(false);

  const handleAssetChange = useCallback((sym) => {
    setAsset(sym);
    setNetwork(ASSET_NETWORK_DEFAULTS[sym] ?? getNetworks(sym)[0]);
  }, []);

  // Deniability gate — returns null (no trace)
  if (isDeniabilityOrDemoActive()) return null;

  // Ship gate — show unavailable card
  if (!buyEnabled) {
    return (
      <div className="max-w-lg mx-auto pt-4 space-y-4">
        <BackButton />
        <div
          data-testid="buy-unavailable"
          className="rounded-2xl border border-border bg-card p-6 text-center space-y-2"
        >
          <CreditCard className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="font-semibold">{t('buy.unavailable.title')}</p>
          <p className="text-sm text-muted-foreground">{t('buy.unavailable.body')}</p>
        </div>
      </div>
    );
  }

  const networks = getNetworks(asset);
  const receivesNote = deliversNote(asset, network, t);
  const apiKey = import.meta.env.VITE_MOONPAY_API_KEY ?? '';
  const environment = import.meta.env.VITE_MOONPAY_ENVIRONMENT ?? 'STAGING';

  const handleContinue = () => {
    if (!apiKey) {
      toast.error(t('buy.error.browser_open_failed'));
      return;
    }
    setShowDisclosure(true);
  };

  const handleOpen = async () => {
    // Address read at press-time (not at mount), never stored in state
    const wallet = { accounts, btcAccount, solAccount };
    const resolved = resolveReceive(asset, wallet);
    const walletAddress = resolved?.address ?? '';

    let url;
    try {
      url = buildMoonpayUrl({
        asset,
        network,
        walletAddress,
        apiKey,
        environment,
        baseCurrencyCode: fiat,
        baseCurrencyAmount: amount || undefined,
      });
    } catch (e) {
      toast.error(t('buy.error.browser_open_failed'));
      setShowDisclosure(false);
      return;
    }

    setOpening(true);
    setShowDisclosure(false);
    try {
      const signedUrl = await signMoonpayUrl(url);
      await Browser.open({ url: signedUrl, presentationStyle: 'popover' });
    } catch {
      toast.error(t('buy.error.browser_open_failed'));
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto pt-4 space-y-5" data-testid="buy-crypto-page">
      <BackButton />
      <div className="space-y-1">
        <h1 className="text-xl font-bold">{t('buy.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('buy.subtitle')}</p>
      </div>

      {/* Asset selector */}
      <div className="space-y-1.5">
        <Label>{t('buy.asset_label')}</Label>
        <Select value={asset} onValueChange={handleAssetChange}>
          <SelectTrigger>
            <div className="flex items-center gap-2">
              <CoinLogo symbol={asset} size={20} />
              <span>{asset}</span>
            </div>
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_SYMBOLS.map((sym) => (
              <SelectItem key={sym} value={sym}>
                <div className="flex items-center gap-2">
                  <CoinLogo symbol={sym} size={20} />
                  <span>{sym}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Network selector — only shown when multiple networks exist for this asset */}
      {networks.length > 1 && (
        <div className="space-y-1.5">
          <Label>Network</Label>
          <Select value={network} onValueChange={setNetwork}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {networks.map((n) => (
                <SelectItem key={n} value={n}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Delivered-asset note for ARB/OP (deliver ETH, not ARB/OP) */}
      {receivesNote && (
        <p className="text-xs text-muted-foreground" role="status">
          {receivesNote}
        </p>
      )}

      {/* Amount + fiat */}
      <div className="space-y-1.5">
        <Label htmlFor="buy-amount" id="buy-amount-label">{t('buy.amount_label')}</Label>
        <div className="flex gap-2">
          <Input
            id="buy-amount"
            aria-labelledby="buy-amount-label"
            className="mono-value flex-1"
            placeholder={t('buy.amount_placeholder')}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
          />
          <FiatCurrencySelector value={fiat} onChange={setFiat} triggerClassName="w-24 h-9 text-sm" />
        </div>
      </div>

      {/* Provider info */}
      <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-0.5">
        <p className="text-sm font-medium">{t('buy.provider.moonpay')}</p>
        <p className="text-xs text-muted-foreground">{t('buy.provider.moonpay_description')}</p>
      </div>

      <Button
        className="w-full gap-2"
        onClick={handleContinue}
        disabled={opening}
        data-testid="buy-continue-btn"
      >
        <CreditCard className="h-4 w-4" />
        {t('buy.continue')}
      </Button>

      {/* Disclosure dialog */}
      <Dialog open={showDisclosure} onOpenChange={setShowDisclosure}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('buy.disclosure.title')}</DialogTitle>
            <DialogDescription>{t('buy.disclosure.body')}</DialogDescription>
          </DialogHeader>
          <a
            href="https://www.moonpay.com/legal/privacy_policy"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t('buy.disclosure.link_label')}
          </a>
          <DialogFooter className="flex gap-2 flex-row">
            <Button variant="outline" onClick={() => setShowDisclosure(false)}>
              {t('buy.disclosure.cancel')}
            </Button>
            <Button onClick={handleOpen} disabled={opening}>
              {t('buy.disclosure.continue')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
