// App-root deep-link listener. Mounted once inside <Router>. Handles two
// universal-link surfaces:
//   1. WalletConnect pairing (https://veyrnox.com/wc or veyrnox://…): stash the
//      URI and route to /walletconnect for the user to review + pair (never
//      auto-pairs — see deepLinkPairing.js).
//   2. Transak on-ramp return (https://veyrnox.com/buy/return?tid=…): route to
//      /buy/in-progress and let the polling screen wait for the on-chain
//      confirmation. The return-URL payload is NOT trusted — see
//      docs/transak-integration-spec.md §7.3. The `tid` is passed through only
//      so a future support flow can look up the Transak transaction if the
//      user reports it never landed.
// Renders nothing.
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { extractWcUri, setPendingWcUri } from '@/lib/deepLinkPairing';

export default function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    // Deep links are a native concern; on web the URL is just the current route.
    if (!Capacitor.isNativePlatform()) return;

    let listener;

    const route = (rawUrl) => {
      // Transak on-ramp return first — a WC extractor over a /buy/return URL
      // would (correctly) return null, but doing the buy-check up front makes
      // the intent obvious and shields against a future WC extractor that
      // pattern-matches too eagerly on any veyrnox.com URL.
      try {
        const u = new URL(rawUrl);
        if (u.hostname === 'veyrnox.com' && u.pathname === '/buy/return') {
          const tid = u.searchParams.get('tid') || '';
          const qs = tid ? `?tid=${encodeURIComponent(tid)}` : '';
          navigate(`/buy/in-progress${qs}`);
          return;
        }
      } catch { /* not a parseable URL — fall through to WC path */ }

      const wc = extractWcUri(rawUrl);
      if (!wc) return; // not a pairing link — ignore, do not navigate
      setPendingWcUri(wc);
      navigate('/walletconnect');
    };

    // Cold start: the app was launched by the link (appUrlOpen does NOT fire here).
    App.getLaunchUrl()
      .then((res) => { if (res && res.url) route(res.url); })
      .catch(() => {});

    // Warm: the link was opened while the app was already running.
    App.addListener('appUrlOpen', ({ url }) => route(url))
      .then((sub) => { listener = sub; })
      .catch(() => {});

    return () => { if (listener) listener.remove(); };
  }, [navigate]);

  return null;
}
