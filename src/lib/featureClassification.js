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
  '/analytics', '/tax', '/security', '/security-dashboard', '/what-this-protects', '/nft',
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
    verdict: 'live', dataSource: 'wallet-core',
    note: 'Rebuilt (Slice 1): stateless native-unit fee analytics computed on-device from the active set\'s chain history via the same on-demand fetch the history view uses — no fiat, no persistence, no new egress. Sums only fees the set actually paid (BTC/SOL); EVM has no in-app indexer so it fails honest to "unavailable", and a paid tx with no indexer-reported fee is shown as unknown, never guessed. UNAUDITED-PROVISIONAL: verified against fixtures, not yet a real on-chain txid.',
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
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Reports only real on-device transaction data: per-asset NATIVE amounts and transaction counts/timing (lib/spendingPatterns). The fabricated stale-USD aggregates were removed — no cross-asset fiat conversion is shown, so there is no silently-stale value. Honest activity view.',
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
    note: 'Token discovery across an address needs an ERC-20 Transfer-event scan via a third-party indexer this build does not run (and which would reveal the address). Not built. The earlier version fabricated the scan (Math.random balances over a random subset of well-known tokens, random spam scores) and presented it as real holdings; that fabrication has been removed and the page is now an honest placeholder behind this gate.',
  },

  // ── Security group (audit batch A) ───────────────────────────────────────
  '/security-dashboard': {
    verdict: 'live', dataSource: 'on-device',
    note: 'Aggregates real local signals only: summarizeApprovals/summarizeSpamTokens/screenAddressHistory from lib/securityPosture.js (run over base44 entity records already held on device); biometric/passkey/session toggles from lib/biometric, lib/passkey, lib/session; hasDuressPin/hasStealthPool/hasPanicPin from WalletProvider (non-destructive IndexedDB reads). No external call, no fabrication. Explicitly disclaims being a guarantee.',
  },
  '/security': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Sessions tab manages local UserSession records via base44.entities; revocation enforced by lib/sessionRevocation (self-enforcing on each device). Limits tab stores TransactionLimit records in local IndexedDB; daily progress computed via lib/txLimits.js over local Transaction records. No external call, no fabricated data.',
  },
  '/what-this-protects': {
    verdict: 'live', dataSource: 'static',
    note: 'Phase 2 seized-device PIN disclosure (C-screen). Purely static plain-language copy explaining the 6-digit-PIN offline-brute-force limit (what it does / can\'t do / what helps / what\'s coming — hardware key-binding framed as not-yet-shipped). No external call, no fabrication, no per-session/config reads. Deniability: reads identically in real and decoy sessions, names no set\'s existence, never touches coercion/decoy/hidden; guarded by security-framing.test.js.',
  },
  '/wallet-access': {
    verdict: 'live', dataSource: 'wallet-core',
    note: 'Change-password calls WalletProvider.changePassword (decrypt-then-re-encrypt the same seed under Argon2id+AES-GCM, on-device). Recovery calls WalletProvider.importWallet (BIP-39 checksum → local vault overwrite). Explicitly states no custodial reset path exists. DEMO panel exercises the real change-password code path on a throwaway vault.',
  },
  '/session-manager': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Lists and revokes UserSession records from local base44 store. Revocation is real: self-enforcement via lib/sessionRevocation locks the wallet and clears the local session token. Honestly discloses that remote devices apply revocation at next open, not instantly. geo_country/ip_address fields display "Unknown Location" if not populated — no server-side geolocation dependency for the revoke action.',
  },
  '/duress-pin': {
    verdict: 'live', dataSource: 'wallet-core',
    note: 'Backed by wallet-core/duress.js: setDuressPin creates a real separately-encrypted decoy vault; the duress unlock path routes through the existing WalletProvider.unlock flow. Decoy balance read via lib/decoyBalance.js — live eth_getBalance on-chain in real/native builds, clearly labelled demo simulation in demo. Imports wallet-core/evm/networks. Explicitly discloses runtime-only deniability limitation (forensic inspection can detect a second vault).',
  },
  '/stealth-wallets': {
    verdict: 'live', dataSource: 'wallet-core',
    note: 'Backed by wallet-core/stealth.js: addHiddenWallet encrypts and stores the wallet in a fixed chaff pool; reveal routes through WalletProvider.unlock. Multi-chain identity (EVM/BTC/SOL) from wallet-core/derivation.deriveEvmAccount and existing deriveBtc/deriveSol paths. Balance checks opt-in only via lib/hiddenBalance.js (explicitly warns each is a phone-home to a public node). Imports wallet-core/derivation.',
  },
  '/panic-wipe': {
    verdict: 'live', dataSource: 'wallet-core',
    note: 'Backed by wallet-core/panic.js: setPanicPin/removePanicPin/panicWipe destroy the primary vault, duress decoy, entire stealth pool, and panic marker via WalletProvider; wipe is triggered via the real unlock path (no confirmation dialog under coercion). Honestly discloses: wipe destroys local copy only, seed backup elsewhere still recovers, on-chain history stays public, flash-media forensics out of scope.',
  },
  '/address-checker': {
    verdict: 'live', dataSource: 'wallet-core',
    note: 'Runs isLocallyFlagged + screenRecipient from wallet-core/evm/poison.js over user-pasted address and local AddressBook contacts (base44.entities.AddressBook). Fully on-device: no network, no third-party reputation feed. Explicitly says "not flagged" is not a safety guarantee and that a live threat-intel feed is on the roadmap, not built.',
  },
  '/wallet-seed-qr': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'base44-entities',
    note: 'Seed is user-typed (not read from the real vault) and the wallet selector queries base44.entities.Wallet (demo/local records, not the live HDWalletManager). An inline comment in the file explicitly flags this: "seed is sourced from the demo data layer (base44 mock), not the real vault. Rewire to WalletProvider before this is a real backup path." The page is not wired to the real vault and therefore cannot provide a genuine backup.',
  },
  '/hardware-wallet': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'static',
    note: 'Honest placeholder: the page itself explicitly says "Planned — not yet available" and "nothing here connects to a real device". No Ledger/Trezor integration exists. Disabled so it does not appear as a live feature.',
  },
  '/dapp-alerts': {
    verdict: 'live', dataSource: 'on-device',
    note: 'Checks a user-entered domain against LOCAL_KNOWN_BAD, a small hardcoded list — a pattern equivalent to isLocallyFlagged in wallet-core/evm/poison.js. No network call, no third-party feed. Explicitly labels the list as "illustrative/local and non-exhaustive", never asserts a domain is safe, and discloses a real threat feed is on the roadmap.',
  },
  '/security-scanner': {
    verdict: 'live', dataSource: 'wallet-core',
    note: 'Runs describeErc20Call from wallet-core/evm/calldata and assessEvmTransaction from wallet-core/evm/simulate over user-pasted calldata. Purely local decode + risk assessment (no key, no RPC). Explicitly states no on-chain dry-run is performed here and that absence of a finding is not a guarantee. Same logic as the Send flow pre-sign preview.',
  },

  // ── Security group (audit batch B) ───────────────────────────────────────
  '/biometric-auth': {
    verdict: 'live', dataSource: 'on-device',
    note: 'Config stored in localStorage; passkey registration calls the real WebAuthn navigator.credentials.create() with a live challenge (window.PublicKeyCredential guard). The "Test Biometric Now" button is a UX confirmation stub (setTimeout) — it does not claim to perform a real auth challenge. Core vault-protection feature.',
  },
  '/anomaly-detection': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'base44-entities',
    note: 'detectAnomalies() applies real sigma-threshold math to real local Transaction records (base44.entities.Transaction), but the "Run AI Scan" button is a 2.2 s setTimeout with no analysis logic — the scan result is identical with or without clicking it. The page labels itself "AI Pattern Scanner" / "Machine learning analysis" for what is a simple statistical heuristic; the fake scan delay reinforces a false impression of active ML computation.',
  },
  '/messenger-alerts': {
    verdict: 'disabled', reason: 'server', dataSource: 'static',
    note: 'Config UI only (localStorage). "Send Test Message" for Telegram is a 1.5 s setTimeout — no HTTP call to Telegram is made. WhatsApp section explicitly states delivery requires Twilio or WhatsApp Business API. No actual alert delivery is implemented; a server relay (Telegram Bot API / Twilio) is required for any message to be sent.',
  },
  '/voice-commands': {
    verdict: 'live', dataSource: 'on-device',
    note: 'Uses browser-native window.SpeechRecognition / window.webkitSpeechRecognition for transcription. Command matching and routing are local (phrase map + React Router navigate). No audio leaves the device; page explicitly discloses "No audio is sent to external servers." Degrades gracefully when the browser API is absent.',
  },
  '/token-approvals': {
    verdict: 'live', dataSource: 'wallet-core',
    note: 'Imports summarizeAllowance, buildRevokeCalldata, sendRevoke from @/wallet-core/evm/approvals and getNetworkInfo from @/wallet-core/evm/networks. Risk badge derived from real calldata-decoded allowance (not a stored label). In DEMO mode revoke is simulated but exercises the real calldata builder and is clearly badged "Demo · simulated". In native/testnet mode a real approve(spender,0) is signed locally and broadcast.',
  },
  '/spam-filter': {
    verdict: 'live', dataSource: 'wallet-core',
    note: 'Imports annotateTokens from @/wallet-core/evm/spam and getNetworkInfo from @/wallet-core/evm/networks. Runs the real wallet-core classifier over base44.entities.WalletToken records. User overrides persisted in localStorage. Explicitly discloses filtering is display-only and heuristic-based. Clearly badged "Demo · seeded" vs "Testnet".',
  },
  '/trust-score': {
    verdict: 'live', dataSource: 'wallet-core',
    note: 'Imports classifyToken from @/wallet-core/evm/spam. Runs the real on-device heuristic classifier over user-supplied or preset token metadata. Extensive in-file honesty contract: never claims on-chain analysis, never asserts safety, explicitly labels results as local-heuristic only. No external call.',
  },
  '/fraud': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'base44-entities',
    note: 'No automated/AI fraud analysis or rule engine runs in this build. The earlier version labelled itself "AI Fraud Detection" / "Real-time monitoring" but ran no analysis — its scan was a 2 s timeout that always reported "no new threats detected", and its Detection Rules tab rendered a hardcoded list presented as actively enforced. That theatre has been removed; the page is now an honest placeholder behind this gate. Real pre-sign risk lives in the Pre-Sign Scanner, Address Screening, Trust Score and Security Dashboard.',
  },
  '/smart-alerts': {
    verdict: 'disabled', reason: 'server', dataSource: 'base44-entities',
    note: 'Alert configuration is stored in base44.entities.SmartAlert (local), but no trigger evaluation is wired in this component — no price or portfolio data is fetched. notify_email and notify_push flags are stored but no delivery mechanism exists client-side; email and push dispatch require a server. The feature stores settings honestly but cannot fire alerts in the local build.',
  },
  '/alerts': {
    verdict: 'disabled', reason: 'leaks', dataSource: 'external',
    note: 'fetchLivePrices() calls fetch("https://min-api.cryptocompare.com/data/pricemulti?fsyms=BTC,ETH,...") — a third-party CryptoCompare API endpoint. The full coin symbol list is sent to CryptoCompare on every load and every 60-second refetchInterval. Price trigger evaluation itself is correct on-device logic, but the external price call is a mandatory dependency.',
  },

  // ── Connect group (audit batch 5) ─────────────────────────────────────────
  '/address-book': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Pure CRUD on base44.entities.AddressBook (local IndexedDB). Address entry is validated on save via isValidAddressForCurrency/addressKindLabel from lib/addressValidation — the same validators used by the Send flow. No external call, no fabricated data, no USD conversion.',
  },
  '/watch-wallets': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'invented',
    note: 'MOCK is a hardcoded array (Vitalik.eth 1580.42 ETH, Whale #1 12.5 BTC) used as the fallback whenever the real entity list is empty. The displayed USD values are computed from hardcoded stale USD_RATES (ETH: 3200, BTC: 68000). No live balance fetch is performed for any watched address — the balance field is whatever was last entered by the user or zero.',
  },
  '/live-balances': {
    verdict: 'live', dataSource: 'wallet-core',
    note: 'All balance reads go through wallet-core: getBalanceEth + getProvider from @/wallet-core/evm/provider and ERC-20 balanceOf from @/wallet-core/evm/tokens. Networks come from listEnabledNetworks() (testnet-only gate). No third-party indexer or price feed is used — token discovery is limited to the wallet\'s own verified token registry. Gas price also read from the same provider.',
  },
  '/network-manager': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'CRUD on base44.entities.NetworkConfig (local IndexedDB). The component itself makes no live RPC calls — it manages the user-controlled RPC endpoint list. The "Connected" badge is cosmetic (not a live ping). Custom RPC entry is user-controlled plumbing. Honestly displays chain IDs and RPC URLs.',
  },
  '/solana': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'invented',
    note: 'A live Solana view needs real balance/token reads from a Solana RPC wired through wallet-core, plus Solana send dispatch — not built (the seed can derive a Solana account, but it is not yet wired into send). The earlier version hardcoded a fake Solana wallet (fixed address, balance, SPL list and prices, Math.random 24h changes) with a Send dialog that built no real transaction; that fabrication has been removed and the page is now an honest placeholder behind this gate.',
  },
  '/price-charts': {
    verdict: 'disabled', reason: 'unverified', dataSource: 'invented',
    note: 'generateOHLCV() builds OHLCV data with Math.random() seeded from the static reference price in lib/cryptos.js. The resulting candlestick chart is re-generated on every asset/period selection and presented as a price chart with no disclaimer. No real price history feed is consulted — all candles, volume, and displayed percentage changes are invented at render time.',
  },
  '/gas-fees': {
    verdict: 'live', dataSource: 'wallet-core',
    note: 'FeeSelector calls estimateEvmFeeTiers, estimateBtcFeeTiers, estimateSolFeeTiers from wallet-core providers (testnet/devnet only via CHAINS config). The selected fee in native units (wei/sat/lamports) is the authoritative value that flows into the Send signing path. usdRate constants are used only to display an approximate fiat estimate alongside the native fee — not as a financial record.',
  },
  '/connect': {
    verdict: 'live', dataSource: 'on-device',
    note: 'Uses real browser wallet injection (window.ethereum for MetaMask/Coinbase, window.solana for Phantom). Balance reads go through the injected provider API (eth_getBalance) or a public Solana JSON-RPC call (user-initiated, single request on connect, not a background feed). Imports to base44.entities.Wallet as a read-only snapshot with an honest disclosure. No private key access.',
  },
  '/web3': {
    verdict: 'cut', reason: 'off-wedge', dataSource: 'static',
    note: 'A dApp directory/launcher with a static DAPPS list; "browsing" opens the external browser — no in-app iframe, no WalletConnect, no signing path wired. Features.jsx and Documentation.jsx both list Web3 Browser as "roadmap, post-audit only". Exposing dApp interaction is off-wedge for the coercion-resistant self-custody vault job.',
  },
  '/push': {
    verdict: 'live', dataSource: 'on-device',
    note: 'Uses browser-native Notification API (Notification.requestPermission / new Notification()). Preferences stored in localStorage only. No push service, server relay, or third-party SDK is involved. The page explicitly states "No personal data is shared with third-party notification services". Test notification is a real browser Notification(), not a stub.',
  },

  // ── Core / Preferences group (audit batch 5) ──────────────────────────────
  '/settings': {
    verdict: 'live', dataSource: 'on-device',
    note: 'On-device preferences: theme via next-themes (localStorage), BiometricUnlockSettings/PasskeyUnlockSettings use WebAuthn navigator.credentials, SessionSettings manages auto-lock via WalletProvider, per-wallet passkey registration updates base44.entities.Wallet (local). Delete Account clears local entity records and locks the vault. No external call, no fabricated data.',
  },
  '/docs': {
    verdict: 'live', dataSource: 'static',
    note: 'Purely static informational copy. Feature statuses (available/roadmap) are honest and cross-checked against actual implementation per the in-file scope contract comment. Workflows describe real implemented flows. No fabricated availability claims — unbuilt features are clearly labelled "roadmap". PDF export is functional via lib/pdfExport.',
  },
  '/features': {
    verdict: 'live', dataSource: 'static',
    note: 'Purely static feature catalogue with honest available/roadmap two-status model. The file\'s own comment explicitly states status is "cross-checked against actual implementation (wallet-core modules + real routes), not aspiration." No unbuilt feature is presented as working. Custodial/regulated features are listed as explicitly excluded, not as roadmap. Consistent with Documentation.jsx.',
  },
  '/products': {
    verdict: 'cut', reason: 'off-wedge', dataSource: 'base44-entities',
    note: 'A generic product/SKU catalog CRUD tool (product name, SKU, description, price_usd, category, stock). Stores records in base44.entities.Product. This is an e-commerce inventory tool with no connection to the self-custody vault job.',
  },
  '/plans': {
    verdict: 'live', dataSource: 'static',
    note: 'Display-only tier cards rendered from TierProvider (currentTier always "free") and PRO_FEATURES from lib/tier. The upgrade button is permanently disabled with an honest disclosure: "no payment system is active" and "no payment can be made on this screen." Preview disclosure banner explicitly warns pricing is not final. No fabricated capabilities listed as currently available.',
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
