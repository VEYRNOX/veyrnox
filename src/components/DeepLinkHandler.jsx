// App-root deep-link listener. Mounted once inside <Router>. When the OS launches
// or foregrounds Veyrnox via a veyrnox:// or https://veyrnox.com/wc link carrying a
// WalletConnect URI, it stashes the URI and routes to /walletconnect, where the
// connector pre-fills it for the user to review + pair (never auto-pairs — see
// deepLinkPairing.js). Renders nothing.
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
