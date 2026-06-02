# Veyrnox — Mock-vs-Real Honesty Audit (whole app)

> **REPORT ONLY.** This document triages every page/feature for honesty: does it
> render, does its primary action actually work, and is it backed by REAL logic
> (wallet-core crypto / real local state / real RPC / real 3rd-party API) or a
> DEMO/base44 **mock stub** (hardcoded/seeded data, faked results, or — worst —
> a claim of a protective result it does not deliver). Nothing here is "fixed" in
> this pass except where explicitly noted; the dangerous mocks are listed so they
> can be triaged separately.
>
> **Date:** 2026-06-02 · **Branch:** `fix/security-center-and-mock-audit` ·
> **Scope:** all 103 routed pages in `src/pages/`.

## How to read "real vs mock"
- **`src/api/base44Client.js`** returns either a real base44 backend client or
  **`demoBase44`** (`src/api/demoClient.js`) — a fully client-side mock returning
  seeded/empty data. A page that calls `base44.entities.X` is "real" only to the
  extent the backend behind it is real; in demo (`?demo=1`) it is seeded data.
- **REAL** = primary action backed by `src/wallet-core/*` crypto, real on-device
  state (localStorage/IndexedDB), or real RPC/explorer/3rd-party API.
- **PARTIAL** = some real plumbing, but the headline result is partly seeded/faked.
- **MOCK (honest demo)** = obviously-seeded data, no false security claim.
- **DISHONEST MOCK (dangerous)** = a **security** feature that asserts a protective
  result it did not compute (e.g. "Safe to Sign", "appears legitimate", "Audit
  verified · Safe to connect", "RASP active — monitoring", "keys in secure
  enclave"). **These create false assurance in a security product — the most
  harmful class.**

## Headline counts
| Class | Count |
|---|---|
| 🟢 REAL & working | 41 |
| 🟡 PARTIAL | 7 |
| ⚪ MOCK — honest demo | 49 |
| 🔴 DISHONEST MOCK (dangerous false claim) | 6 |
| **Total pages** | **103** |

**Fixed in THIS PR (were dangerous theatre, now honest enforcement):**
Security Center **daily transaction limit** (was saved-but-never-read) and
**session revocation** (wrote `status:"revoked"` that nothing read). See Part 1
in the PR description and the notes below. They are therefore **not** counted in
the 🔴 row above.

---

## 🔴 DISHONEST MOCK — dangerous false security claims (TRIAGE FIRST)
These pages tell the user something is *safe / protected / verified* based on
hardcoded or trivially-seeded data. **Report-only — not fixed in this pass.**

| Page | Route | Renders | Action works | Real/Mock | Note (the false claim) |
|---|---|---|---|---|---|
| SecurityScanner | /security-scanner | yes | no | DISHONEST | Labels seeded `SAMPLE_TXS` **"Safe to Sign"**; claims to decode+simulate+score any tx but returns canned verdicts. (Previously identified.) |
| SuspiciousAddressChecker | /address-checker | yes | no | DISHONEST | Green **"Address appears legitimate"** from trivial pattern checks (it does add a "verify independently" caveat, but the green verdict is false assurance). (Previously identified.) |
| DAppSecurityAlerts | /dapp-alerts | yes | partial | DISHONEST | Banner **"No threats detected · Audit verified · Safe to connect"** rendered over a hardcoded URL/risk list — no real scan. |
| RASPSecurity | /rasp | yes | no | DISHONEST | **"RASP is active — monitoring all runtime operations"** + fake blocked-IPs/rules; zero runtime protection exists. |
| SamsungKeystore | /samsung-keystore | yes-caveat | no | DISHONEST | Fakes **"Knox Keystore v3.1 detected"** / **"Private keys stored in secure enclave"**; keys are not in any TEE — the whole detect/protect flow is simulated. |
| TrustScore | /trust-score | yes | no | DISHONEST | **"powered by on-chain analysis"** + **"token appears legitimate with strong on-chain signals"**; score is a hardcoded allow/deny list + seeded hash, no chain reads. |

> Honorable-mention (non-security false claim, not counted above):
> **NewsSentimentPage** (/news-sentiment) frames seeded `MOCK_NEWS` as "AI
> real-time sentiment"; misleading marketing, but no security assurance — listed
> under MOCK (honest demo) with a caveat.

---

## 🟢 REAL & working
Primary action backed by wallet-core crypto, real local state, real RPC, or real APIs.

| Page | Route | Renders | Action works | Note |
|---|---|---|---|---|
| SendCrypto | /send | yes | yes | REAL EVM sign+broadcast (wallet-core/evm/send) to Sepolia; live RPC simulation; local poison screen; **now also enforces per-tx + daily limits** (this PR). |
| ReceiveCrypto | /receive | yes | yes | Real wallet-core-derived EVM/BTC/SOL receive addresses (lib/receiveAddress). |
| HDWalletManager | /hd-wallet | yes | yes | Real BIP-39/44 derivation, vault encryption, unlock; live balances. |
| CryptoSigning | /crypto-signing | yes | yes | Real BIP-39 gen, HD derivation, EIP-191 signing — client-side. |
| WalletAccessReset | /wallet-access | yes | yes | Real keyStore changePassword + seed recovery (importWallet). |
| WalletSeedQR | /wallet-seed-qr | yes | yes | Generates QR from user seed locally; no network exposure. |
| TokenApprovals | /token-approvals | yes | yes | Real ERC-20 approval scan, calldata build, revoke broadcast (wallet-core). |
| GasFeeControl | /gas-fees | yes | yes | Live fee tiers via wallet-core providers (testnet RPC). |
| TransactionHistory | /tx-history | yes | yes | Real per-chain history via RPC/explorer (lib/txHistory); demo seeds samples. |
| LiveBalances | /live-balances | yes | yes | Real ETH balance via rpcProxy + Ethplorer token discovery + live gas. |
| SpamTokenFilter | /spam-filter | yes | yes | Real wallet-core/evm/spam heuristics + localStorage overrides; honest "heuristic". |
| DuressPin | /duress-pin | yes | yes | Real wallet-core/duress decoy vault + unlock path. |
| StealthWallets | /stealth-wallets | yes | yes | Real wallet-core/stealth hidden-wallet crypto + reveal/derivation. |
| PanicWipe | /panic-wipe | yes | yes | Real wallet-core/panic destruction of local key material; dual trigger. |
| SecurityDashboard | /security-dashboard | yes | yes | Aggregates real local signals (lib/securityPosture); never claims "safe". |
| Settings | /settings | yes | partial | Real biometric/passkey unlock gates + auto-lock (WalletProvider.lock); theme; delete. |
| Register | /register | yes | yes | Email/OTP + real biometric gate (lib/biometric); labelled provisional. |
| Login | /login | yes | yes | Real base44.auth.loginViaEmailPassword. |
| ForgotPassword | /forgot-password | yes | yes | Honest: resets account login only, points to seed recovery for vault. |
| AccountAccess | /account-access | yes | yes | Real base44 CRUD + localStorage; genuine role matrix. |
| AddressBook | /address-book | yes | yes | Real CRUD + addressValidation (wallet-core). |
| WatchWallets | /watch-wallets | yes | yes | Stores watch-only addresses; explorer links + balances. |
| AuditLogPage | /audit | yes | yes | Real AuditLog entity with filtering/categories. |
| BudgetLimits | /budget | yes | yes | Real CRUD; spend summed from actual transaction records. |
| Calculator | /calculator | yes | yes | Live price fetch (CryptoCompare); real conversion. |
| ConnectWallet | /connect | yes | yes | Real MetaMask/Phantom/Coinbase connectors (eth_requestAccounts/getBalance). |
| Community | /community | yes | yes | Real SharedWatchlist CRUD + follow. |
| InvoiceGenerator | /invoices | yes | yes | Real invoice CRUD + local PDF/preview + copy link. |
| MerchantQR | /merchant-qr | yes | yes | Real payment-link CRUD + QR. |
| MultiChainNFT | /nft-multichain | yes | yes | Real NFT CRUD + P&L; marketplace links. |
| NFTPortfolio | /nft | yes | yes | Real NFT CRUD + value/P&L from local data. |
| NetWorthTracker | /net-worth | yes | yes | Real net-worth from stored wallets + manual assets/liabilities. |
| OnChainAnalytics | /onchain | yes | yes | Aggregates real internal Transaction/Wallet entities. |
| NotificationCentre | /notifications | yes | n/a | Real alerts from base44 entities; dismiss works. |
| PushNotificationsPage | /push | yes | yes | Real browser Notification API + localStorage prefs. |
| VoiceCommands | /voice-commands | yes | yes | Real Web Speech API; navigates to real routes. |
| CustomDashboardWidgets | /dashboard-widgets | yes | yes | Real localStorage widget state + drag-reorder. |
| Documentation | /docs | yes | yes | Static catalogue; honest available-vs-roadmap. |
| Features | /features | yes | yes | Static catalogue; honest available-vs-roadmap. |
| LandingPage | /landing | yes | n/a | Marketing; real route links. |

---

## 🟡 PARTIAL — real plumbing, partly seeded/faked headline
| Page | Route | Renders | Action works | Note |
|---|---|---|---|---|
| SecurityCenter | /security | yes | yes | **Fixed this PR:** per-tx limit (already enforced) + **daily limit now enforced** (lib/txLimits, summed from local tx history) and **session revocation now locally enforced** (SessionRevocationGuard locks wallet + re-auth). Underlying session/limit **store is still base44** (seeded in demo). |
| Dashboard | / | yes | yes | Real wallet/tx queries; values seeded in demo, no live RPC sync there. |
| TaxReport | /tax | yes | yes | Real FIFO cost-basis engine; historical prices simulated. |
| PriceAlerts | /alerts | yes | partial | Live prices (CryptoCompare) real; alert store/trigger in base44. |
| WatchlistPage | /watchlist | yes | yes | Real watchlist CRUD; prices hardcoded (MOCK_PRICES), not live. |
| BiometricAuth | /biometric-auth | yes | partial | Real WebAuthn/passkey registration; "test" button is a fake 1.5s delay. |
| MessengerAlerts | /messenger-alerts | yes | partial | Real localStorage config; "test" only checks fields — no real Telegram/WhatsApp send. |

---

## ⚪ MOCK — honest demo (seeded data, no false security claim)
Real UI/UX over seeded/base44 data; safe to ship as demo as long as not sold as live.

| Page | Route | Renders | Action works | Note |
|---|---|---|---|---|
| AIAssistant | /ai-assistant | yes | partial | base44.agents mock chat; "Veyrnox AI" without a real LLM. |
| AIPortfolioAdvisor | /advisor | yes | partial | InvokeLLM over mock portfolio; seeded response. |
| AIRebalancer | /ai-rebalancer | yes | partial | "AI Analysis" → InvokeLLM; seeded result. |
| AnomalyDetection | /anomaly-detection | yes | partial | **Real** detectAnomalies (wallet-core/anomaly) over **seeded** tx history; honest, demo inputs. |
| FraudDetection | /fraud | yes | partial | Seeded fraud alerts; no real detection engine. |
| RiskScoring | /risk | yes | yes | Real scoring formula over seeded wallets + hardcoded volatility. |
| PortfolioRiskScore | /risk-score | yes | n/a | Risk formula real; inputs seeded + hardcoded volatility. |
| AdvancedAnalytics | /advanced-analytics | yes | yes | Hardcoded correlation/volatility tables. |
| Analytics | /analytics | yes | yes | Real wallet/tx queries; monthly P&L simulated from seeds. |
| AssetCorrelationTimeline | /correlation-timeline | yes | yes | Hardcoded price series + event impacts. |
| CorrelationMatrix | /correlation | yes | yes | Hardcoded correlation coefficients; educational. |
| SpendingPatterns | /spending | yes | yes | Charts/insights from seeded transactions; display only. |
| FeeAnalytics | /fee-analytics | yes | yes | Seeded transaction fees; charts. |
| PLTracking | /pl | yes | partial | Trade records in base44 + hardcoded prices. |
| PortfolioBenchmark | /benchmark | yes | n/a | Synthetic benchmark (seeded sin curves). |
| PortfolioRewind | /portfolio-rewind | yes | n/a | Hardcoded historical multipliers. |
| PortfolioSnapshots | /snapshots | yes | partial | Snapshots saved to base44; UI tracking only. |
| PriceCharts | /price-charts | yes | n/a | Synthetic OHLCV via Math.random. |
| WhatIfSimulator | /what-if | yes | yes | Real calc; hardcoded historical prices. |
| BlockExplorer | /block-explorer | yes | yes | Procedurally-faked tx/address/block details (not a real explorer). |
| CarbonTracker | /carbon | yes | partial | Hardcoded emission factors/offsets; "carbon neutral" from input. |
| CloudBackup | /cloud-backup | yes | partial | Fakes 2.5s upload; localStorage only, no real cloud/encryption sync. |
| CryptoWillPage | /will | yes | yes | Seeded inheritance entities; no real dead-man's-switch. |
| CustomIndexBuilder | /index-builder | yes | yes | Index CRUD in base44; no real tracking. |
| ERC20Discovery | /erc20-discovery | yes | partial | Random subset of known tokens + faked balances; honest demo. |
| DAppConnector | /dapp-connect | yes | partial | URI/QR gen works; session list seeded; no real relay. |
| WalletConnectPage | /walletconnect | yes | partial | Simulated URI parse/session; no real relay/signing. |
| Web3Browser | /web3 | yes-caveat | n/a | Hardcoded dApp list; "launch" opens external link. |
| HardwareWalletPage | /hardware-wallet | yes | partial | Stores fingerprint; "connect" fakes 1.8s, no real probe. |
| Leaderboard | /leaderboard | yes | partial | Hardcoded MOCK_LEADERS fallback. |
| LoginActivityMap | /login-map | yes | partial | Sessions on a map; MOCK_LOCATIONS fallback + jitter. |
| NFTGallery | /nft-gallery | yes | n/a | DEMO_NFTS hardcoded display. |
| NetworkManager | /network-manager | yes | partial | DEFAULTS + custom RPC add; switching updates local state only. |
| NewsSentimentPage | /news-sentiment | yes | partial | Seeded MOCK_NEWS framed as "AI sentiment" — **misleading framing** (non-security). |
| Onboarding | /onboarding | yes | partial | Creates wallet entry in base44; real localStorage flag; demo addresses. |
| PaymentLinks | /payment-links | yes | partial | Shareable links in base44; no payment execution. |
| Products | /products | yes | partial | Mock product catalogue CRUD. |
| PublicProfiles | /public-profiles | yes | partial | Mock profile metadata. |
| RecurringPayments | /recurring | yes | no | **Honest stub:** explicitly "schedules reminders only, never moves funds"; redirects to Send to sign. |
| ReferralTracker | /referrals | yes | partial | Referral tracking in base44; no real settlement. |
| ResetPassword | /reset-password | yes | partial | base44.auth.resetPassword; backend mocked. |
| SavingsGoals | /savings | yes | yes | Seeded SavingsGoal CRUD. |
| SessionManager | /session-manager | yes | yes | Lists/revokes UserSession (seeded); **revocation of THIS device now locally enforced** (this PR); copy made honest. |
| SharedPortfolioView | /shared-portfolio | yes | yes | PortfolioShare CRUD; links are local URLs only. |
| SmartAlerts | /smart-alerts | yes | yes | SmartAlert CRUD; no live monitoring/delivery. |
| SolanaTokens | /solana | yes | yes | Hardcoded SPL list; send dialog UI-only; read-only DeFi displays. |
| SplitBill | /split-bill | yes | yes | Split-bill CRUD + share math; no settlement. |
| TaxHarvesting | /tax-harvest | yes-caveat | partial | Real loss ID over hardcoded rates/cost-basis; "sell" buttons don't broadcast. |
| TransactionReceipt | /receipt | yes | yes | Receipt template from stored tx; local print. |
| TronWallet | /tron | yes | n/a | Hardcoded TRON address/TRC-20; buttons inert. |

---

## What this PR changed (Parts 1–2 — the only code/doc changes)
- **Daily transaction limit (Part 1a):** `src/lib/txLimits.js` sums **today's**
  sends (USD) from the **same local tx-history records** the Send flow already
  loads (`base44.entities.Transaction`), scoped per-currency or ALL, using the
  local clock for "today". The Send flow blocks (disabled Continue + clear
  message) **and** re-checks at signing time (defense-in-depth). Security Center
  now shows each daily cap's "sent today". **No new backend, no phone-home.**
- **Session revocation (Part 1b):** `src/lib/sessionRevocation.js` +
  `src/components/SessionRevocationGuard.jsx` (mounted in Layout) enforce
  revocation **honestly and locally**: when THIS device's session record is
  revoked, the wallet **locks** (drops the in-memory secret) and the device is
  signed out (re-auth required). It does **not** fake remote real-time kill of
  other devices (no push channel exists) — other devices self-enforce on next
  open. UI copy in Security Center / Session Manager states this scope honestly.
- **Tiers.pricing.md (Part 2):** multi-sig removed from the Guardian tier;
  Guardian reworded to genuinely-offered services (1:1 setup, threat model,
  recovery/inheritance setup assistance, quarterly review, priority support,
  **DFIR advisory**). No tier offers multi-sig; the only remaining mentions are
  explicit "❌ removed" records.

## Trivial wiring bugs fixed during the audit
None encountered — the audit was read-only and the only changes are the scoped
Parts 1–2.

## Crypto note
**No wallet-core crypto/signing was touched.** `vault.js`, `vaultStore.js`,
`signing.js`, derivation, and the keystore are unchanged. Parts 1–2 are pure
app-layer logic (limit arithmetic over already-loaded records; the existing
`WalletProvider.lock()` path; a docs edit). Verified: full suite 300/300 green
and `check:rng` green.

## Recommended triage order (for the 🔴 dangerous mocks)
1. Remove or hard-gate the false-assurance verdicts first: SecurityScanner
   ("Safe to Sign"), SuspiciousAddressChecker ("appears legitimate"),
   DAppSecurityAlerts ("Safe to connect · Audit verified").
2. Then the fake-protection theatre: RASPSecurity ("monitoring active"),
   SamsungKeystore ("keys in secure enclave"), TrustScore ("on-chain analysis").
   Each should either be wired to real analysis or relabelled as a
   non-protective demo / removed from the security surface.
