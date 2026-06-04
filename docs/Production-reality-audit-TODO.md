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
