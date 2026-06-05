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

  // ── Wallet group (audit batch 2) ───────────────────────────────────────────
  '/send': {
    verdict: 'live', dataSource: 'wallet-core',
    note: 'Full EVM send path: signAndBroadcast/sendToken from @/wallet-core/evm/send and token-send; balance read live via getBalanceEth/getTokenBalance; pre-sign simulation via simulateEvmTransaction; capability gate via canSend(); tx recorded with real chain hash. Core vault job.',
  },
  '/receive': {
    verdict: 'live', dataSource: 'wallet-core',
    note: 'Derives the correct receive address from the unlocked HD accounts (accounts[0].address for EVM, btcAccount/solAccount) via resolveReceive(); renders QR and copy. Purely on-device — no external call, no fabrication.',
  },
  '/tx-history': {
    verdict: 'live', dataSource: 'wallet-core',
    note: 'BTC history from wallet-core/btc/provider (Esplora — same endpoint used for UTXOs/broadcast); SOL from wallet-core/sol/provider (same RPC used for balance/broadcast); EVM explicitly unsupported (no third-party indexer added — shows honest explorer fallback). Demo rows clearly badged "Sample". Privacy disclosure surfaced in-app.',
  },
  '/payment-links': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Fully user-driven: stores PaymentLink records in local IndexedDB via base44.entities.PaymentLink. Link URL is constructed from user-entered wallet address + amount — no external call, no fabricated data. link_id uses Math.random() as a non-financial identifier only.',
  },
  '/split-bill': {
    verdict: 'cut', reason: 'off-wedge', dataSource: 'base44-entities',
    note: 'Bill-splitting tool: divides a user-entered USD total among named wallet addresses using hardcoded stale USD_RATES. No signing, no actual on-chain tx. Does not serve the coercion-resistant vault job.',
  },
  '/receipt': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'base44-entities',
    note: 'Reads real local Transaction records but the "USD Value" line on every receipt is computed from hardcoded stale USD_RATES constants — presenting a silently stale dollar figure as fact on a document intended to be a financial record.',
  },
  '/fee-analytics': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'base44-entities',
    note: 'Aggregates fee data from real local Transaction records, but all USD conversions ("Total Fees Paid", "This Month", "Avg Per Transaction") use hardcoded stale USD_RATES — figures will silently drift from reality as markets move.',
  },
  '/hd-wallet': {
    verdict: 'live', dataSource: 'wallet-core',
    note: 'Core HD wallet management: createWallet/importWallet/unlock/lock/deriveAccounts from useWallet(); live per-chain balances via getBalanceEth/getTokenBalance; only public addresses cached in base44. Seed/keys never leave device.',
  },
  '/crypto-signing': {
    verdict: 'live', dataSource: 'on-device',
    note: 'Entirely local: ethers.Wallet.createRandom() for key gen, ethers.HDNodeWallet.fromPhrase() for derivation, wallet.signMessage()/signTransaction() for signing — all client-side ethers.js v6, no external call. Standard cryptographic signing utility.',
  },
  '/recurring': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'base44-entities',
    note: 'Explicitly stubbed: page warns "schedules & reminders only" and the execute path redirects to /send for manual signing (promptSignInSend). Feature cannot actually execute recurring transfers — presents as "Automate regular crypto transfers" but does not deliver that capability.',
  },
  '/calculator': {
    verdict: 'disabled', reason: 'leaks', dataSource: 'external',
    note: 'Calls fetch("https://min-api.cryptocompare.com/data/pricemulti?...") — a third-party price-feed API. Sends the list of crypto symbols to CryptoCompare on every load and every 30-second refresh interval.',
  },

  // ── Invest group (audit batch 3) ──────────────────────────────────────────
  '/portfolio-rewind': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'invented',
    note: 'Reads real local wallet balances via base44.entities.Wallet but applies hardcoded PRICE_HISTORY multipliers (e.g. BTC 30d = 0.85×, 2y = 0.31×) to fabricate past USD values. The chart is a synthetic linear interpolation between invented past and stale-rate present — no real price history is consulted.',
  },
  '/index-builder': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'invented',
    note: 'Index definitions are real local records (base44.entities.CustomIndex), but the displayed performance figure is computed from a hardcoded PERF object (e.g. BTC: 8.2, ETH: 12.4, SOL: 23.1) presented as the index\'s return — these percentages are not derived from any real price history.',
  },
  '/ai-rebalancer': {
    verdict: 'disabled', reason: 'server', dataSource: 'external',
    note: 'Calls base44.integrations.Core.InvokeLLM for portfolio analysis. Correctly guarded with LLM_AVAILABLE; shows LocalBuildNotice when the LLM endpoint is unavailable in the local build.',
  },
  '/pl': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'base44-entities',
    note: 'Trade records are real user-entered data (base44.entities.PLRecord), but unrealised P&L on open positions and the "Close" action both use hardcoded stale CURRENT_PRICES (BTC: 68000, ETH: 3200, …) as the current market price — figures will be silently wrong as markets move.',
  },
  '/risk': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Derives risk score from real local wallet balances (base44.entities.Wallet) and borrow counts (LendingPosition). Formula uses transparent static coefficients (concentration × 0.5, leverage × 15, volatile-asset count × 5). HEDGING list is generic advice, not presented as user-specific data. No fabrication.',
  },

  // ── Finance group (audit batch 3) ─────────────────────────────────────────
  '/savings': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Pure local CRUD on base44.entities.SavingsGoal. Users enter USD target and current amounts directly; progress bars are computed from those user-entered values. No currency conversion, no fabricated data, no external call.',
  },
  '/budget': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'base44-entities',
    note: 'Reads real local Transaction records (base44.entities.Transaction) and BudgetLimit records, but all crypto-to-USD conversion for "Total Spent This Month" and per-budget spend uses hardcoded stale USD_RATES — displayed spend figures will silently drift from reality as markets move.',
  },
  '/net-worth': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'base44-entities',
    note: 'Aggregates real local wallet balances (base44.entities.Wallet) and user-entered NetWorthAsset records, but crypto holdings are converted to USD using hardcoded stale USD_RATES. The "Total Assets" and "Net Worth" figures will be silently wrong relative to actual market prices.',
  },
  '/invoices': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Pure CRUD on base44.entities.Invoice. Invoices are denominated in user-chosen crypto amounts — no USD conversion, no stale price usage, no fabricated data. Invoice number derived from Date.now() as a non-financial identifier only.',
  },
  '/tax': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'base44-entities',
    note: 'Reads real local Transaction, StakingPosition, and Wallet records, but the historicalRate() function produces pseudo-random prices from (timestamp % 10000) — fabricated cost basis figures. The page discloses "simulated historical prices" in an inline warning, but the FIFO gain/loss and staking income numbers are still invented and exported to CSV/PDF as if real.',
  },

  // ── Assets group (audit batch 4) ─────────────────────────────────────────
  '/watchlist': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'base44-entities',
    note: 'PersonalWatchlist records are real user-entered data, but the displayed prices (MOCK_PRICES), 24h change percentages, and computed high/low range all come from hardcoded stale constants in src/lib/cryptos.js. Buy/sell target alerts fire against these stale prices — a user comparing their target_buy against a silently outdated price could act on false signals.',
  },
  '/nft': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'base44-entities',
    note: 'NFTAsset records are real user-entered data (purchase_price, current_floor in ETH), but the "Portfolio Value" USD sub-label converts ETH to USD using ETH_PRICE = 3200, a hardcoded stale constant. The dollar figure shown to users will silently drift from reality as ETH price moves.',
  },
  '/nft-multichain': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'NFTAsset CRUD backed by local IndexedDB. All portfolio values are shown in ETH only — no USD conversion and no stale rate injection. Math.random() is used only for selecting a placeholder image URL (cosmetic), not financial data. Manual tracking, honestly labeled.',
  },
  '/spending': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'base44-entities',
    note: 'Reads real local Transaction records but converts every crypto amount to USD using hardcoded stale USD_RATES (e.g. BTC: 68000, ETH: 3200). All displayed figures — Total Sent, Total Received, Avg Tx Size, This Month, monthly bar chart, and day-of-week chart — are denominated in these silently stale USD values.',
  },
  '/snapshots': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'base44-entities',
    note: 'PortfolioSnapshot saves a total_usd computed from real local Wallet balances multiplied by hardcoded stale USD_RATES (BTC: 68000, ETH: 3200, …). Snapshot values are stored and charted as if they represent real market USD values, but they were computed from rates that may be months out of date at the time of capture.',
  },
  '/onchain': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'base44-entities',
    note: 'Aggregates base44.entities.Transaction (internal app records) and labels the result "On-Chain Analytics" — mislabeling a local transaction log as on-chain data. The address lookup searches only the local wallet/tx store; no actual blockchain query is made, yet the feature presents as a blockchain explorer.',
  },
  '/erc20-discovery': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'invented',
    note: 'Entirely fabricated: handleScan() waits 2.5 s then picks a Math.random() subset of WELL_KNOWN_TOKENS with Math.random()-generated balances (generateBalance()). No blockchain, indexer, or RPC call is made. The UI explicitly says "Scanning blockchain… Querying Transfer events and token contracts" — false. Discovered tokens and balances are invented and presented as the user\'s real on-chain holdings.',
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
