# Veyrnox — Production-Reality Audit (TODO, next session)

> Finding from the 2026-06-04 demo walkthrough: the UI audit (UI-audit-findings.md,
> 28 Criticals) was the tip. The nav has 83 items; only ~33 are accounted for.
> ~50 remain UNVERIFIED for production-reality — do they show real data / call real
> wallet-core, or render seeded/random data like the demo-ware we already removed?
> This is a dedicated audit pass, not a quick check. Same methodology as the UI audit.

## What "production-reality" means
For each page, classify as:
- REAL — calls real wallet-core / vault / RPC; functions in a release build (VITE_RELEASE=1).
- HONEST-DISABLED — gates by a mode flag (LLM_AVAILABLE / EMAIL_AVAILABLE / DEMO_MODE)
  and shows an honest "unavailable" state when off.
- FAKE — renders fabricated/seeded/Math.random data presented as real, in BOTH demo
  and production. (Same class as the 3 known-fake pages below.)
- DEAD — non-functional buttons / orphaned.

## Methodology (per page)
1. Does it import/gate on a mode flag? `grep "DEMO_MODE|LLM_AVAILABLE|EMAIL_AVAILABLE|VITE_RELEASE"`.
2. Does it call real wallet-core / RPC, or fabricate? `grep "Math.random|demoClient|seeded|mock"` + check data source.
3. In a release build (VITE_RELEASE=1, demo OFF), does it show real data, empty state, or fake data?
   FAKE-in-release is the liability — it lies to a real user.

## Already accounted for (do NOT re-audit)
REAL: Send (ETH/Sepolia only), Receive, Transaction History, vault/keystore,
Security Dashboard, Address Screening, Stealth Wallets, Anomaly Detection,
Spending/Budget Limits, Duress PIN, Panic Wipe, Pre-Sign Scanner, Seed Key QR
(fixed PR #87), Audit Log.
HONEST-DISABLED: AI Assistant (PR #89), Hardware Wallets, LLM/email-gated paths.
KNOWN FAKE (next honest-disable batch): ERC-20 Discovery, Fraud Detection,
Solana/SPL (SolanaTokens).
Mode-gated (well-behaved, spot-check only): Dashboard, SendCrypto, StealthWallets,
DuressPin, PanicWipe, SecurityDashboard, NewsSentimentPage, SpamTokenFilter,
TokenApprovals, TransactionHistory, WalletAccessReset, AIPortfolioAdvisor, AIRebalancer.

## UNVERIFIED — audit these (~50). Prioritise the social/backend-dependent ones first
HIGH SUSPICION (smell like base44 social/backend demo-ware that needs a removed server):
- Referral Tracker (/referrals)
- Leaderboard (/leaderboard)
- Public Profile (/public-profiles)
- Share Portfolio (/shared-portfolio)
- Web3 Browser (/web3)
- Voice Commands (/voice-commands)
- Messenger Alerts (/messenger-alerts)

ALSO UNVERIFIED (real-vs-theatre unknown):
- Notifications (/notifications), Analytics (/analytics), Advanced Analytics,
  Benchmarking, What-If Simulator, Risk Score (/risk-score), Correlation Matrix,
  Event Timeline, Custom Widgets, News Sentiment
- Payment Links, Split Bill, TX Receipts, Fee Analytics, Tax Harvesting,
  HD Wallet Manager, Crypto Signing (Live), Recurring Payments, Convert
- Portfolio Rewind, Custom Index, AI Rebalancer, P&L Tracking, Risk Scoring
- Watchlist, NFT Portfolio, Multi-Chain NFT, Spending, Snapshots, On-Chain
- Savings Goals, Net Worth, Invoice Generator, Tax Report
- Session Manager, Messenger Alerts, Smart Alerts, Price Alerts, Token Approvals,
  Spam Filter, Token Spam Screening, dApp Domain Check, Biometric Auth
- Address Book, Watch Wallets, Live Balances (RPC), Network Manager, Price Charts,
  Gas Fees, Connect Wallet, Push Notifications
- Settings, Documentation, Features, Products

## Output
docs/UI-audit-findings.md style: per page -> classification + disposition
(keep / honest-disable / delete), then batch the work like tonight's deletes.

## Related
- docs/UI-audit-findings.md (first pass, 28 Criticals, 23 resolved)
- docs/Production-readiness.md ("UI honesty" is a launch-review blocker)

---

## Classifier run (2026-06-04) — MACHINE SIGNAL, NOT VERIFIED

> These tags come from a grep classifier over src/pages, not a code read. They are
> SIGNALS for the verify pass, NOT verdicts. Do NOT promote anything here into
> Feature-Status.md or Tiers.pricing.md until each page is individually verified.
>
> Tags: WALLET = touches real wallet-core (self-custody) · SVC = still reads the
> base44 local/demo data layer (UNWIRED — shell, not yet real custody, but not
> necessarily fake) · FAKE = fabricates data (Math.random/mock) · GATED = mode-aware.
>
> Key nuance: SVC ≠ remote server. base44 is now a local/demo data abstraction, so
> SVC means "not yet wired to the real vault," i.e. a retainable shell, not a lie.
> WALLET+SVC = real core mixed with some local/demo data — verify it isn't faking.

### Self-custody core — real wallet-core, retain candidates (WALLET, no FAKE)
ReceiveCrypto, WalletPortfolioPage, LiveBalances, GasFeeControl, SecurityScanner,
TrustScore, DAppSecurityAlerts, DuressPin, PanicWipe, WalletAccessReset,
WalletSeedQR (fixed #87). VERIFY-SVC: SuspiciousAddressChecker, StealthWallets,
SpamTokenFilter, TokenApprovals, SecurityDashboard, HDWalletManager, NetworkManager,
RecurringPayments, Settings. VERIFY-FAKE: TransactionHistory (WALLET+FAKE — real
core, some seeded data). SendCrypto (GATED+WALLET+FAKE+SVC — core send; FAKE = the
known latent 2FA Math.random, tracked separately).

### Known / suspected FAKE — fix or honest-disable
Known: ERC20Discovery (FAKE+SVC), SolanaTokens (FAKE), FraudDetection (SVC, fake AI scan).
Verify: MultiChainNFT, PaymentLinks, SharedPortfolioView (all FAKE+SVC).
Likely-cosmetic (verify, may be fine): PriceCharts (FAKE — probably sparkline noise),
Dashboard (FAKE+SVC — the demo tour; real equivalent is WalletPortfolioPage).

### Base44 data-layer shells — RETAINABLE, need wiring to real data (SVC, no WALLET/FAKE)
Not fake — read local/demo data, unwired to real vault/chain. Retain + connect:
Analytics, AdvancedAnalytics, PortfolioBenchmark, CorrelationMatrix,
AssetCorrelationTimeline, PortfolioRiskScore, RiskScoring, SpendingPatterns,
PLTracking, NetWorthTracker, Watchlist, NFTPortfolio, PortfolioSnapshots,
OnChainAnalytics, PortfolioRewind, CustomIndexBuilder, SavingsGoals, BudgetLimits,
InvoiceGenerator, TaxReport, FeeAnalytics, Calculator, AddressBook, SessionManager,
SecurityCenter, AnomalyDetection, AuditLogPage, PriceAlerts, SmartAlerts,
NotificationCentre, PushNotificationsPage.

### Product decision — may NOT fit serverless self-custody (need a backend)
Leaderboard, PublicProfiles, ReferralTracker, NewsSentimentPage. Decide whether a
no-server self-custody wallet should carry a social/identity layer at all.

### No tags — read needed
BiometricAuth, VoiceCommands, Web3Browser, CustomDashboardWidgets, Subscription,
HardwareWalletPage (honest "planned"), AIAssistant/AIPortfolioAdvisor/AIRebalancer
(honest-disabled, GATED+SVC).

### Rough buckets
~22 self-custody (WALLET) → retain · ~6-8 FAKE → fix/disable · ~40 SVC shells →
retainable, wire to real data · ~4 social/backend → product decision.

### Next step
Verify each page (methodology above), THEN update Feature-Status.md (confirmed-built)
and Tiers.pricing.md (confirmed differentiators) — never from these tags alone.
