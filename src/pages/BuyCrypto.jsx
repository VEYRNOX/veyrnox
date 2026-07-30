// @ts-nocheck
// src/pages/BuyCrypto.jsx
//
// The Buy landing screen: pick an amount + fiat + asset+network, tap Continue,
// hand off to Transak's hosted widget in SFSafariViewController / Chrome
// Custom Tabs via @capacitor/browser.
//
// Address correctness (I5): the deposit address is READ at press-time from the
// on-device wallet — never at mount, never from a cached value, never from a
// URL param. `resolveReceive`-equivalent inline mapping below picks the right
// address family per Transak network name.
//
// Deniability (I3): mount is gated by `isDeniabilityOrDemoActive()`; the URL
// builder (`transakUrl.js`) has its own egress gate that throws
// BUY_DENIABILITY_BLOCKED even if this render check were somehow bypassed.
// Two-chokepoint pattern — K-2 discipline (see docs/transak-integration-spec.md §5).

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { CreditCard, ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import BackButton from '@/components/BackButton';
import CoinLogo from '@/components/CoinLogo';
import FiatCurrencySelector from '@/components/FiatCurrencySelector';
import { getAsset } from '@/wallet-core/assets';
import { useWallet } from '@/lib/WalletProvider';
import { useLocalePreferences } from '@/lib/useLocale';
import { toast } from '@/lib/toast';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { useBuyEnabled } from '@/lib/buy/useBuyEnabled';
import { buildTransakUrl, supportedAssetNetworks, BuyError } from '@/lib/buy/transakUrl';

// Transak network → address family. Kept local (not exported) — the URL builder
// is the source of truth for which network strings are valid; this table only
// answers "given that network, which of the wallet's addresses do we hand off?".
const EVM_NETWORKS = new Set([
  'ethereum', 'polygon', 'arbitrum', 'optimism', 'avaxcchain', 'bsc',
]);

// Transak network key → user-facing network name. Kept local; the URL builder's
// matrix owns the raw string, this table just prettifies for display.
const NETWORK_LABEL = {
  ethereum:   'Ethereum',
  polygon:    'Polygon',
  arbitrum:   'Arbitrum',
  optimism:   'Optimism',
  avaxcchain: 'Avalanche C-Chain',
  bsc:        'BNB Smart Chain',
  mainnet:    'Bitcoin',
  solana:     'Solana',
};
function resolveDepositAddress(network, { accounts, btcAccount, solAccount }) {
  if (EVM_NETWORKS.has(network)) return accounts?.[0]?.address ?? null;
  if (network === 'mainnet')     return btcAccount?.address ?? null;
  if (network === 'solana')      return solAccount?.address ?? null;
  return null;
}

export default function BuyCrypto() {
  const { t } = useTranslation('wallet');
  const navigate = useNavigate();
  const buyEnabled = useBuyEnabled();
  const { accounts, btcAccount, solAccount, isUnlocked } = useWallet();
  const { fiatCurrency, setFiatCurrency } = useLocalePreferences();

  // ALL hooks must run before ANY early return. The gates below are not static:
  // useBuyEnabled subscribes to DENIABILITY_SESSION_CHANGED_EVENT, so a
  // mid-session flip re-renders this component — and if the hooks sat after the
  // gate, that re-render would call FEWER hooks than the last one and React
  // would tear the subtree down with "Rendered fewer hooks than expected". A
  // crash at the moment of coercion, on the exact path the gate exists to
  // protect. eslint's react-hooks/rules-of-hooks catches the ordering; the
  // reason it matters here is the live subscription.

  // First supported row is the default (ETH on ethereum). The picker key is
  // the concatenation because (USDC, ethereum) and (USDC, polygon) are two
  // distinct rows for the same asset.
  const [pickKey, setPickKey] = useState(
    `${supportedAssetNetworks[0].asset}:${supportedAssetNetworks[0].network}`,
  );
  const [amount, setAmount] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [showDisclosure, setShowDisclosure] = useState(false);

  const pick = useMemo(
    () => supportedAssetNetworks.find(r => `${r.asset}:${r.network}` === pickKey)
       ?? supportedAssetNetworks[0],
    [pickKey],
  );

  // Two-chokepoint deniability: render gate here + URL-builder throw at press-
  // time. If ANY of the three fail, render nothing / show the unavailable card.
  if (isDeniabilityOrDemoActive()) return null;
  if (!buyEnabled) {
    return (
      <div className="max-w-md mx-auto space-y-6">
        <BackButton className="mb-2" />
        <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-3">
          <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center mx-auto">
            <AlertTriangle className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-base font-semibold">{t('buy.unavailable.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('buy.unavailable.body')}</p>
        </div>
      </div>
    );
  }

  // The gate's verdict and the user-facing message are derived from the SAME
  // expression, so they cannot drift. The 2026-07-27 Send review found exactly
  // this shape broken: the button gated on well-formedness while the error
  // message returned null for every malformed case, so Continue silently did
  // nothing and said nothing. `[^\d.]` stripping still admits "1.2.3", "." and
  // "..", so this case is reachable by typing, not just by paste.
  const amountValid = amount === '' || (Number(amount) > 0 && Number.isFinite(Number(amount)));
  const showAmountError = amountTouched && !amountValid;
  const canContinue = isUnlocked && amountValid;

  const onContinue = () => {
    if (!canContinue) return;
    setShowDisclosure(true);
  };

  const proceedToTransak = async () => {
    // Read the address AT PRESS-TIME. `resolveDepositAddress` reads from the
    // live wallet snapshot passed into this render — a stale snapshot would
    // fail the null check below rather than deliver funds to a wrong address.
    const address = resolveDepositAddress(pick.transakNetwork, { accounts, btcAccount, solAccount });
    if (!address) {
      toast.error(t('buy.error.browser_open_failed'));
      return;
    }

    let url;
    try {
      url = buildTransakUrl({
        asset: pick.asset,
        network: pick.network,
        address,
        apiKey: import.meta.env.VITE_TRANSAK_API_KEY,
        environment: import.meta.env.VITE_TRANSAK_ENVIRONMENT || 'STAGING',
        redirectURL: 'https://veyrnox.com/buy/return',
        fiatCurrency,
        fiatAmount: amount ? Number(amount) : undefined,
      });
    } catch (err) {
      // BuyError.code === 'BUY_DENIABILITY_BLOCKED' is the deniability path;
      // silently no-op (the render gate should have caught this already, but
      // the second chokepoint is here on purpose). Any other error is a
      // config bug — surface a generic message and log the code for support.
      if (!(err instanceof BuyError) || err.code !== 'BUY_DENIABILITY_BLOCKED') {
        toast.error(t('buy.error.browser_open_failed'));
        if (import.meta.env.DEV) console.error('buildTransakUrl:', err);
      }
      setShowDisclosure(false);
      return;
    }

    setShowDisclosure(false);
    try {
      if (Capacitor.isNativePlatform()) {
        // presentationStyle: 'popover' gives SFSafariViewController on iOS and
        // Chrome Custom Tabs on Android — the OS-native "in-app browser" chrome
        // users expect from a wallet's Buy flow. Not a WKWebView; separate
        // cookie jar; Transak's telemetry runs OUT of our app process.
        await Browser.open({ url, presentationStyle: 'popover' });
      } else {
        // Web fallback (dev only). Opens in a new tab; production web build
        // has the Buy button hidden by VITE_BUY_ENABLED anyway.
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      navigate('/buy/in-progress');
    } catch (err) {
      toast.error(t('buy.error.browser_open_failed'));
      if (import.meta.env.DEV) console.error('Browser.open:', err);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      <BackButton className="mb-2" />

      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-semibold">{t('buy.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('buy.subtitle')}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="buy-amount" className="text-xs text-muted-foreground">
              {t('buy.amount_label')}
            </Label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                id="buy-amount"
                inputMode="decimal"
                placeholder={t('buy.amount_placeholder')}
                value={amount}
                onChange={(e) => { setAmountTouched(true); setAmount(e.target.value.replace(/[^\d.]/g, '')); }}
                // `.mono-value`, not `font-mono` — the house token also carries
                // the slashed zero and letter-spacing every verifiable value gets.
                className={`flex-1 mono-value ${showAmountError ? 'border-destructive' : ''}`}
                aria-invalid={!amountValid}
                aria-describedby={showAmountError ? 'buy-amount-error' : undefined}
              />
              <FiatCurrencySelector
                value={fiatCurrency}
                onChange={setFiatCurrency}
                triggerClassName="h-14 w-24 text-sm font-medium"
                showName
              />
            </div>
            {/* role="status"/polite, not alert: this fires while the user is
                still typing, so an assertive live region would interrupt on
                every keystroke. Rendered only once touched, so a pristine form
                is silent. */}
            {showAmountError && (
              <p
                id="buy-amount-error"
                role="status"
                aria-live="polite"
                className="mt-1.5 text-xs text-destructive"
              >
                {t('buy.error.amount_malformed')}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="buy-asset" className="text-xs text-muted-foreground">
              {t('buy.asset_label')}
            </Label>
            {/* Mirrors the Send asset picker (CoinLogo + Name — SYMBOL, with a
                network subtitle to disambiguate rows like USDC on ETH vs USDC on
                Polygon — same shape as SendCrypto.jsx line 1408-1432). */}
            <Select value={pickKey} onValueChange={setPickKey}>
              <SelectTrigger
                id="buy-asset"
                className="mt-1.5 h-14 [&>span]:flex [&>span]:items-center [&>span]:gap-3"
              >
                <SelectValue>
                  {pick ? (
                    <>
                      <CoinLogo symbol={pick.asset} size={32} />
                      <span className="flex flex-col items-start leading-tight">
                        <span className="text-sm font-medium">
                          {getAsset(pick.asset)?.name || pick.asset} — {pick.asset}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          on {NETWORK_LABEL[pick.transakNetwork] || pick.transakNetwork}
                        </span>
                      </span>
                    </>
                  ) : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {supportedAssetNetworks.map((r) => (
                  <SelectItem key={`${r.asset}:${r.network}`} value={`${r.asset}:${r.network}`}>
                    <div className="flex items-center gap-3">
                      <CoinLogo symbol={r.asset} size={24} />
                      <div className="flex flex-col leading-tight">
                        <span className="text-sm font-medium">
                          {getAsset(r.asset)?.name || r.asset} — {r.asset}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          on {NETWORK_LABEL[r.transakNetwork] || r.transakNetwork}
                        </span>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* What the user will ACTUALLY receive. For ARB and OP the app's asset
            symbol is not the token Transak delivers: both rows are the native
            gas asset, which on Arbitrum and Optimism is ETH (assets.js documents
            this), so `transakCode` is 'ETH'. That mapping is correct, but a
            picker reading "Arbitrum — ARB" next to a widget that says ETH invites
            the reading "it swapped my asset". State the delivered asset whenever
            it differs from the row's own symbol. */}
        {pick.transakCode !== pick.asset && (
          <p className="text-xs text-muted-foreground">
            {t('buy.receives_note', {
              received: pick.transakCode,
              network: NETWORK_LABEL[pick.transakNetwork] || pick.transakNetwork,
            })}
          </p>
        )}

        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs font-medium">{t('buy.provider.transak')}</p>
          <p className="text-xs text-muted-foreground">{t('buy.provider.transak_description')}</p>
        </div>

        <Button
          className="w-full gap-2"
          onClick={onContinue}
          disabled={!canContinue}
        >
          <ExternalLink className="h-4 w-4" />
          {t('buy.continue')}
        </Button>
      </div>

      <Dialog open={showDisclosure} onOpenChange={setShowDisclosure}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('buy.disclosure.title')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('buy.disclosure.body')}</p>
          <p className="text-xs">
            <a
              href="https://transak.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              {t('buy.disclosure.link_label')}
            </a>
          </p>
          <DialogFooter className="gap-2">
            <Button variant="secondary" onClick={() => setShowDisclosure(false)}>
              {t('buy.disclosure.cancel')}
            </Button>
            <Button onClick={proceedToTransak}>
              {t('buy.disclosure.continue')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
