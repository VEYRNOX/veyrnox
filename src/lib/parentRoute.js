// lib/parentRoute.js
//
// Parent-route fallback map for mobile back navigation. When a user arrives on a
// sub-page via deep-link (notification, share) there's no browser history to
// navigate(-1) into. This map provides a sensible parent for every route prefix
// so back always lands somewhere meaningful instead of collapsing to "/".
//
// Fixes: #1156 (navigate(-1) fallback) + #1157 (fromMore state-restored nav).

const PARENT_MAP = {
  '/send': '/',
  '/receive': '/',
  '/settings': '/',
  '/notifications': '/',
  '/hd-wallet': '/',
  '/tx-history': '/',
  '/security-dashboard': '/',
  '/security': '/',
  '/wallet-access': '/',
  '/duress-pin': '/security-dashboard',
  '/stealth-wallets': '/security-dashboard',
  '/panic-wipe': '/security-dashboard',
  '/biometric-auth': '/security-dashboard',
  '/rasp-security': '/security-dashboard',
  '/anomaly-detection': '/security-dashboard',
  '/hardware-wallet': '/security-dashboard',
  '/personal-backup': '/security-dashboard',
  '/wallet-seed-qr': '/security-dashboard',
  '/dapp-alerts': '/security-dashboard',
  '/security-scanner': '/security-dashboard',
  '/token-approvals': '/security-dashboard',
  '/trust-score': '/security-dashboard',
  '/fraud': '/security-dashboard',
  '/voice-commands': '/security-dashboard',
  '/address-checker': '/security-dashboard',
  '/session-manager': '/security-dashboard',
  '/login-activity': '/security-dashboard',
  '/walletconnect': '/',
  '/connect': '/',
  '/address-book': '/',
  '/watch-wallets': '/',
  '/live-balances': '/',
  '/network-manager': '/',
  '/solana': '/',
  '/gas-fees': '/',
  '/analytics': '/',
  '/advanced-analytics': '/analytics',
  '/correlation': '/analytics',
  '/correlation-timeline': '/analytics',
  '/dashboard-widgets': '/',
  '/risk-score': '/',
  '/referrals': '/',
  '/news-sentiment': '/',
  '/price-charts': '/',
  '/alerts': '/',
  '/portfolio-rewind': '/',
  '/watchlist': '/',
  '/nft': '/',
  '/nft-multichain': '/nft',
  '/spending': '/',
  '/snapshots': '/',
  '/onchain': '/',
  '/savings': '/',
  '/budget': '/',
  '/net-worth': '/',
  '/docs': '/settings',
  '/fee-analytics': '/',
  '/crypto-signing': '/',
  '/recurring': '/',
  '/calculator': '/',
  '/receipt': '/',
  '/split-bill': '/',
  '/subscription': '/settings',
};

export function getParentRoute(pathname) {
  if (PARENT_MAP[pathname]) return PARENT_MAP[pathname];
  const prefix = Object.keys(PARENT_MAP).find((key) => pathname.startsWith(key + '/'));
  if (prefix) return PARENT_MAP[prefix];
  return '/';
}

export function isFromMoreDrawer(pathname) {
  return !['/', '/send', '/receive', '/settings'].includes(pathname);
}
