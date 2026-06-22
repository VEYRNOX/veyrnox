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
  '/snapshots', '/pl', '/onchain', '/spending',
  '/recurring', '/push', '/advanced-analytics', '/nft-multichain',
  '/fraud', '/payment-links', '/risk', '/news-sentiment', '/notifications',
  '/savings', '/invoices', '/watchlist', '/address-book',
  '/net-worth', '/benchmark', '/budget', '/duress-pin',
  '/wallet-access', '/stealth-wallets', '/panic-wipe', '/risk-score',
  '/correlation', '/session-manager', '/receipt', '/tx-history',
  '/address-checker', '/fee-analytics', '/correlation-timeline',
  '/dashboard-widgets', '/wallet-seed-qr',
  '/hardware-wallet', '/cloud-backup', '/rasp-security', '/audit-log', '/login-activity', '/biometric-auth', '/anomaly-detection', '/portfolio-rewind',
  '/index-builder', '/voice-commands', '/token-approvals', '/network-manager',
  '/watch-wallets', '/price-charts', '/gas-fees', '/spam-filter', '/hd-wallet',
  '/trust-score', '/solana', '/crypto-signing', '/live-balances', '/dapp-alerts',
  '/security-scanner', '/docs', '/features',
  '/plans',
  '/referrals',
  '/walletconnect',
];

export const CLASSIFICATION = {
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
    verdict: 'live', dataSource: 'local-first',
    note: 'Migrated (2026-06-17): base44 removed. Portfolio allocation from usePortfolio; monthly activity and PnL from tx history via useAnalytics; USD views gated on pricesEnabled (live prices opt-in). No fabrication.',
  },
  '/advanced-analytics': {
    verdict: 'live', dataSource: 'local-first',
    note: 'Migrated (2026-06-17): MONTHLY_PERFORMANCE removed. Monthly inflow/outflow derived from real tx history + live prices. VOLATILITY/SHARPE/CORRELATION retained as disclosed reference tables. USD views gated on pricesEnabled.',
  },
  '/benchmark': {
    verdict: 'live', dataSource: 'local-first',
    note: 'Migrated (2026-06-17): genBenchmark/fake BTC/SP500 lines removed. Portfolio return derived from real tx history + live prices. Gated on pricesEnabled; honest disclosure that benchmark comparison requires historical market data not available in local-only mode.',
  },
  '/risk-score': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Derives risk score from real local wallet balances, staking positions, and loan records via IndexedDB. Applies static per-asset volatility constants (reasonable calibration, not claimed to be live market data). No fabrication — formula is transparent and entirely driven by the user\'s actual holdings.',
  },
  '/correlation': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Hardcoded CORRELATIONS matrix retained as reference/illustrative values — disclaimer added prominently in yellow before the table. Wallet list used to filter shown assets (real data). No live price feed used — per-asset coefficients are static reference constants, clearly labeled as such.',
  },
  '/correlation-timeline': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'PRICE_SERIES and EVENTS hardcoded constants removed. Page now shows honest "historical price data not available" notice. Existing NewsSentiment records from the database are still displayed if present. No fabricated data remains.',
  },
  '/dashboard-widgets': {
    verdict: 'live', dataSource: 'on-device',
    note: 'A pure settings/preference UI: reads and writes widget visibility and order to localStorage only. No data fabrication, no external calls. Cleanly on-device.',
  },
  '/news-sentiment': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'MOCK_NEWS array removed. allNews now only contains records from base44.entities.NewsSentiment (user-saved or AI-refreshed). Added honest "no live feed connected" notice. AI refresh correctly disabled via LLM_AVAILABLE guard. No fabricated Bloomberg/Reuters/CoinDesk articles shown.',
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
  '/receipt': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Reads real local Transaction records. USD Value row removed — receipt now shows native amount and fee only, with no stale fiat conversion on a financial document.',
  },
  '/fee-analytics': {
    verdict: 'live', dataSource: 'wallet-core',
    note: 'VERIFIED 2026-06-20: BTC tab loaded real on-chain fee history from the throwaway testnet wallet (bamboo… seed) — 4 confirmed sends, total 0.00000564 BTC fees (0.00000141 BTC each), "View on block explorer" links present, all Confirmed. Demo OFF, no fixtures. Rebuilt (Slice 1): stateless native-unit fee analytics computed on-device from chain history — no fiat, no persistence, no new egress. EVM fails honest to "unavailable" (no in-app indexer).',
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
    note: 'Schedules stored in base44.entities.RecurringPayment (local IndexedDB). Page uses browser Notification API (same pattern as /push) to fire a reminder when a payment is due. Monthly estimate now shown per-currency — cross-currency totals removed. Self-custody contract maintained: no autonomous value transfer; due payments hand off to /send for user signing. Monthly-estimate mixed-currency bug fixed.',
  },
  '/calculator': {
    verdict: 'live', dataSource: 'external',
    note: 'CryptoCompare egress gated behind isLivePricesEnabled() (same opt-in as priceFeed.js). When off: no network call, shows "Live prices off" banner with Enable button. When on: sends fixed MARKET_SYMBOLS list (not user holdings). Auto-refetch removed; fetch only fires on load (staleTime: 20s). Symbol list is holdings-agnostic per cryptoCompare.js design.',
  },

  // ── Invest group (audit batch 3) ──────────────────────────────────────────
  '/portfolio-rewind': {
    verdict: 'live', dataSource: 'local-first',
    note: 'Migrated (2026-06-17): PRICE_HISTORY multipliers removed. Rewind derived by walking real tx history backwards from current balance using live prices. Gated on pricesEnabled.',
  },
  '/index-builder': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'PERF hardcoded performance percentages removed. Index CRUD (create/list/delete) is real base44 entity storage. Index cards now show composition pie chart and weight breakdown only — no fabricated return percentage. What remains is fully user-driven: name, description, components, rebalance frequency.',
  },
  '/pl': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'CURRENT_PRICES removed. Unrealised P&L shows "enter exit price" for open trades. Close action now collects user-supplied exit price inline before writing P&L — no stale market price used. Realised P&L on closed trades uses the user-entered entry/exit prices only.',
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
    note: 'Rewritten to track native amounts per currency — no USD conversion. Limit field relabelled "native amount". Spend shown as "X {currency} sent of Y {currency} limit". Stale USD_RATES removed entirely.',
  },
  '/net-worth': {
    verdict: 'live', dataSource: 'wallet-core',
    note: 'VERIFIED 2026-06-20: real on-chain balances loaded in the UI via the throwaway testnet wallet (bamboo… seed) — ETH ≈$1,248, BTC ≈$177, ARB ≈$160, USDT ≈$98, OP ≈$96, SOL ≈$82, USDC ≈$38, MATIC/AVAX/BNB ≈$0 (small testnet residuals). "Reference rate, not live market data" disclosure present (I2). "does not include external assets" scope note present (crypto-only). Allocation donut + per-asset rows all rendered. Demo OFF (veyrnox-demo=null), no round seeded fixtures.',
  },
  '/invoices': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Pure CRUD on base44.entities.Invoice. Invoices are denominated in user-chosen crypto amounts — no USD conversion, no stale price usage, no fabricated data. Invoice number derived from Date.now() as a non-financial identifier only.',
  },
  '/tax': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Replaced with an honest "Tax Export" stub. historicalRate() FIFO engine and all fabricated cost-basis/gain figures removed. Exports raw transactions (date/type/asset/amount/fee/tx_hash) as CSV with no invented prices. Directs users to Koinly/CoinTracker/etc. for real tax computation. Explicit disclaimer that this is not tax advice.',
  },

  // ── Assets group (audit batch 4) ─────────────────────────────────────────
  '/watchlist': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'MOCK_PRICES and 24h change display removed. Price shown as "unavailable — connect a live feed". Target buy/sell values are stored but not evaluated against stale prices — no false signals. Pure CRUD on local PersonalWatchlist records.',
  },
  '/nft': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'NFTAsset CRUD backed by local IndexedDB. Portfolio Value shown in ETH only — stale ETH_PRICE=3200 USD sub-label removed. P&L in ETH only. No USD conversion, no stale rate injection.',
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
    verdict: 'live', dataSource: 'local-first',
    note: 'Migrated (2026-06-17): base44 CRUD replaced with snapshotStore (localStorage, keyed by wallet-address fingerprint for deniability). USD values captured only when pricesEnabled; indeterminate flag preserved on snapshot records. No stale USD_RATES fabrication.',
  },
  '/onchain': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Relabelled "Transaction History" with explicit disclaimer "no blockchain query is made". Aggregates real local Transaction records; address lookup searches local wallet/tx store only. No fabrication, no external call.',
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
    note: 'Phase 2 seized-device PIN disclosure (C-screen). Purely static plain-language copy explaining the 8-digit-PIN offline-brute-force limit (what it does / can\'t do / what helps / what\'s coming — hardware key-binding framed as not-yet-shipped). No external call, no fabrication, no per-session/config reads. Deniability: reads identically in real and decoy sessions, names no set\'s existence, never touches coercion/decoy/hidden; guarded by security-framing.test.js.',
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
    note: 'Rewired to WalletProvider. revealWalletMnemonic(walletId) reads from the in-memory container (unlocked session). Manual seed textarea removed. Wallet list from useWallet().wallets. Reveal gated behind useActionGuard (2FA if configured, immediate if not). Mnemonic stored in local state only; cleared on wallet-change and unmount. confirmWalletBackup() called on print. Print uses escapeHtml to prevent self-injection of wallet name/seed into document.write.',
  },
  '/hardware-wallet': {
    verdict: 'live', dataSource: 'wallet-core',
    note: 'WebHID Ledger connection via @ledgerhq/hw-transport-webhid. Derives ETH address (m/44\'/60\'/0\'/0/0) from connected device via @ledgerhq/hw-app-eth. Private key never leaves device. Transaction signing bridge to /send is clearly labeled coming soon. BTC/SOL hardware signing not yet wired.',
  },
  '/cloud-backup': {
    verdict: 'live', dataSource: 'wallet-core',
    note: 'Self-custodial encrypted backup (Option A — two sealed copies). Export: serialized vault container encrypted under password AND PIN via Argon2id+AES-GCM (wallet-core/vaultBackup.js). Neither plaintext nor credential is transmitted — the .enc file is downloaded locally, stored wherever the user chooses (device, iCloud, Google Drive, USB). Restore: password path saves the blob directly to IndexedDB; PIN path decrypts and re-encrypts under a new password. Primary-session only export (decoy/hidden gate in WalletProvider.createBackup). Honest PIN-entropy disclaimer shown in UI.',
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
    note: 'detectAnomalies() applies real sigma-threshold math to real local Transaction records (base44.entities.Transaction). Scan button now synchronously runs the detection and stores results in state — no fake delay. Labels updated to "Transaction Anomaly Detection" / "Statistical analysis"; "AI Pattern Scanner" / "machine learning" removed. Three explicit heuristic checks shown to the user: large-transfer z-score (>2.5σ), velocity burst (3+ tx/hr), off-hours (02:00–05:00). All runs on-device.',
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
    note: 'Real on-device security scan: (1) transaction anomaly detection — large-transfer z-score >2.5σ, velocity burst 3+ tx/hr, off-hours 02:00–05:00; (2) address screening via isLocallyFlagged from wallet-core/evm/poison over AddressBook + tx history; (3) FraudAlert records from IndexedDB. No AI claim, no fake delay, no external call. Scope panel lists all three checks with per-check counts after scan.',
  },
  '/rasp-security': {
    verdict: 'live', dataSource: 'static',
    note: 'VERIFIED 2026-06-20: page loaded with live browser probe — Detection=browser-active, Current environment=clean, Wired to send path=yes, Independent audit=not yet. Degradation ladder (allow/warn/block) with honest scope notes rendered. "UNAUDITED-PROVISIONAL" tag and I4 honesty note ("no fabricated event counts") present. Demo OFF, real wallet. OS-level probes (root/jailbreak/tamper) remain audit-gated — correctly disclosed.',
  },
  '/audit-log': {
    verdict: 'live', dataSource: 'local-vault',
    note: 'VERIFIED 2026-06-20: enabled toggle via /audit-log page, navigated away (triggering settings_changed), returned to confirm 1 entry appeared — "Settings changed | 6/20/2026, 8:38:58 AM". Write→read cycle confirmed. {type, ts} only (no amounts/addresses). "Encrypted blob in primary vault store. Panic wipe destroys it." and "No-op in decoy/hidden sessions" disclosures present. Clear button rendered. Demo OFF, real wallet (bamboo… seed). Opt-in encrypted audit log viewer — primary-session only; returns [] in decoy/hidden sessions. At most 100 entries.',
  },
  '/login-activity': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'VERIFIED 2026-06-20: page loaded with real vault data — "Previous session — this device: Jun 20, 2026, 8:50 AM (26m ago)" from vault-stored lastUnlockAt. "No devices recorded yet" (web browser, no base44 UserSession entries). I3 deniability note present: "Per-unlock event history is not stored — doing so would create a metadata trail that could violate deniability guarantees." Session Manager link rendered. Demo OFF, real wallet. Read-only; no new metadata introduced.',
  },
  '/alerts': {
    verdict: 'live', dataSource: 'external',
    note: 'CryptoCompare egress gated behind isLivePricesEnabled(). Live prices useQuery has enabled: isLivePricesEnabled() and refetchInterval removed — no auto-poll. Ticker hidden when off (shows "enable in Settings" note). checkNow remains user-triggered (calls fetchMarketPricesUsd on demand — intentional opt-in action). Alert CRUD on base44.entities.PriceAlert is real. On-device trigger evaluation unchanged.',
  },

  // ── Connect group (audit batch 5) ─────────────────────────────────────────
  '/address-book': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'Pure CRUD on base44.entities.AddressBook (local IndexedDB). Address entry is validated on save via isValidAddressForCurrency/addressKindLabel from lib/addressValidation — the same validators used by the Send flow. No external call, no fabricated data, no USD conversion.',
  },
  '/watch-wallets': {
    verdict: 'live', dataSource: 'base44-entities',
    note: 'MOCK array and USD_RATES removed. Empty state shows honest empty UI (no fake Vitalik.eth / Whale #1 entries). USD value computation removed — cards now show native balance only (or "—" when balance is zero). Watch-only wallet CRUD and copy/explorer links remain fully functional.',
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
    verdict: 'live', dataSource: 'wallet-core',
    note: 'Address derived on-device via ed25519 SLIP-0010 (m/44\'/501\'/0\'/0\', same as Phantom) from useWallet().solAccount. Balance fetched live from Solana devnet RPC via getBalanceSol("devnet", address) from wallet-core/sol/provider — no hardcoded constants. Receive address shown with copy + devnet explorer link. Send not yet wired (labeled "Coming soon"); devnet-only until Solana send signing is audited.',
  },
  '/price-charts': {
    verdict: 'live', dataSource: 'external',
    note: 'generateOHLCV() Math.random fabrication removed. Real OHLCV fetched from CryptoCompare fetchOHLCV() (histominute/histohour/histoday per period). Gated behind isLivePricesEnabled() — no fetch when off, shows Enable banner. Symbol is user-selected from fixed TOP_CRYPTOS list (not derived from holdings). staleTime: 60s.',
  },
  '/gas-fees': {
    verdict: 'live', dataSource: 'wallet-core',
    note: 'FeeSelector calls estimateEvmFeeTiers, estimateBtcFeeTiers, estimateSolFeeTiers from wallet-core providers (testnet/devnet only via CHAINS config). The selected fee in native units (wei/sat/lamports) is the authoritative value that flows into the Send signing path. usdRate constants are used only to display an approximate fiat estimate alongside the native fee — not as a financial record.',
  },
  '/connect': {
    verdict: 'live', dataSource: 'on-device',
    note: 'Uses real browser wallet injection (window.ethereum for MetaMask/Coinbase, window.solana for Phantom). Balance reads go through the injected provider API (eth_getBalance) or a public Solana JSON-RPC call (user-initiated, single request on connect, not a background feed). Imports to base44.entities.Wallet as a read-only snapshot with an honest disclosure. No private key access.',
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
  '/plans': {
    verdict: 'live', dataSource: 'static',
    note: 'Display-only tier cards rendered from TierProvider (currentTier always "free") and PRO_FEATURES from lib/tier. The upgrade button is permanently disabled with an honest disclosure: "no payment system is active" and "no payment can be made on this screen." Preview disclosure banner explicitly warns pricing is not final. No fabricated capabilities listed as currently available.',
  },
  '/referrals': {
    verdict: 'live', dataSource: 'on-device',
    note: 'Referral tracker page: displays user referral code and tracks referral conversions from on-device storage. No external data fabrication; referral code derived deterministically from wallet seed.',
  },

  // ── Cut paths (spec §4 — off-wedge) ──────────────────────────────────────
  // Page files, routes, and imports removed. Entries kept so cutPaths() and
  // the featureRegistry gate remain accurate. Any direct navigation returns
  // PageNotFound via the router catch-all.
  '/leaderboard':       { verdict: 'cut', reason: 'off-wedge', dataSource: 'invented', note: 'Social leaderboard cut: no social graph, targeting vector, off-wedge for self-custody.' },
  '/public-profiles':   { verdict: 'cut', reason: 'off-wedge', dataSource: 'invented', note: 'Public profiles cut: social identity exposure conflicts with deniability model.' },
  '/shared-portfolio':  { verdict: 'cut', reason: 'off-wedge', dataSource: 'invented', note: 'Shared portfolio cut: requires social graph, off-wedge.' },
  '/advisor':           { verdict: 'cut', reason: 'off-wedge', dataSource: 'invented', note: 'AI portfolio advisor cut: fabricated AI advice, off-wedge.' },
  '/ai-assistant':      { verdict: 'cut', reason: 'off-wedge', dataSource: 'invented', note: 'AI assistant cut: LLM dependency, off-wedge.' },
  '/what-if':           { verdict: 'cut', reason: 'off-wedge', dataSource: 'invented', note: 'What-if simulator cut: fabricated price projections, off-wedge.' },
  '/smart-alerts':      { verdict: 'cut', reason: 'off-wedge', dataSource: 'invented', note: 'Smart alerts cut: AI/ML dependency, off-wedge.' },
  '/web3':              { verdict: 'cut', reason: 'off-wedge', dataSource: 'invented', note: 'Web3 browser cut: embedded browser scope, off-wedge.' },
  '/messenger-alerts':  { verdict: 'cut', reason: 'off-wedge', dataSource: 'invented', note: 'Messenger alerts cut: third-party messaging dependency, off-wedge.' },
  '/split-bill':        { verdict: 'cut', reason: 'off-wedge', dataSource: 'invented', note: 'Split bill cut: social payments, off-wedge.' },
  '/ai-rebalancer':     { verdict: 'cut', reason: 'off-wedge', dataSource: 'invented', note: 'AI rebalancer cut: autonomous value movement, off-wedge.' },
  '/erc20-discovery':   { verdict: 'cut', reason: 'off-wedge', dataSource: 'invented', note: 'ERC-20 discovery cut: third-party token indexer dependency, off-wedge.' },
  '/products':          { verdict: 'cut', reason: 'off-wedge', dataSource: 'invented', note: 'Products page cut: marketing page, off-wedge.' },
  '/walletconnect':     { verdict: 'live', dataSource: 'on-device', note: 'WalletConnect v2 transport + signing (D1+D2). Pairing + session management via WC relay; signing via on-device key derivation (withPrivateKey). eth_sendTransaction display-only pending D3 testnet verification.' },
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
