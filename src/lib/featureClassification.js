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

  // ── Overview group (audit batch 1) ─────────────────────────────────────────
  '/': {
    verdict: 'live', dataSource: 'on-device',
    note: 'In the local build DEMO is false, so Dashboard immediately renders WalletPortfolioPage which is driven by the on-device vault; the DemoDashboard branch is never reached.',
  },
  '/notifications': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Aggregates PriceAlert, FraudAlert, RASPEvent, SmartAlert from local IndexedDB (localBase44); all records are user-generated on-device — no external source or fabrication.',
  },
  '/analytics': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'base44-entities',
    note: 'Wallet/Transaction data is real local data but all USD values are derived from hardcoded stale USD_RATES constants; the "Net PnL" chart conflates sent/received amounts with profit/loss and the portfolio value shown will silently drift from reality as markets move.',
  },
  '/advanced-analytics': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'invented',
    note: 'MONTHLY_PERFORMANCE is a hardcoded array of specific monthly return percentages (Nov–Apr) presented under the label "Your Portfolio" — these numbers are not derived from the user\'s transaction history. Volatility and Sharpe values are also static constants, not computed from real price data.',
  },
  '/advisor': {
    verdict: 'disabled', reason: 'server', dataSource: 'external',
    note: 'Calls base44.integrations.Core.InvokeLLM which requires a backend LLM endpoint. Correctly guards with LLM_AVAILABLE and displays LocalBuildNotice when unavailable in the local build.',
  },
  '/ai-assistant': {
    verdict: 'disabled', reason: 'server', dataSource: 'external',
    note: 'Calls base44.agents.createConversation / addMessage / subscribeToConversation — all require the LLM agent backend. Correctly guards with LLM_AVAILABLE and shows LocalBuildNotice.',
  },
  '/benchmark': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'invented',
    note: 'portfolioData is generated via genBenchmark(1.5, 0.025) — a Math.sin-based synthetic random walk — then labeled "Your Portfolio" in a returns chart alongside BTC, ETH, S&P 500. The user\'s actual transaction history is not consulted; these are fabricated performance numbers.',
  },
  '/what-if': {
    verdict: 'cut', reason: 'off-wedge', dataSource: 'static',
    note: 'A hypothetical historical-investment calculator using static reference prices (no user data). Educational tool that does not serve the coercion-resistant vault job.',
  },
  '/risk-score': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Derives risk score from real local wallet balances, staking positions, and loan records via IndexedDB. Applies static per-asset volatility constants (reasonable calibration, not claimed to be live market data). No fabrication — formula is transparent and entirely driven by the user\'s actual holdings.',
  },
  '/correlation': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'invented',
    note: 'Presents a hardcoded CORRELATIONS matrix of specific coefficients (e.g. BTC↔ETH = 0.82) as if they reflect current market reality, with no disclaimer that these are fixed reference values. Uses wallet list only to filter which rows/columns to show — the coefficients themselves are static.',
  },
  '/correlation-timeline': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'invented',
    note: 'Entire PRICE_SERIES (30-day indexed arrays for BTC/ETH/SOL) and EVENTS list (Fed Rate Cut, SEC Approval, Exchange Hack, etc.) are hardcoded constants presented as a live 30-day price-and-events chart. No real price history or news data is used; the chart is wholly fabricated.',
  },
  '/dashboard-widgets': {
    verdict: 'live', dataSource: 'on-device',
    note: 'A pure settings/preference UI: reads and writes widget visibility and order to localStorage only. No data fabrication, no external calls. Cleanly on-device.',
  },
  '/news-sentiment': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'invented',
    note: 'MOCK_NEWS is a hardcoded array of specific headlines attributed to real outlets (Bloomberg, Reuters, CoinDesk) presented prominently as current market news. LocalBuildNotice does disclose these are "illustrative sample data" but the fabricated articles still dominate the visible UI. AI refresh correctly disabled via LLM_AVAILABLE guard.',
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
