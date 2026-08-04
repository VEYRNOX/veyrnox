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
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import CoinLogo from '@/components/CoinLogo';
import { useWallet } from '@/lib/WalletProvider';
import { createBuySession } from '@/api/edgeApi';
import { ASSETS, isEvmFamily } from '@/wallet-core/assets';
import { resolveReceive } from '@/lib/receiveAddress';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { DEMO } from '@/api/demoClient';

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

  const suppressed = DEMO || isDeniabilityOrDemoActive();

  const getAddress = useCallback((symbol) => {
    const r = resolveReceive(symbol, { accounts, btcAccount, solAccount });
    return r?.address || null;
  }, [accounts, btcAccount, solAccount]);

  const handleBuy = useCallback(async () => {
    const address = getAddress(selectedAsset);
    if (!address) {
      setError('Wallet address not available. Please unlock your wallet first.');
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
        setError('Buy is not available in this session.');
      } else {
        setError(err.message || 'Could not start buy session. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedAsset, getAddress]);

  useEffect(() => {
    function onMessage(event) {
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

  if (widgetUrl) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <Button variant="ghost" size="icon" onClick={() => setWidgetUrl(null)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Buy {selectedAsset}</h1>
        </div>
        <iframe
          ref={iframeRef}
          src={widgetUrl}
          allow="camera;microphone;payment"
          className="flex-1 w-full border-none"
          style={{ minHeight: 'calc(100vh - 64px)' }}
          title="Buy crypto"
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
        <h1 className="text-lg font-semibold">Buy Crypto</h1>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold">Buy with card</p>
            <p className="text-xs text-muted-foreground">
              Purchase crypto with a debit or credit card via Transak.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" id="buy-asset-label">Asset</label>
          <Select value={selectedAsset} onValueChange={(v) => { setSelectedAsset(v); setError(null); }}>
            <SelectTrigger className="h-12 [&>span]:flex [&>span]:items-center [&>span]:gap-3" aria-labelledby="buy-asset-label">
              <SelectValue>
                {selectedAsset ? (
                  <>
                    <CoinLogo symbol={selectedAsset} size={32} />
                    <span>{BUYABLE_ASSETS.find(a => a.symbol === selectedAsset)?.name || selectedAsset} — {selectedAsset}</span>
                  </>
                ) : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {BUYABLE_ASSETS.map((a) => (
                <SelectItem key={a.symbol} value={a.symbol}>
                  <div className="flex items-center gap-2">
                    <CoinLogo symbol={a.symbol} size={20} />
                    <span>{a.name} — {a.symbol}</span>
                  </div>
                </SelectItem>
              ))}
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
              <Loader2 className="h-4 w-4 animate-spin" /> Starting...
            </>
          ) : (
            <>
              <CreditCard className="h-4 w-4" /> Continue to Buy
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
        Powered by Transak. KYC, payment processing, and delivery are handled
        by Transak — Veyrnox never sees your payment details.
      </p>
    </div>
  );
}
