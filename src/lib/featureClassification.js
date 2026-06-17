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
  '/analytics', '/tax', '/security', '/security-dashboard', '/what-this-protects',
  '/terms-legal', '/nft',
  '/snapshots', '/pl', '/onchain', '/spending', '/advisor', '/smart-alerts',
  '/recurring', '/push', '/advanced-analytics', '/web3', '/nft-multichain',
  '/fraud', '/payment-links', '/risk', '/news-sentiment', '/notifications',
  '/savings', '/invoices', '/watchlist', '/ai-assistant', '/address-book',
  '/net-worth', '/benchmark', '/what-if', '/budget', '/duress-pin',
  '/wallet-access', '/stealth-wallets', '/panic-wipe', '/risk-score',
  '/correlation', '/split-bill', '/session-manager', '/receipt', '/tx-history',
  '/address-checker', '/fee-analytics', '/correlation-timeline',
  '/dashboard-widgets', '/shared-portfolio', '/referrals', '/wallet-seed-qr',
  '/hardware-wallet', '/rasp-security', '/biometric-auth', '/anomaly-detection', '/portfolio-rewind',
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
    verdict: 'live', dataSource: 'base44-entities',
    note: 'USD values (total, allocation, charts) use opt-in live prices (useLivePrices) gated by isLivePricesEnabled. When off: summary cards show "—", charts replaced by an enable-prices prompt. No stale USD_RATES.',
  },
  '/advanced-analytics': {
    verdict: 'live', dataSource: 'base44-entities+opt-in-live-prices',
    note: 'USD_RATES removed. totalUSD and all derived metrics (vol, Sharpe, diversification, stableRatio) use useLivePrices() gated on isLivePricesEnabled(). MONTHLY_PERFORMANCE replaced with monthly received/sent computed from real Transaction records. VOLATILITY/SHARPE kept as industry reference estimates, clearly labeled in the UI. Correlation tab dropped — real Pearson available at /correlation. Off-state shows "—" for all USD metrics. UNAUDITED-PROVISIONAL.',
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
    verdict: 'cut', reason: 'off-wedge', dataSource: 'invented',
    note: 'Duplicates the portfolio-rewind job (/portfolio-rewind is live with real histoday data). The synthetic Math.sin genBenchmark walk and the static S&P 500 reference series both invent numbers the user did not enter. Off-wedge.',
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
    verdict: 'live', dataSource: 'external',
    note: 'Static CORRELATIONS matrix removed. Pearson correlation now computed from real 30-day daily closes fetched from CryptoCompare histoday for all 7 assets, gated on isLivePricesEnabled() (I2). Near-zero variance (stablecoins) correctly returns 0. Off-state: honest disabled prompt (I4). staleTime 10min. UNAUDITED-PROVISIONAL.',
  },
  '/correlation-timeline': {
    verdict: 'live', dataSource: 'external',
    note: 'Hardcoded PRICE_SERIES and fake EVENTS removed. Real 30-day histoday closes for BTC/ETH/SOL from CryptoCompare, normalized to index 100 at day 0, gated on isLivePricesEnabled() (I2). Off-state: honest disabled prompt (I4). staleTime 10min. UNAUDITED-PROVISIONAL.',
  },
  '/dashboard-widgets': {
    verdict: 'live', dataSource: 'on-device',
    note: 'A pure settings/preference UI: reads and writes widget visibility and order to localStorage only. No data fabrication, no external calls. Cleanly on-device.',
  },
  '/news-sentiment': {
    verdict: 'live', dataSource: 'external',
    note: 'MOCK_NEWS and LLM/AI wiring removed. Real articles from CryptoCompare /data/v2/news/ (live feed), gated on isLivePricesEnabled() (I2). Asset filter maps to CryptoCompare categories parameter. No sentiment scoring — scores required an LLM not present in this build. Off-state: honest disabled prompt (I4). staleTime 5min. UNAUDITED-PROVISIONAL.',
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
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Reads real local Transaction records. USD_RATES removed; USD Value line now comes from useLivePrices() gated by isLivePricesEnabled() (I2). When off or symbol absent: USD Value shows "—" — never a stale figure on a printed document (I4). Off-state banner added.',
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
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Scheduling/reminder store for recurring payment intentions. Page explicitly warns "schedules & reminders only"; execution redirects to /send for manual user signing (promptSignInSend). CRUD is fully on-device via base44-entities. Does not attempt autonomous transfers — honestly scoped.',
  },
  '/calculator': {
    verdict: 'live', dataSource: 'external',
    note: 'Crypto ↔ multi-fiat converter. Fetches CryptoCompare pricemulti (10 cryptos × 8 fiats) gated behind isLivePricesEnabled() — no network call unless the user has opted in via Settings → Live Prices (I2). When off the UI renders with null rates and an "Enable live prices" prompt (I4 — never a stale or fabricated rate). The symbol list is fixed and holdings-agnostic. Off-state verified in-browser; live-data render is unit-tested indirectly through fetchPrices but not eyeballed on a real network — UNAUDITED-PROVISIONAL.',
  },

  // ── Invest group (audit batch 3) ──────────────────────────────────────────
  '/portfolio-rewind': {
    verdict: 'live', dataSource: 'external',
    note: 'PRICE_HISTORY multipliers and USD_RATES removed. Real histoday closes (limit=730) fetched from CryptoCompare for user-held assets via Promise.all, gated on isLivePricesEnabled() (I2). Portfolio value per day = Σ(balance × historical close). Current value uses useLivePrices(). Chart thinned to ~30 points per period. Honest disclaimer: assumes current holdings throughout. Off-state: disabled prompt (I4). staleTime 30min. UNAUDITED-PROVISIONAL.',
  },
  '/index-builder': {
    verdict: 'live', dataSource: 'base44-entities+opt-in-live-prices',
    note: 'PERF fake-return object removed. CRUD (create/edit/delete) and pie chart remain unchanged — real local records via base44.entities.CustomIndex. Component list now shows live spot prices from useLivePrices() when isLivePricesEnabled() is on, "—" when off. No fabricated return percentage. UNAUDITED-PROVISIONAL.',
  },
  '/ai-rebalancer': {
    verdict: 'disabled', reason: 'server', dataSource: 'external',
    note: 'Calls base44.integrations.Core.InvokeLLM for portfolio analysis. Correctly guarded with LLM_AVAILABLE; shows LocalBuildNotice when the LLM endpoint is unavailable in the local build.',
  },
  '/pl': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Trade records are real user-entered data (base44.entities.PLRecord). Unrealised P&L on open positions and the "Close Position" action now use useLivePrices() gated behind isLivePricesEnabled() (I2 — no egress until opted in). When off or the feed is unavailable: unrealised P&L shows "—", the Close button is disabled, and the summary card shows no fabricated figure (I4). The old hardcoded CURRENT_PRICES (BTC: 68000, ETH: 3200, …) are gone. Closed-trade P&L uses the user-supplied or live exit price recorded at close time. Off-state verified in-browser; live-data render UNAUDITED-PROVISIONAL.',
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
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Reads real local Transaction and BudgetLimit records. USD spend conversion uses opt-in live prices (useLivePrices); shows "—" when live prices are off — no stale USD_RATES.',
  },
  '/net-worth': {
    verdict: 'live', dataSource: 'wallet-core',
    note: 'Crypto Net Worth (crypto-only): real on-chain balances via usePortfolio (grandTotal + assetTotals), USD shown live (opt-in price feed) or clearly-labeled approximate (reference rates) when off/unavailable. The fake base44-Wallet × stale-USD_RATES math and the global-table manual real-world assets (a decoy-session leak) were removed.',
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
    verdict: 'live', dataSource: 'base44-entities',
    note: 'PersonalWatchlist records are real on-device user data; the displayed price / 24h change / 24h high-low now come from the opt-in, holdings-blind live feeds (useLivePrices spot + useBasketPrices 24h change & high/low), OFF by default — no price egress until the user enables live prices in Settings (I2). When off or the feed is unavailable each row shows no number and the Buy/Sell-target badges do not evaluate (fail-honest, I4); the old MOCK_PRICES static prices + synthesized ±4% high/low are gone. Off-state + fail-honest verified in-browser; the live-data render is unit-tested (parseBasket) but not yet eyeballed on a real network — UNAUDITED-PROVISIONAL. See docs/superpowers/specs/2026-06-17-watchlist-real-prices-design.md.',
  },
  '/nft': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'NFTAsset CRUD and ETH-denominated P&L are fully on-device. USD sub-label uses live ETH price from useLivePrices() gated by isLivePricesEnabled; shows "≈ —" when off. No stale ETH_PRICE constant.',
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
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Reads real local Wallet and PortfolioSnapshot records. New snapshot capture uses opt-in live prices (useLivePrices) gated by isLivePricesEnabled; Save Snapshot is disabled when off. Existing stored snapshots display as-is. No stale USD_RATES.',
  },
  '/onchain': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Retitled "Transaction Analytics". Reads real local Transaction/Wallet records; honest scope note added clarifying data comes from recorded transactions, not live blockchain nodes. No USD_RATES — all values in native units.',
  },
  '/erc20-discovery': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Manual ERC-20 token tracker. No auto-discovery/indexer (which would reveal the address to a third party). Curated quick-add list (12 common tokens) + custom form (symbol, name, optional 0x contract address, decimals). All records stored in base44.entities.WalletToken (local IndexedDB). annotateTokens() from wallet-core/evm/spam runs over tracked tokens to surface suspected spam. USD spot price (USDC/USDT/MATIC only) from useLivePrices() gated on isLivePricesEnabled() (I2). Balance reads delegated to /live-balances (direct balanceOf RPC, not this page). No fabricated data.',
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
  '/terms-legal': {
    verdict: 'live', dataSource: 'static',
    note: 'Static Terms / Legal reference screen reachable from Settings. §A/§B are clearly-marked owner/counsel "to be supplied" placeholders (never invented legal text); §C reuses the existing testnet-beta/provisional-and-unaudited status language; §D is a condensed reference copy of the coercion-feature honest limits already shown inline on DuressPin/StealthWallets/PanicWipe (does not replace them). No acceptance gate, no storage write, no external call — reads identically in real and decoy sessions. Guarded by terms-legal.test.js and security-framing.test.js.',
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
    verdict: 'live', dataSource: 'wallet-core',
    note: 'Rewired to WalletProvider: revealWalletMnemonic(walletId) reads the active seed directly from the in-memory vault container (never base44, never network). Wallet selector uses context wallets[] (public metadata only — no seeds). QR generated locally via qrcode lib (toDataURL) — raw BIP-39 mnemonic, universally importable, never transmitted. Explicit confirmation gate before any reveal. Eye-toggle hides word grid. confirmWalletBackup() marks wallet backed-up in localStorage. Print opens a local window with word grid + QR. Clear button zeros revealed state.',
  },
  '/hardware-wallet': {
    verdict: 'live', dataSource: 'webhid+static',
    note: 'Ledger: WebHID connect (dynamic import, Chrome-only guard via "hid" in navigator) → getAddress("44\'/60\'/0\'/0/0") on hw-app-eth → ETH address auto-fills watch import. Transport closed after read; private key never leaves device. Trezor Safe 5: compatibility table (Android full, iOS watch-only) with honest iOS limitation note, platform-detected setup steps (Android/iOS/Desktop), manual address import. Shared: address + label → base44.entities.Wallet.create({ is_watch_only: true }). In-app signing not wired — honest scope note shown for both devices. No financial data; no backend; no legal dependency.',
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
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Sigma-threshold analysis runs on real local Transaction records. Fake 2.2s AI delay removed; "AI" branding replaced with "Pattern Scanner" / statistical analysis. USD large-transfer check uses useLivePrices() when on; velocity and unusual-hour checks run regardless.',
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
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Honest security-awareness page. The earlier AI/detection theatre (2 s fake scan, hardcoded "enforced" rules) has been removed; the page surfaces the real on-device security tools (Pre-Sign Scanner, Address Screening, Trust Score) and explains their scope honestly. No external calls. No invented threat data.',
  },
  '/rasp-security': {
    verdict: 'live', dataSource: 'static',
    note: 'Honest current-state RASP surface. Renders only global build-state facts (policy built, detection pending, unwired, unaudited) read from featureCatalogue (resolveStatus), plus the DESIGNED allow/warn/block ladder as static copy. It imports no degrade()/detect() runtime and makes no network call — pure presentation. The honesty-lock (§5) means it cannot show "active" unless the catalogue resolves RASP to verified, which it cannot until the detector legs land and verify.',
  },
  '/smart-alerts': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'CRUD (create/toggle/delete/list) works fully on-device via base44.entities.SmartAlert. Condition evaluation (auto-firing) is not wired — a banner in the UI directs users to Price Alerts for live triggers. notify_email/notify_push flags are stored for when a delivery backend is added.',
  },
  '/alerts': {
    verdict: 'live', dataSource: 'external',
    note: 'Price alert persistence (PriceAlert entities, on-device) is real. The CryptoCompare pricemulti fetch and the 60s auto-eval poll are now gated behind isLivePricesEnabled() — enabled:liveOn in the useQuery, no network call until the user opts in via Settings → Live Prices (I2 fixed). Check Now is disabled when off. When off: the ticker shows "—", alert-distance info does not render, and an inline banner explains the requirement (I4). Alert CRUD and the triggered/dismissed state machine work regardless of the live-prices setting. Symbol list is fixed and holdings-agnostic. Off-state verified in-browser; live-data render UNAUDITED-PROVISIONAL.',
  },

  // ── Connect group (audit batch 5) ─────────────────────────────────────────
  '/address-book': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Pure CRUD on base44.entities.AddressBook (local IndexedDB). Address entry is validated on save via isValidAddressForCurrency/addressKindLabel from lib/addressValidation — the same validators used by the Send flow. No external call, no fabricated data, no USD conversion.',
  },
  '/watch-wallets': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'MOCK fallback array removed; empty state shows honest "No watched wallets" prompt. USD_RATES removed; USD value per watched address comes from useLivePrices() gated by isLivePricesEnabled() (I2). When off: USD shows "—" (I4). Balance field reflects what the user entered — no live on-chain balance fetch (honestly presented). Off-state banner added.',
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
    verdict: 'live', dataSource: 'wallet-core-rpc',
    note: 'Real Solana balance from wallet-core getBalanceSol (Solana JSON-RPC via @solana/web3.js). Derives ed25519 account via SLIP-0010 from local seed on unlock. Network selector covers devnet + testnet (mainnet gated: ALLOW_SOL_MAINNET=false). USD value gated on isLivePricesEnabled (I2). Send dispatches to /send page (already wired for SOL). SPL tokens honestly noted as not wired (requires on-chain indexer).',
  },
  '/price-charts': {
    verdict: 'live', dataSource: 'external',
    note: 'generateOHLCV() removed. Real OHLCV data from CryptoCompare histominute/histohour/histoday, gated behind isLivePricesEnabled() (I2). Period → endpoint: 1H/4H → histominute, 1D/1W → histohour, 1M → histoday. Spot price header from useLivePrices(). When off: honest disabled prompt, no chart rendered (I4). staleTime 60s. UNAUDITED-PROVISIONAL (external network).',
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
