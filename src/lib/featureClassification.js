// src/lib/featureClassification.js
//
// THE AUDIT — a deliberate verdict for every route, per the wedge-alignment
// filter (spec §2). This is the single source of truth; featureRegistry.js
// derives its runtime exceptions from CLASSIFICATION (wired in Task 2). The
// completeness test (currently skipped) fails until every ALL_ROUTE_PATHS entry
// has a verdict here.
//
// Entry shape: { verdict: 'live'|'disabled'|'cut', dataSource, note, reason? }
//   reason (disabled): 'leaks' | 'server' | 'unverified'
//   reason (cut):      'off-wedge'
//   dataSource: 'wallet-core' | 'on-device' | 'base44-entities' | 'external'
//               | 'invented' | 'static'

// Must remain de-duplicated — the completeness/phantom tests rely on it.
export const ALL_ROUTE_PATHS = [
  '/', '/send', '/receive', '/settings', '/connect', '/alerts', '/calculator',
  '/analytics', '/tax', '/security', '/security-dashboard', '/audit', '/nft',
  '/snapshots', '/pl', '/onchain', '/spending', '/advisor', '/smart-alerts',
  '/recurring', '/push', '/advanced-analytics', '/web3', '/nft-multichain',
  '/fraud', '/payment-links', '/risk', '/news-sentiment', '/notifications',
  '/savings', '/invoices', '/watchlist', '/ai-assistant', '/address-book',
  '/net-worth', '/benchmark', '/what-if', '/budget', '/duress-pin',
  '/wallet-access', '/stealth-wallets', '/panic-wipe', '/risk-score',
  '/correlation', '/split-bill', '/session-manager', '/receipt', '/tx-history',
  '/address-checker', '/fee-analytics', '/correlation-timeline',
  '/dashboard-widgets', '/shared-portfolio', '/referrals', '/wallet-seed-qr',
  '/hardware-wallet', '/biometric-auth', '/anomaly-detection', '/portfolio-rewind',
  '/index-builder', '/messenger-alerts', '/voice-commands', '/leaderboard',
  '/public-profiles', '/ai-rebalancer', '/token-approvals', '/network-manager',
  '/watch-wallets', '/price-charts', '/gas-fees', '/spam-filter', '/hd-wallet',
  '/trust-score', '/solana', '/crypto-signing', '/live-balances', '/dapp-alerts',
  '/security-scanner', '/erc20-discovery', '/products', '/docs', '/features',
  '/plans',
];

export const CLASSIFICATION = {
  '/leaderboard': {
    verdict: 'cut', reason: 'off-wedge', dataSource: 'static',
    note: 'A public ranking of who holds what is a targeting list aimed at our users. Removed on principle.',
  },
  '/public-profiles': {
    verdict: 'cut', reason: 'off-wedge', dataSource: 'static',
    note: 'Public identity and holdings exposure is the threat model we defend against, not a feature.',
  },
  '/shared-portfolio': {
    verdict: 'cut', reason: 'off-wedge', dataSource: 'static',
    note: 'Social portfolio sharing exposes holdings. A deliberate, encrypted signed export will replace it.',
  },
  '/referrals': {
    verdict: 'disabled', reason: 'server', dataSource: 'external',
    note: 'Referrals return once they can work without a server that links referrer and referee.',
  },
};

// Runtime registry exceptions derived from the audit: only non-live verdicts
// become registry entries (live/unlisted routes default to live). Verdict maps
// 1:1 to registry status. Carries reason + note through.
export function registryEntriesFromClassification() {
  const out = {};
  for (const [path, entry] of Object.entries(CLASSIFICATION)) {
    if (entry.verdict === 'live') continue;
    out[path] = { status: entry.verdict, reason: entry.reason, note: entry.note };
  }
  return out;
}
