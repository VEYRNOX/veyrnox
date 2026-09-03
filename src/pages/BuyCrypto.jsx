// @ts-nocheck
// src/pages/BuyCrypto.jsx — Fiat on-ramp via Transak.
//
// Server-side session creation: the client sends (asset, network, address) to
// the edge function; secrets never leave the server. The edge returns a one-time
// widget URL loaded in an iframe.
//
// I3: suppressed in deniability/demo (createBuySession throws I3_DENIABILITY_ACTIVE).
// I2: the request sends a fixed asset/network pair and the user's own receive
//     address — no holdings data, no browsing fingerprint beyond the IP that
//     Transak already sees from the KYC flow.

import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { CreditCard, ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import CoinLogo from '@/components/CoinLogo';
import { useWallet } from '@/lib/WalletProvider';
import { createBuySession } from '@/api/edgeApi';
import { ASSETS } from '@/wallet-core/assets';
import { resolveReceive } from '@/lib/receiveAddress';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { DEMO } from '@/api/demoClient';
import { useBuyEnabled } from '@/lib/buy/useBuyEnabled';
import { TRANSAK_ORIGINS } from '@/lib/buy/transakUrl.js';
import { useAdvisorSnapshot } from '@/lib/useAdvisorSnapshot';

// Codex P2 2026-08-15: the Transak return message MUST come from Transak's
// origin. Without this check any frame or injected same-page script can post
// a spoofed TRANSAK_ORDER_SUCCESSFUL and force the wallet to close the widget
// or navigate home even though no purchase completed. Allowlist both stg + prod
// origins to match the URLs the server-side buy-session builds against.
// Branch review 2026-08-15 (C-1): imported, not re-declared. This was the third
// independent copy of the same two hosts; see lib/buy/transakUrl.js for why they
// are centralised (drift here fails CLOSED — a missed domain silently drops
// TRANSAK_ORDER_SUCCESSFUL / TRANSAK_WIDGET_CLOSE and the widget never closes).

const TRANSAK_NETWORK_MAP = {
  ETH:   'ethereum',
  MATIC: 'polygon',
  ARB:   'arbitrum',
  OP:    'optimism',
  AVAX:  'avaxcchain',
  BNB:   'bsc',
  BTC:   'mainnet',
  SOL:   'solana',
  USDC:  'ethereum',
  USDT:  'ethereum',
};

const BUYABLE_ASSETS = ASSETS.filter(a => TRANSAK_NETWORK_MAP[a.symbol]);

export default function BuyCrypto() {
  const { t } = useTranslation('wallet');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { accounts, btcAccount, solAccount } = useWallet();

  const preselected = searchParams.get('asset');
  const [selectedAsset, setSelectedAsset] = useState(
    preselected && TRANSAK_NETWORK_MAP[preselected] ? preselected : 'ETH'
  );
  const [widgetUrl, setWidgetUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const iframeRef = useRef(null);

  // Codex P1 2026-08-15: previously gated only on deniability/demo. On a build
  // where VITE_BUY_ENABLED !== 'true' the entry tiles are dead-code-eliminated
  // but the /buy route and this page are unconditionally registered in App.jsx,
  // so a user landing directly at /buy still reached the Transak flow. Gate at
  // render on BOTH axes; useBuyEnabled() already composes SHIP_GATE + I3.
  const buyEnabled = useBuyEnabled();
  const suppressed = DEMO || isDeniabilityOrDemoActive() || !buyEnabled;

  const getAddress = useCallback((symbol) => {
    const r = resolveReceive(symbol, { accounts, btcAccount, solAccount });
    return r?.address || null;
  }, [accounts, btcAccount, solAccount]);

  const handleBuy = useCallback(async () => {
    const address = getAddress(selectedAsset);
    if (!address) {
      setError(t('buy.route.address_unavailable', { defaultValue: 'Wallet address not available. Please unlock your wallet first.' }));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { url } = await createBuySession({
        asset: selectedAsset,
        network: TRANSAK_NETWORK_MAP[selectedAsset],
        address,
      });
      setWidgetUrl(url);
    } catch (err) {
      if (err.code === 'I3_DENIABILITY_ACTIVE') {
        setError(t('buy.route.session_unavailable', { defaultValue: 'Buy is not available in this session.' }));
      } else {
        setError(err.message || t('buy.route.start_failed', { defaultValue: 'Could not start buy session. Please try again.' }));
      }
    } finally {
      setLoading(false);
    }
  }, [selectedAsset, getAddress, t]);

  useEffect(() => {
    function onMessage(event) {
      // Codex P2 2026-08-15: reject any postMessage not from a Transak origin.
      // Without this any frame or injected same-page script could post a
      // TRANSAK_ORDER_SUCCESSFUL and force close/navigate. Origin check is the
      // only reliable authenticity gate for postMessage.
      if (!TRANSAK_ORIGINS.has(event.origin)) return;
      if (!event.data?.event_id) return;
      if (event.data.event_id === 'TRANSAK_ORDER_SUCCESSFUL') {
        setWidgetUrl(null);
        navigate('/');
      }
      if (event.data.event_id === 'TRANSAK_WIDGET_CLOSE') {
        setWidgetUrl(null);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [navigate]);

  useAdvisorSnapshot({
    buy_crypto: {
      selected_asset: selectedAsset,
      widget_open: !!widgetUrl,
      loading,
      has_error: !!error,
      suppressed,
    },
  });

  if (suppressed) return null;

  if (widgetUrl) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <Button variant="ghost" size="icon" onClick={() => setWidgetUrl(null)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">{t('nav.tab_buy')} {selectedAsset}</h1>
        </div>
        <iframe
          ref={iframeRef}
          src={widgetUrl}
          // Codex P2 2026-08-15: constrain the third-party frame to the
          // minimum capability set the Transak KYC/payment flow needs.
          // Without a sandbox, a compromised/mis-served Transak page would
          // run with the full iframe capability surface PLUS the granted
          // camera/microphone/payment permissions. Kept:
          //   allow-scripts       — Transak is a JS app; without this it dies
          //   allow-same-origin   — Transak needs its own storage (cookies,
          //                         localStorage) to persist KYC session
          //   allow-forms         — required for KYC form submission
          //   allow-popups        — Transak opens an OAuth popup for some KYC
          //                         paths (e.g. bank connections)
          //   allow-popups-to-escape-sandbox — those popups need to load
          //                         genuine external URLs (banks, ID checks)
          //                         under their own security context
          //   allow-modals        — required for Transak's confirm dialogs
          // Explicitly withheld: allow-top-navigation (would let the frame
          // navigate the whole app away — enables the class of exit-scam
          // attacks a compromised widget could otherwise pull), and
          // allow-downloads (Transak does not need to hand the user files).
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
          allow="camera;microphone;payment"
          className="flex-1 w-full border-none"
          style={{ minHeight: 'calc(100vh - 64px)' }}
          title={t('buy.title')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">{t('buy.title')}</h1>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold">{t('buy.provider.transak')}</p>
            <p className="text-xs text-muted-foreground">
              {t('buy.provider.transak_description')}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" id="buy-asset-label">{t('buy.asset_label')}</label>
          <Select value={selectedAsset} onValueChange={(v) => { setSelectedAsset(v); setError(null); }}>
            <SelectTrigger className="h-12 [&>span]:flex [&>span]:items-center [&>span]:gap-3" aria-labelledby="buy-asset-label">
              <SelectValue>
                {selectedAsset ? (
                  <>
                    <CoinLogo symbol={selectedAsset} size={32} />
                    {(() => {
                      const a = BUYABLE_ASSETS.find(x => x.symbol === selectedAsset);
                      const disp = a?.displaySymbol || a?.symbol || selectedAsset;
                      const chainLabel = a?.family === "erc20" ? "Ethereum" : a?.name;
                      return <span>{disp}{chainLabel ? ` (${chainLabel})` : ""}</span>;
                    })()}
                  </>
                ) : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {BUYABLE_ASSETS.map((a) => {
                const disp = a.displaySymbol || a.symbol;
                const chainLabel = a.family === "erc20" ? "Ethereum" : a.name;
                return (
                  <SelectItem key={a.symbol} value={a.symbol}>
                    <div className="flex items-center gap-2">
                      <CoinLogo symbol={a.symbol} size={20} />
                      <span>{disp}{chainLabel ? ` (${chainLabel})` : ""}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <Button
          className="w-full gap-2"
          onClick={handleBuy}
          disabled={loading || suppressed}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> {t('buy.route.starting', { defaultValue: 'Starting...' })}
            </>
          ) : (
            <>
              <CreditCard className="h-4 w-4" /> {t('buy.continue')}
            </>
          )}
        </Button>

        {suppressed && (
          <p className="text-xs text-muted-foreground text-center">
            Buy is not available in demo or deniability mode.
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center px-4">
        {t('buy.disclosure.body')}
      </p>
    </div>
  );
}
