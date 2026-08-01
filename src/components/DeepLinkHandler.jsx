// App-root deep-link listener. Mounted once inside <Router>. Handles:
// - veyrnox:// or https://veyrnox.com/wc links carrying a WalletConnect URI →
//   stashes URI and routes to /walletconnect (never auto-pairs).
// - https://veyrnox.com/buy/return?tid=... (MoonPay redirectURL universal link) →
//   routes to /buy/in-progress, carrying the tid param.
// Renders nothing.
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { extractWcUri, setPendingWcUri } from '@/lib/deepLinkPairing';

const BUY_RETURN_PATH = '/buy/return';

export default function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    // Deep links are a native concern; on web the URL is just the current route.
    if (!Capacitor.isNativePlatform()) return;

    let listener;

    const route = (rawUrl) => {
      // MoonPay return link: https://veyrnox.com/buy/return?tid=...
      try {
        const parsed = new URL(rawUrl);
        if (parsed.pathname === BUY_RETURN_PATH) {
          const tid = parsed.searchParams.get('tid');
          navigate(tid ? `/buy/in-progress?tid=${encodeURIComponent(tid)}` : '/buy/in-progress');
          return;
        }
      } catch {
        // rawUrl is not a valid URL — fall through to WC check
      }

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
